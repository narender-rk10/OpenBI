"""Natural-language narrative generation over query results.

Two detail levels:
- ``brief``    — 2-3 sentence insight shown above a chat result's chart/table
- ``detailed`` — an executive summary + key findings + recommendations, used
                 as a narrative slide in PPTX exports

Both go through the org-configured LLM (`call_llm`), so they respect Settings → LLM.
"""

from backend.services.llm_client import call_llm

Detail = str  # "brief" | "detailed"


def _build_prompt(columns: list, rows: list, detail: Detail, context: str | None) -> str:
    sample = rows[: (10 if detail == "brief" else 50)]
    ctx = f"\nContext / user question: {context}\n" if context else ""
    if detail == "detailed":
        return (
            "You are a senior data analyst writing the narrative section of an "
            "executive presentation.\n"
            f"Columns: {columns}\n"
            f"Data (first {len(sample)} rows): {sample}{ctx}\n\n"
            "Write a narrative with these clearly labelled parts:\n"
            "1. Executive Summary — 2-3 sentences on the headline story.\n"
            "2. Key Findings — 3-5 concise bullet points with specific numbers.\n"
            "3. Recommendations — 2-3 actionable bullet points.\n"
            "Be specific and quantitative. Do not invent data not present."
        )
    return (
        "You are a data analyst. Write 2-3 concise sentences summarizing this dataset.\n"
        f"Columns: {columns}\n"
        f"Sample data (first {len(sample)} rows): {sample}{ctx}\n"
        "Focus on key trends, outliers, totals, or comparisons. Be specific with numbers."
    )


async def generate_narrative(
    columns: list,
    rows: list,
    detail: Detail = "brief",
    org_settings: dict | None = None,
    context: str | None = None,
) -> str:
    """Return a natural-language narrative for the given result set."""
    if detail not in ("brief", "detailed"):
        detail = "brief"
    prompt = _build_prompt(columns, rows, detail, context)
    return await call_llm(prompt, org_settings=org_settings)
