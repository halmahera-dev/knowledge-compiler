"""The compile pipeline must receive the whole document.

Regression cover for the most consequential v1 defect: the agent read source text
from `GET /api/v1/items/{id}`, which returns `excerpt = content[:2000]` because it
feeds the browser. Every source longer than 2000 characters was therefore compiled
from its opening paragraphs alone, while the agent's own `MAX_MODEL_CHARS = 24000`
cap never came into play.

It went unnoticed because every piece of test and seed content was short enough to
fit under the excerpt limit.
"""

from __future__ import annotations

import inspect

from app.routers import internal, items
from app.schemas import RawItemContent, RawItemOut


class TestSchemaSeparation:
    """The two shapes exist precisely so one cannot be mistaken for the other."""

    def test_browser_shape_carries_an_excerpt_not_content(self):
        fields = RawItemOut.model_fields
        assert "excerpt" in fields
        assert "content" not in fields, (
            "RawItemOut feeds list/detail views; adding full content here would "
            "ship the whole document to the browser on every render"
        )

    def test_pipeline_shape_carries_content_not_an_excerpt(self):
        fields = RawItemContent.model_fields
        assert "content" in fields
        assert "excerpt" not in fields, (
            "RawItemContent feeds the compile pipeline; an excerpt field here "
            "invites exactly the truncation bug this module guards against"
        )


class TestInternalRouteReturnsFullContent:
    def test_internal_item_route_exists(self):
        paths = {
            route.path
            for route in internal.router.routes
            if hasattr(route, "path")
        }
        assert "/internal/items/{item_id}" in paths

    def test_internal_handler_returns_the_whole_body_unsliced(self):
        source = inspect.getsource(internal.item_content)
        assert "content=item.content," in source
        # A slice here is the bug returning.
        assert "item.content[:" not in source, (
            "the pipeline endpoint must not truncate — that is what broke v1"
        )

    def test_public_detail_handler_still_truncates(self):
        # The browser endpoint SHOULD truncate; the fix was to stop the agent
        # reading from it, not to make it return megabytes.
        source = inspect.getsource(items.get_item)
        assert "item.content[:" in source


class TestAgentReadsTheInternalRoute:
    """The agent's client must point at /internal/items, not /api/v1/items."""

    def _agent_api_source(self) -> str:
        from pathlib import Path

        # tests/ -> api/ -> apps/
        path = Path(__file__).resolve().parents[2] / "agent" / "src" / "mastra" / "api.ts"
        return path.read_text(encoding="utf-8")

    def test_get_raw_item_uses_the_internal_endpoint(self):
        source = self._agent_api_source()
        assert "/internal/items/${itemId}" in source
        assert "/api/v1/items/${itemId}" not in source

    def test_agent_item_type_exposes_content(self):
        source = self._agent_api_source()
        assert "content: string;" in source
