"""The per-operation breakdown carries the numbers the table renders.

/ai-logs draws an In and an Out column for every operation, but the endpoint only
ever selected the combined total. The client's TypeScript said otherwise and the
unchecked cast let it through, so the page reached the DOM with `undefined` and
crashed on the first row.

The failure worth guarding is not "a field went missing from the schema" — it is
drift between the SELECT list and the positional unpack that turns each row into
a `UsageByOperation`. So the stub below does not hand back a row of the right
width: it builds every row out of the statement's own selected columns. Drop a
column from the projection and the unpack runs out of values; reorder either side
and the values land in the wrong fields. Both fail here.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import current_scope
from app.core.db import get_db
from app.core.scoping import Scope
from app.main import app
from app.models import AiUsageEvent
from app.schemas import UsageByOperation

WORKSPACE = "test-workspace-usage-breakdown"

#: One distinct value per column, so a swapped pair cannot pass unnoticed.
OPERATION = "copilot"
CALLS = 3
INPUT_TOKENS = 7
OUTPUT_TOKENS = 11
TOTAL_TOKENS = 18
USD = Decimal("0.75")


def value_for(column) -> object:  # noqa: ANN001 - any selected SQL expression
    """What the database would have returned for one selected column.

    Keyed off the rendered SQL because that is the only thing the projection and
    this stub honestly share. Keying off position instead would hand back a row
    that fits whatever was asked for, which is precisely the mistake under test.
    """
    sql = str(column)
    if "FILTER" in sql:  # the "how many were unpriced / estimated" tallies
        return 0
    if "count(" in sql:
        return CALLS
    if "estimated_usd" in sql:
        return USD
    if "input_tokens" in sql:
        return INPUT_TOKENS
    if "output_tokens" in sql:
        return OUTPUT_TOKENS
    if "total_tokens" in sql:
        return TOTAL_TOKENS
    if "operation" in sql:
        return OPERATION
    raise AssertionError(f"the endpoint selected something with no stub value: {sql}")


class StubResult:
    def __init__(self, rows: list):
        self._rows = rows

    def scalars(self) -> StubResult:
        return self

    def all(self) -> list:
        return self._rows

    def one(self):
        (row,) = self._rows
        return row

    def scalar_one(self):
        (row,) = self._rows
        return row[0]


class StubSession:
    """Enough database to answer the endpoint's four reads, and nothing more.

    The listing is deliberately empty: this endpoint computes its summary in SQL
    rather than over the fetched page, so the events have no bearing on the
    numbers being checked.
    """

    async def execute(self, statement):  # noqa: ANN001 - mirrors AsyncSession.execute
        if statement.column_descriptions[0]["expr"] is AiUsageEvent:
            return StubResult([])
        return StubResult([tuple(value_for(col) for col in statement.selected_columns)])


@pytest.fixture
def client():
    app.dependency_overrides[current_scope] = lambda: Scope(
        workspace_id=WORKSPACE, user_id="tester", role="owner"
    )
    app.dependency_overrides[get_db] = lambda: StubSession()
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestUsageByOperation:
    def test_each_operation_reports_its_input_and_output_tokens(self, client):
        response = client.get("/api/v1/ai-usage")
        assert response.status_code == 200

        (row,) = response.json()["summary"]["byOperation"]
        assert row == {
            "operation": OPERATION,
            "calls": CALLS,
            "inputTokens": INPUT_TOKENS,
            "outputTokens": OUTPUT_TOKENS,
            "totalTokens": TOTAL_TOKENS,
            "estimatedUsd": float(USD),
        }

    def test_the_totals_row_still_lines_up(self, client):
        # The same positional coupling, one query up. Widening the breakdown is
        # exactly the kind of edit that nudges the row above it out of step.
        summary = client.get("/api/v1/ai-usage").json()["summary"]

        assert summary["calls"] == CALLS
        assert summary["inputTokens"] == INPUT_TOKENS
        assert summary["outputTokens"] == OUTPUT_TOKENS
        assert summary["totalTokens"] == TOTAL_TOKENS
        assert summary["estimatedUsd"] == float(USD)
        assert summary["unpricedCalls"] == 0
        assert summary["estimatedCalls"] == 0


class TestUsageByOperationContract:
    def test_the_token_counts_are_required(self):
        # A breakdown row that can be built without them is a row the client can
        # receive without them, which is the crash all over again.
        with pytest.raises(ValidationError):
            UsageByOperation(
                operation=OPERATION,
                calls=CALLS,
                total_tokens=TOTAL_TOKENS,
                estimated_usd=None,
            )

    def test_an_operation_that_used_nothing_counts_as_zero_not_unknown(self):
        # The projection coalesces, so these never arrive null the way a per-call
        # cost does. Declaring them nullable would push a decision onto the client
        # that the SQL has already made.
        row = UsageByOperation(
            operation=OPERATION,
            calls=0,
            input_tokens=0,
            output_tokens=0,
            total_tokens=0,
            estimated_usd=None,
        )

        assert row.input_tokens == 0
        assert row.output_tokens == 0
