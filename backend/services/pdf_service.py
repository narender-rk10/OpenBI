"""PDF service — generate branded PDF reports from dashboards.

The PDF mirrors the on-screen dashboard: it follows the active theme (dark or
light), preserves the dashboard's orientation/aspect, and lays widgets out on a
single page sized to the dashboard so nothing is clipped or dropped across page
breaks. Chart images are captured client-side from the AntV canvas (already
themed); when that is unavailable we re-render server-side with matplotlib.
"""

import base64
import io
import json
import math
import os
from datetime import datetime

from bson import ObjectId
from jinja2 import Environment, FileSystemLoader

# ── Theme palettes (mirror frontend index.css :root / .dark) ────────────────

_LIGHT = {
    "is_dark": False,
    "page_bg": "#ffffff",
    "card_bg": "#ffffff",
    "border": "#e5e5e5",
    "text": "#171717",
    "muted": "#6b7280",
    "table_header_text": "#ffffff",
    "table_stripe": "#f9fafb",
    "exec_bg": "#f8fafc",
}

_DARK = {
    "is_dark": True,
    "page_bg": "#0a0a0a",
    "card_bg": "#161616",
    "border": "#2e2e2e",
    "text": "#f5f5f5",
    "muted": "#8c8c8c",
    "table_header_text": "#f5f5f5",
    "table_stripe": "#1c1c1c",
    "exec_bg": "#161616",
}


def _build_theme(is_dark: bool, branding: dict) -> dict:
    """Resolve a full theme dict (palette + brand-derived accents)."""
    t = dict(_DARK if is_dark else _LIGHT)
    primary = branding.get("primary_color") or "#1a1a2e"
    accent = branding.get("accent_color") or "#0f3460"
    if is_dark:
        # Brand navy/black is invisible on a dark page — use a bright accent.
        t["title"] = "#f5f5f5"
        t["heading"] = "#e94560"
        t["accent"] = "#e94560"
        t["table_header_bg"] = "#232323"
    else:
        t["title"] = primary
        t["heading"] = primary
        t["accent"] = accent
        t["table_header_bg"] = primary
    return t


def _render_g2_to_png(
    g2_spec: dict, data_columns: list, data_rows: list, is_dark: bool = False
) -> bytes | None:
    """Render a G2 spec as a PNG using matplotlib, honoring the active theme."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        encode = g2_spec.get("encode", {})
        x_field = encode.get("x")
        y_field = encode.get("y")
        color_field = encode.get("color")
        mark_type = g2_spec.get("type", "interval")

        # Pie uses theta coordinate
        if g2_spec.get("coordinate", {}).get("type") == "theta":
            mark_type = "pie"

        if not x_field or not data_columns or not data_rows:
            return None

        col_idx = {c: i for i, c in enumerate(data_columns)}

        title_cfg = g2_spec.get("title", "")
        if isinstance(title_cfg, dict):
            title = title_cfg.get("title", "")
        else:
            title = str(title_cfg)

        x_title = g2_spec.get("axis", {}).get("x", {}).get("title", x_field or "")
        y_title = g2_spec.get("axis", {}).get("y", {}).get("title", y_field or "")
        theme_colors = g2_spec.get("theme", {}).get("color10", ["#e94560", "#0f3460", "#1a1a2e"])

        # Theme-aware canvas + text colors
        bg = "#161616" if is_dark else "white"
        fg = "#e2e8f0" if is_dark else "#1a1a2e"
        axis_fg = "#94a3b8" if is_dark else "#374151"

        fig, ax = plt.subplots(figsize=(8, 4.5))
        fig.patch.set_facecolor(bg)
        ax.set_facecolor(bg)
        ax.tick_params(colors=axis_fg, labelcolor=axis_fg)
        for spine in ax.spines.values():
            spine.set_color(axis_fg)

        if mark_type == "pie" and color_field and y_field:
            cat_field = color_field
            if cat_field not in col_idx or y_field not in col_idx:
                plt.close(fig); return None
            ci, vi = col_idx[cat_field], col_idx[y_field]
            labels = [str(row[ci]) for row in data_rows[:10] if ci < len(row)]
            values = []
            for row in data_rows[:10]:
                try:
                    values.append(float(row[vi]) if row[vi] is not None else 0)
                except (ValueError, TypeError):
                    values.append(0)
            wedges, texts, autotexts = ax.pie(
                values, labels=labels, colors=theme_colors[:len(labels)], autopct="%1.0f%%"
            )
            for txt in texts:
                txt.set_color(fg)
            ax.set_aspect("equal")

        elif x_field and y_field and x_field in col_idx and y_field in col_idx:
            xi, yi = col_idx[x_field], col_idx[y_field]

            if color_field and color_field in col_idx and color_field != x_field:
                # Multi-series
                ci = col_idx[color_field]
                from collections import defaultdict
                series_map: dict = defaultdict(dict)
                cats: list = []
                for row in data_rows[:50]:
                    if xi >= len(row) or yi >= len(row) or ci >= len(row):
                        continue
                    cat = str(row[xi])
                    ser = str(row[ci])
                    try:
                        val = float(row[yi]) if row[yi] is not None else 0
                    except (ValueError, TypeError):
                        val = 0
                    series_map[ser][cat] = val
                    if cat not in cats:
                        cats.append(cat)

                x_pos = range(len(cats))
                n_series = len(series_map)
                bar_w = 0.8 / max(n_series, 1)
                for s_i, (ser_name, ser_vals) in enumerate(list(series_map.items())[:8]):
                    offset = (s_i - n_series / 2 + 0.5) * bar_w
                    vals = [ser_vals.get(c, 0) for c in cats]
                    color = theme_colors[s_i % len(theme_colors)]
                    if mark_type in ("interval", "bar"):
                        ax.bar([p + offset for p in x_pos], vals, bar_w * 0.9, label=ser_name, color=color)
                    elif mark_type == "line":
                        ax.plot(x_pos, vals, label=ser_name, color=color, marker="o", linewidth=2)
                ax.set_xticks(list(x_pos))
                ax.set_xticklabels(cats, rotation=30 if len(cats) > 6 else 0, ha="right")
                legend = ax.legend(loc="upper right", fontsize=8)
                if legend:
                    legend.get_frame().set_facecolor(bg)
                    legend.get_frame().set_edgecolor(axis_fg)
                    for txt in legend.get_texts():
                        txt.set_color(fg)
            else:
                x_vals = [str(row[xi]) for row in data_rows[:30] if xi < len(row)]
                y_vals = []
                for row in data_rows[:30]:
                    try:
                        y_vals.append(float(row[yi]) if row[yi] is not None else 0)
                    except (ValueError, TypeError):
                        y_vals.append(0)
                color = theme_colors[0] if theme_colors else "#e94560"

                if mark_type in ("interval", "bar"):
                    ax.bar(range(len(x_vals)), y_vals, color=color)
                    ax.set_xticks(range(len(x_vals)))
                    ax.set_xticklabels(x_vals, rotation=30 if len(x_vals) > 6 else 0, ha="right")
                elif mark_type == "line":
                    ax.plot(range(len(x_vals)), y_vals, color=color, marker="o", linewidth=2)
                    ax.set_xticks(range(len(x_vals)))
                    ax.set_xticklabels(x_vals, rotation=30 if len(x_vals) > 6 else 0, ha="right")
                elif mark_type == "area":
                    ax.fill_between(range(len(y_vals)), y_vals, alpha=0.4, color=color)
                    ax.plot(range(len(y_vals)), y_vals, color=color, linewidth=2)
                    ax.set_xticks(range(len(x_vals)))
                    ax.set_xticklabels(x_vals, rotation=30 if len(x_vals) > 6 else 0, ha="right")
                elif mark_type == "point":
                    try:
                        x_num = [float(v) for v in x_vals]
                        ax.scatter(x_num, y_vals, color=color)
                    except ValueError:
                        ax.scatter(range(len(x_vals)), y_vals, color=color)
                else:
                    ax.bar(range(len(x_vals)), y_vals, color=color)
                    ax.set_xticks(range(len(x_vals)))
                    ax.set_xticklabels(x_vals, rotation=30 if len(x_vals) > 6 else 0, ha="right")
        else:
            plt.close(fig)
            return None

        if title:
            ax.set_title(title, fontsize=13, fontweight="bold", color=fg, pad=8)
        if x_title and mark_type != "pie":
            ax.set_xlabel(x_title, fontsize=10, color=axis_fg)
        if y_title and mark_type != "pie":
            ax.set_ylabel(y_title, fontsize=10, color=axis_fg)

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor=bg)
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception:
        return None


# ── Page-layout geometry ────────────────────────────────────────────────────

# Width (pt) of the widget area on the page. Height grows with the dashboard so
# the whole thing lands on one page at the dashboard's own aspect ratio.
_CONTENT_W_PT = 1040.0
_CELL_H_PX = 80.0   # GridStack cellHeight on screen
_GAP_PT = 6.0       # visual gap between widget cards
_MARGIN_PT = 28.0
_HEADER_H_PT = 70.0
_FOOTER_H_PT = 30.0


def _compute_layout(widget_renders: list, grid_width_px: float | None, columns: int) -> dict:
    """Position each widget absolutely (in pt) mirroring the GridStack layout.

    Returns page/content geometry and mutates each render with a ``box`` dict.
    """
    cols = columns if columns and columns > 0 else 12
    gw = grid_width_px if grid_width_px and grid_width_px > 0 else 1400.0
    scale = _CONTENT_W_PT / gw
    col_w = _CONTENT_W_PT / cols
    row_h = _CELL_H_PX * scale

    max_row = 1
    for r in widget_renders:
        pos = r.get("position", {})
        max_row = max(max_row, int(pos.get("y", 0)) + int(pos.get("h", 4)))

    for r in widget_renders:
        pos = r.get("position", {})
        x = int(pos.get("x", 0)); y = int(pos.get("y", 0))
        w = int(pos.get("w", 6)); h = int(pos.get("h", 4))
        r["box"] = {
            "left": round(x * col_w + _GAP_PT / 2, 1),
            "top": round(y * row_h + _GAP_PT / 2, 1),
            "width": round(max(w * col_w - _GAP_PT, 1), 1),
            "height": round(max(h * row_h - _GAP_PT, 1), 1),
        }

    return {
        "content_w": _CONTENT_W_PT,
        "content_h": round(max_row * row_h, 1),
    }


class PDFService:

    def __init__(self):
        template_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "report_templates",
        )
        os.makedirs(template_dir, exist_ok=True)
        self.jinja_env = Environment(loader=FileSystemLoader(template_dir))

    async def generate_dashboard_pdf(
        self,
        dashboard_id: str,
        db,
        chart_images: dict | None = None,
        options: dict | None = None,
    ) -> bytes:
        """Generate PDF from dashboard with all widgets.

        chart_images: optional dict of widget_id → base64 PNG captured by the frontend
        canvas. When provided, these are used directly instead of server-side re-rendering.

        options: optional rendering hints from the frontend —
            ``theme`` ("dark"|"light"), ``grid_width_px`` (rendered grid width),
            ``columns`` (grid column count). Scheduled/headless runs omit this and
            get a light-theme report.
        """
        chart_images = chart_images or {}
        options = options or {}
        is_dark = str(options.get("theme", "light")).lower() == "dark"
        # Actual on-screen positions captured from GridStack (widget_id → x/y/w/h).
        # These override stored positions so the PDF matches the rendered layout
        # exactly (GridStack compacts live but never persists it to the DB).
        live_layout = options.get("layout") or {}
        dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
        widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
        org = await db.organizations.find_one({})
        branding = org.get("settings", {}).get("branding", {}) if org else {}

        def _eff_pos(w: dict) -> dict:
            """Effective position — live on-screen layout wins over stored."""
            return live_layout.get(w.get("widget_id", "")) or w.get("position") or {
                "x": 0, "y": 0, "w": 6, "h": 4
            }

        widget_renders = []
        for widget in sorted(
            widgets,
            key=lambda w: (_eff_pos(w).get("y", 0), _eff_pos(w).get("x", 0)),
        ):
            cached = widget.get("cached_data") or {}
            render = {
                "title": widget.get("title", ""),
                "display_type": widget.get("display_type", "chart"),
                "data": cached,
                "position": _eff_pos(widget),
            }

            if widget.get("display_type") == "ai_summary":
                render["summary_text"] = widget.get("cached_text", "")

            elif widget.get("display_type") == "chart" and widget.get("chart_config"):
                config = widget["chart_config"]
                widget_id = widget.get("widget_id", "")
                img_bytes = None

                # 1. Use frontend-captured canvas image if available (best quality
                #    and already themed). Validate + re-encode via PIL so a corrupt/
                #    truncated upload can't blow up weasyprint later (it raises
                #    "Truncated File Read" mid-PDF); on any problem we fall through
                #    to the server-side render below.
                if widget_id in chart_images:
                    try:
                        import io as _io

                        from PIL import Image as _PILImage

                        raw = base64.b64decode(chart_images[widget_id], validate=True)
                        im = _PILImage.open(_io.BytesIO(raw))
                        im.load()
                        buf = _io.BytesIO()
                        im.save(buf, format="PNG")
                        img_bytes = buf.getvalue()
                    except Exception:
                        img_bytes = None

                # 2. Fall back to server-side matplotlib render from G2 spec
                if not img_bytes:
                    g2_spec = config.get("g2_spec")
                    if g2_spec:
                        img_bytes = _render_g2_to_png(
                            g2_spec,
                            cached.get("columns", []),
                            cached.get("rows", []),
                            is_dark=is_dark,
                        )

                # 3. Legacy Plotly fallback
                if not img_bytes:
                    try:
                        import plotly.graph_objects as go
                        import plotly.io as pio

                        paper = "#161616" if is_dark else "white"
                        fig = go.Figure(
                            data=config.get("plotly_data", []),
                            layout=config.get("plotly_layout", {}),
                        )
                        fig.update_layout(
                            paper_bgcolor=paper, plot_bgcolor=paper, width=700, height=400
                        )
                        img_bytes = pio.to_image(fig, format="png", engine="kaleido")
                    except Exception:
                        pass

                if img_bytes:
                    render["chart_image_base64"] = base64.b64encode(img_bytes).decode()

            elif widget.get("display_type") == "table":
                render["table_columns"] = cached.get("columns", [])
                render["table_rows"] = cached.get("rows", [])[:50]

            elif widget.get("display_type") == "kpi":
                if cached.get("rows"):
                    render["kpi_value"] = cached["rows"][0][0] if cached["rows"][0] else "N/A"
                    render["kpi_label"] = widget.get("title", "")

            widget_renders.append(render)

        # AI executive summary
        exec_summary = ""
        try:
            from backend.services.llm_client import call_llm

            summary_data = []
            for w in widget_renders:
                if w.get("data", {}).get("rows"):
                    summary_data.append({"title": w["title"], "sample": w["data"]["rows"][:5]})
            if summary_data:
                prompt = (
                    f"Write a 3-5 sentence executive summary for a business report.\n"
                    f"Dashboard: {dashboard['name']}\n"
                    f"Data summaries: {json.dumps(summary_data, default=str)}\n"
                    f"Be specific with numbers. Professional tone. No bullet points."
                )
                exec_summary = await call_llm(prompt)
        except Exception:
            pass

        theme = _build_theme(is_dark, branding)
        layout = _compute_layout(
            widget_renders,
            options.get("grid_width_px"),
            int(options.get("columns") or 12),
        )

        # Single page sized to the dashboard so orientation/aspect is preserved
        # and nothing is clipped or paginated away. Estimate the height the
        # header + exec summary will occupy so the grid never overlaps them.
        exec_h = 0.0
        if exec_summary:
            est_lines = max(2, math.ceil(len(exec_summary) / 110))
            exec_h = 44.0 + est_lines * 15.0
        page_w = layout["content_w"] + 2 * _MARGIN_PT
        page_h = (
            2 * _MARGIN_PT + _HEADER_H_PT + exec_h + layout["content_h"] + _FOOTER_H_PT
        )

        try:
            template = self.jinja_env.get_template("report.html")
        except Exception:
            return self._fallback_pdf(dashboard, widget_renders, exec_summary, branding, theme)

        html_content = template.render(
            title=dashboard.get("name", "Report"),
            description=dashboard.get("description", ""),
            generated_at=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
            executive_summary=exec_summary,
            widgets=widget_renders,
            branding=branding,
            logo_url=branding.get("logo_url"),
            theme=theme,
            page_w=round(page_w, 1),
            page_h=round(page_h, 1),
            content_h=layout["content_h"],
            margin=_MARGIN_PT,
        )

        from weasyprint import HTML
        return HTML(string=html_content).write_pdf()

    def _fallback_pdf(self, dashboard, widgets, summary, branding, theme=None):
        theme = theme or _build_theme(False, branding)
        primary = theme["heading"]
        bg = theme["page_bg"]
        text = theme["text"]
        muted = theme["muted"]
        card = theme["card_bg"]
        border = theme["border"]
        html = f"""<!DOCTYPE html><html><head><style>
body {{ font-family: Inter, sans-serif; padding: 40px; background: {bg}; color: {text}; }}
h1 {{ color: {primary}; }}
.widget {{ margin-bottom: 30px; page-break-inside: avoid; background: {card};
  border: 1px solid {border}; border-radius: 10px; padding: 16px; }}
.widget h3 {{ color: {primary}; }}
table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
th {{ background: {theme['table_header_bg']}; color: {theme['table_header_text']}; padding: 8px; text-align: left; }}
td {{ padding: 6px; border-bottom: 1px solid {border}; }}
img {{ max-width: 100%; }}
</style></head><body>
<h1>{dashboard.get('name', 'Report')}</h1>
<p style="color:{muted}">{dashboard.get('description', '')}</p>
<p style="color:{muted}; font-size:12px">Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
"""
        if summary:
            html += (
                f"<div style='background:{theme['exec_bg']}; border-left:4px solid {theme['accent']};"
                f" padding:12px; margin:20px 0; color:{text}'><strong>Executive Summary</strong><br>"
                f"{summary}</div>"
            )
        for w in widgets:
            if w.get("display_type") == "ai_summary":
                if w.get("summary_text"):
                    html += (
                        f"<div style='background:{theme['exec_bg']}; border-left:4px solid {theme['accent']};"
                        f" padding:12px; margin:20px 0; color:{text}'><strong>{w['title']}</strong><br>"
                        f"{w['summary_text']}</div>"
                    )
                continue
            html += f'<div class="widget"><h3>{w["title"]}</h3>'
            if w.get("chart_image_base64"):
                html += f'<img src="data:image/png;base64,{w["chart_image_base64"]}">'
            elif w.get("table_columns"):
                html += "<table><thead><tr>"
                html += "".join(f"<th>{c}</th>" for c in w["table_columns"])
                html += "</tr></thead><tbody>"
                for row in w.get("table_rows", [])[:30]:
                    html += "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>"
                html += "</tbody></table>"
            elif w.get("kpi_value"):
                html += (
                    f'<div style="text-align:center; font-size:32px; font-weight:bold;'
                    f' color:{primary}">{w["kpi_value"]}</div>'
                )
            html += "</div>"

        html += (
            f'<div style="margin-top:40px; border-top:1px solid {border}; padding-top:12px;'
            f' font-size:10px; color:{muted}; text-align:center">Generated by OpenBI</div>'
            "</body></html>"
        )

        from weasyprint import HTML
        return HTML(string=html).write_pdf()


pdf_service = PDFService()
