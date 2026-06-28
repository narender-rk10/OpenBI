"""Unit tests for LIDAService filter detection and chart suggestion."""

import pytest
from backend.services.lida_service import LIDAService


@pytest.fixture
def lida():
    # No org settings — always uses heuristic fallback
    return LIDAService(org_settings={})


class TestDetectFilters:
    @pytest.mark.asyncio
    async def test_string_low_cardinality_becomes_select(self, lida):
        columns = ["category"]
        rows = [["Electronics"], ["Clothing"], ["Electronics"], ["Books"]]
        filters = await lida.detect_filters(columns, rows)
        assert len(filters) == 1
        assert filters[0]["column"] == "category"
        assert filters[0]["type"] == "select"
        assert "Electronics" in filters[0]["options"]

    @pytest.mark.asyncio
    async def test_numeric_column_becomes_number_range(self, lida):
        columns = ["price"]
        rows = [[10.5], [99.9], [250.0], [5.0]]
        filters = await lida.detect_filters(columns, rows)
        assert len(filters) == 1
        assert filters[0]["type"] == "number_range"
        assert filters[0]["min"] == pytest.approx(5.0)
        assert filters[0]["max"] == pytest.approx(250.0)

    @pytest.mark.asyncio
    async def test_date_column_becomes_date_range(self, lida):
        import pandas as pd
        # Pass actual Timestamp objects so pandas recognises them as datetime64
        columns = ["order_date"]
        rows = [[pd.Timestamp("2024-01-15")], [pd.Timestamp("2024-03-22")], [pd.Timestamp("2024-06-01")]]
        filters = await lida.detect_filters(columns, rows)
        assert len(filters) == 1
        assert filters[0]["type"] == "date_range"

    @pytest.mark.asyncio
    async def test_high_cardinality_string_no_filter(self, lida):
        columns = ["description"]
        # 55 unique values — exceeds the select threshold of 50; no "search" branch, so empty
        rows = [[f"item-{i}"] for i in range(55)]
        filters = await lida.detect_filters(columns, rows)
        assert len(filters) == 0

    @pytest.mark.asyncio
    async def test_empty_data_returns_empty(self, lida):
        filters = await lida.detect_filters([], [])
        assert filters == []

    @pytest.mark.asyncio
    async def test_null_values_ignored_in_options(self, lida):
        columns = ["status"]
        rows = [["active"], [None], ["inactive"], [None], ["active"]]
        filters = await lida.detect_filters(columns, rows)
        assert None not in filters[0]["options"]
        assert "" not in filters[0]["options"]

    @pytest.mark.asyncio
    async def test_multiple_columns(self, lida):
        import pandas as pd
        columns = ["region", "sales", "order_date"]
        rows = [
            ["North", 1000, pd.Timestamp("2024-01-01")],
            ["South", 2000, pd.Timestamp("2024-02-01")],
            ["North", 1500, pd.Timestamp("2024-03-01")],
        ]
        filters = await lida.detect_filters(columns, rows)
        types = {f["column"]: f["type"] for f in filters}
        assert types["region"] == "select"
        assert types["sales"] == "number_range"
        assert types["order_date"] == "date_range"


class TestSuggestChart:
    @pytest.mark.asyncio
    async def test_categorical_and_numeric_suggests_bar(self, lida):
        columns = ["category", "revenue"]
        rows = [["A", 100], ["B", 200], ["C", 150]]
        result = await lida.suggest_chart(columns, rows)
        assert result["chart_type"] == "bar"
        assert result["x"] == "category"
        assert result["y"] == "revenue"

    @pytest.mark.asyncio
    async def test_two_numerics_suggests_scatter(self, lida):
        columns = ["x_val", "y_val"]
        rows = [[1, 2], [3, 4], [5, 6]]
        result = await lida.suggest_chart(columns, rows)
        assert result["chart_type"] == "scatter"

    @pytest.mark.asyncio
    async def test_one_numeric_suggests_histogram(self, lida):
        columns = ["price"]
        rows = [[10], [20], [15], [30]]
        result = await lida.suggest_chart(columns, rows)
        assert result["chart_type"] == "histogram"

    @pytest.mark.asyncio
    async def test_empty_df_returns_bar(self, lida):
        result = await lida.suggest_chart([], [])
        assert result["chart_type"] == "bar"
