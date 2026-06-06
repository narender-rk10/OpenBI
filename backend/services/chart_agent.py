"""Chart Agent — LLM-powered G2 chart generation and modification."""

import json
import re

from backend.prompts.chart_agent import CHART_AGENT_SYSTEM_PROMPT
from backend.services.llm_client import call_llm


class ChartAgent:

    async def generate_chart(
        self,
        columns: list[str],
        rows: list[list],
        user_request: str = "auto",
        brand_colors: list[str] | None = None,
        current_config: dict | None = None,
    ) -> dict:
        """Generate or update G2 chart spec from data."""
        if brand_colors is None:
            brand_colors = [
                "#e94560", "#0f3460", "#16a34a",
                "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
            ]

        column_types = self._detect_types(columns, rows)

        # Convert rows to objects for the sample_data
        sample_objects = [
            {columns[i]: row[i] for i in range(min(len(columns), len(row)))}
            for row in rows[:5]
        ]

        context = ""
        if current_config:
            context = f"\nCURRENT CHART CONFIG (user wants to modify this):\n{json.dumps(current_config)}\n"

        prompt = CHART_AGENT_SYSTEM_PROMPT.format(
            columns=json.dumps(columns),
            column_types=json.dumps(column_types),
            row_count=len(rows),
            sample_data=json.dumps(sample_objects),
            user_request=(
                user_request
                if user_request != "auto"
                else "Choose the best chart type automatically based on the data"
            ),
            brand_colors=json.dumps(brand_colors),
            # Placeholders that appear in the example JSON inside the prompt
            sample_data_placeholder=json.dumps(sample_objects),
            brand_colors_placeholder=json.dumps(brand_colors),
        ) + context

        result = await call_llm(prompt)
        return self._parse_json(result)

    async def modify_chart(
        self,
        user_message: str,
        current_config: dict,
        columns: list[str],
        rows: list[list],
        brand_colors: list[str] | None = None,
    ) -> dict:
        """Modify existing chart based on user instruction."""
        return await self.generate_chart(
            columns=columns,
            rows=rows,
            user_request=user_message,
            brand_colors=brand_colors,
            current_config=current_config,
        )

    def _detect_types(self, columns: list[str], rows: list[list]) -> dict:
        """Detect column data types from sample data."""
        types = {}
        for i, col in enumerate(columns):
            sample_values = [
                row[i] for row in rows[:20] if i < len(row) and row[i] is not None
            ]
            if not sample_values:
                types[col] = "unknown"
                continue

            try:
                [float(v) for v in sample_values]
                types[col] = "numeric"
                continue
            except (ValueError, TypeError):
                pass

            date_pattern = re.compile(r"\d{4}-\d{2}-\d{2}")
            if all(date_pattern.match(str(v)) for v in sample_values[:5]):
                types[col] = "date"
                continue

            unique_ratio = len(set(str(v) for v in sample_values)) / len(sample_values)
            types[col] = "categorical" if unique_ratio < 0.5 else "string"

        return types

    def _parse_json(self, text: str) -> dict:
        """Clean and parse JSON from LLM response."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            raise ValueError(
                f"Chart agent returned invalid JSON. Raw response: {text[:200]}"
            )


chart_agent = ChartAgent()
