"""Table Agent — LLM-powered AntV S2 table formatting and modification."""

import json
import re

from backend.prompts.table_agent import TABLE_AGENT_SYSTEM_PROMPT
from backend.services.llm_client import call_llm


class TableAgent:

    async def process(
        self,
        user_message: str,
        current_config: dict,
        columns: list,
        sample_data: list,
        history: list[dict] | None = None,
    ) -> dict:
        """Process a table formatting request and return updated S2 config."""
        # Convert row arrays to objects for the prompt
        if sample_data and isinstance(sample_data[0], list):
            sample_objects = [
                {columns[i]: row[i] for i in range(min(len(columns), len(row)))}
                for row in sample_data[:5]
            ]
        else:
            sample_objects = sample_data[:5]

        history_block = ""
        if history:
            turns = "\n".join(
                f"{h['role'].upper()}: {h['content']}" for h in history[-8:]
            )
            history_block = f"\n\nPrevious conversation (use for context/memory):\n{turns}\n"

        prompt = TABLE_AGENT_SYSTEM_PROMPT.format(
            current_config=json.dumps(current_config),
            columns=json.dumps(columns),
            sample_data=json.dumps(sample_objects),
            user_message=user_message,
        ) + history_block

        result = await call_llm(prompt)
        parsed = self._parse_json(result)

        # Ensure required keys exist with safe defaults
        parsed.setdefault("fields", {"rows": [], "columns": columns, "values": []})
        parsed.setdefault("hiddenColumns", [])
        parsed.setdefault("sortParams", [])
        parsed.setdefault("conditions", {"background": [], "text": []})
        parsed.setdefault("meta", [])
        parsed.setdefault("isPivot", False)
        parsed.setdefault("not_supported", False)
        parsed.setdefault("changes_made", "Config updated")

        return parsed

    def _parse_json(self, text: str) -> dict:
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
                f"Table agent returned invalid JSON. Raw response: {text[:200]}"
            )


table_agent = TableAgent()
