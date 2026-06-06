"""Chart rendering routes — generate/modify charts, render to PNG."""

import base64

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_user, get_db
from backend.services.chart_agent import chart_agent

router = APIRouter(prefix="/api/projects/{project_id}/charts")


class RenderChartRequest(BaseModel):
    columns: list[str]
    rows: list[list]
    chart_config: dict | None = None


class GenerateChartRequest(BaseModel):
    columns: list[str]
    rows: list[list]
    instruction: str = "auto"


@router.post("/generate")
async def generate_chart_config(
    project_id: str,
    body: GenerateChartRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate a G2 chart spec from a column/row dataset."""
    org = await db.organizations.find_one({})
    brand_colors = (
        org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None
    )
    config = await chart_agent.generate_chart(body.columns, body.rows, body.instruction, brand_colors)
    return {"chart_config": config}


@router.post("/render")
async def render_chart_png(
    project_id: str,
    body: RenderChartRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Render chart as PNG image (for Telegram, PDF, etc.)."""
    from backend.services.pdf_service import _render_g2_to_png

    config = body.chart_config
    if not config:
        org = await db.organizations.find_one({})
        brand_colors = (
            org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None
        )
        config = await chart_agent.generate_chart(body.columns, body.rows, "auto", brand_colors)

    # Try G2 matplotlib render first
    g2_spec = config.get("g2_spec")
    if g2_spec:
        png_bytes = _render_g2_to_png(g2_spec, body.columns, body.rows)
        if png_bytes:
            return Response(content=png_bytes, media_type="image/png")

    # Fallback: legacy Plotly render for older widgets
    try:
        import plotly.graph_objects as go
        import plotly.io as pio

        fig = go.Figure(
            data=config.get("plotly_data", []),
            layout=config.get("plotly_layout", {}),
        )
        fig.update_layout(paper_bgcolor="white", plot_bgcolor="white", width=800, height=500)
        png_bytes = pio.to_image(fig, format="png", engine="kaleido")
        return Response(content=png_bytes, media_type="image/png")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chart render error: {e}",
        )
