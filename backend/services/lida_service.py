"""LIDA service — analyze tabular data, suggest filters and chart goals.

Wraps Microsoft LIDA. Falls back to a pandas-based heuristic summary when the
LIDA package or its underlying LLM provider is unavailable so that the
"detect filters" feature still works in minimal environments.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from backend.core.security import decrypt_api_key


class LIDAService:
    """Tabular profiling + chart suggestion using LIDA, with a pandas fallback."""

    def __init__(self, org_settings: dict | None = None):
        self.org_settings = org_settings or {}
        self._manager = None
        try:
            from lida import Manager, llm  # type: ignore

            provider = self.org_settings.get("llm_provider") or "openai"
            model = self.org_settings.get("llm_model") or "gpt-4o-mini"
            api_key = decrypt_api_key(self.org_settings.get("llm_api_key_encrypted", ""))
            if api_key:
                self._manager = Manager(text_gen=llm(provider=provider, api_key=api_key, model=model))
        except Exception:
            self._manager = None

    # ── Public API ───────────────────────────────────────────────────────

    async def summarize(self, columns: list[str], rows: list[list]) -> dict:
        df = pd.DataFrame(rows, columns=columns)
        if self._manager is not None:
            try:
                summary = self._manager.summarize(df)
                return self._normalize_summary(summary, df)
            except Exception:
                pass
        return self._heuristic_summary(df)

    async def suggest_chart(self, columns: list[str], rows: list[list]) -> dict:
        df = pd.DataFrame(rows, columns=columns)
        if self._manager is not None:
            try:
                summary = self._manager.summarize(df)
                goals = self._manager.goals(summary, n=1)
                if goals:
                    g = goals[0]
                    return {
                        "chart_type": getattr(g, "visualization", "bar"),
                        "rationale": getattr(g, "rationale", ""),
                        "question": getattr(g, "question", ""),
                    }
            except Exception:
                pass
        return self._heuristic_chart(df)

    async def detect_filters(self, columns: list[str], rows: list[list]) -> list[dict]:
        summary = await self.summarize(columns, rows)
        filters: list[dict] = []
        for field in summary.get("fields", []):
            dtype = field.get("dtype", "")
            name = field["name"]

            if dtype in ("string", "object", "category"):
                num_unique = field.get("num_unique", 0)
                if 0 < num_unique <= 50:
                    filters.append({
                        "column": name,
                        "type": "select",
                        "options": (field.get("categories") or [])[:50],
                    })
            elif dtype in ("date", "datetime", "datetime64[ns]"):
                filters.append({
                    "column": name,
                    "type": "date_range",
                    "min": field.get("min"),
                    "max": field.get("max"),
                })
            elif dtype in ("int64", "float64", "int32", "float32", "number"):
                filters.append({
                    "column": name,
                    "type": "number_range",
                    "min": field.get("min"),
                    "max": field.get("max"),
                })
        return filters

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _normalize_summary(summary: Any, df: pd.DataFrame) -> dict:
        """LIDA returns a Summary-like object — coerce to plain dict."""
        if isinstance(summary, dict):
            return summary
        try:
            return dict(summary)
        except Exception:
            return {"fields": LIDAService._heuristic_summary(df)["fields"]}

    @staticmethod
    def _heuristic_summary(df: pd.DataFrame) -> dict:
        fields: list[dict] = []
        for col in df.columns:
            series = df[col]
            dtype = str(series.dtype)
            entry: dict = {"name": col, "dtype": dtype, "num_unique": int(series.nunique(dropna=True))}

            if pd.api.types.is_numeric_dtype(series):
                entry["min"] = float(series.min()) if not series.empty else None
                entry["max"] = float(series.max()) if not series.empty else None
            elif pd.api.types.is_datetime64_any_dtype(series):
                entry["dtype"] = "datetime"
                entry["min"] = series.min().isoformat() if not series.empty else None
                entry["max"] = series.max().isoformat() if not series.empty else None
            else:
                entry["dtype"] = "string"
                if entry["num_unique"] <= 100:
                    entry["categories"] = [str(v) for v in series.dropna().unique().tolist()[:100]]
            fields.append(entry)
        return {"fields": fields, "row_count": len(df)}

    @staticmethod
    def _heuristic_chart(df: pd.DataFrame) -> dict:
        if df.empty:
            return {"chart_type": "bar", "rationale": "no data"}
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
        if numeric_cols and cat_cols:
            return {"chart_type": "bar", "x": cat_cols[0], "y": numeric_cols[0]}
        if len(numeric_cols) >= 2:
            return {"chart_type": "scatter", "x": numeric_cols[0], "y": numeric_cols[1]}
        if numeric_cols:
            return {"chart_type": "histogram", "x": numeric_cols[0]}
        return {"chart_type": "bar"}
