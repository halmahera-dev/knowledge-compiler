"""What the workspace has spent on model calls.

A read-only view over `ai_usage_events`. Scoped like everything else: you see
your workspace's calls and no one else's.

The summary is computed in SQL rather than over the fetched page, because the
two answer different questions — the list is the last N calls, the totals are
every call in the range. Summing the page would silently report the cost of
whatever happened to be on screen.
"""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import BigInteger, cast, func

from app.api.deps import DbDep, ScopeDep
from app.models import AiUsageEvent
from app.schemas import (
    UsageByOperation,
    UsageEventOut,
    UsageListOut,
    UsageSummary,
)
from app.services.usage import as_usd

router = APIRouter(prefix="/api/v1/ai-usage", tags=["ai-usage"])

#: A page of history. Enough to scroll a busy day without pulling a month.
DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def _sum_int(column):
    """SUM over an integer column, as an integer, defaulting to zero.

    CockroachDB widens ``SUM`` over an INT to DECIMAL, so the obvious
    ``coalesce(sum(x), 0)`` pairs a decimal with an int literal and the database
    rejects it outright: "incompatible COALESCE expressions". Casting back before
    the coalesce keeps both branches the same type.
    """
    return func.coalesce(cast(func.sum(column), BigInteger), 0)


@router.get("", response_model=UsageListOut)
async def list_usage(
    db: DbDep,
    scope: ScopeDep,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
    operation: Annotated[str | None, Query()] = None,
    days: Annotated[int | None, Query(ge=1, le=365)] = None,
) -> UsageListOut:
    """Recent calls, with totals over everything the filters match."""
    filters = []
    if operation:
        filters.append(AiUsageEvent.operation == operation)
    if days:
        since = dt.datetime.now(dt.UTC) - dt.timedelta(days=days)
        filters.append(AiUsageEvent.created_at >= since)

    def scoped(statement):
        for condition in filters:
            statement = statement.where(condition)
        return statement

    rows = (
        await db.execute(
            scoped(scope.select(AiUsageEvent))
            .order_by(AiUsageEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    total = (
        await db.execute(
            scoped(scope.select(AiUsageEvent).with_only_columns(func.count()))
        )
    ).scalar_one()

    totals = (
        await db.execute(
            scoped(
                scope.select(AiUsageEvent).with_only_columns(
                    func.count(),
                    _sum_int(AiUsageEvent.input_tokens),
                    _sum_int(AiUsageEvent.output_tokens),
                    _sum_int(AiUsageEvent.total_tokens),
                    func.sum(AiUsageEvent.estimated_usd),
                    # Counted, not inferred from a null sum: "nothing priced" and
                    # "everything priced at zero" must not look the same.
                    func.count().filter(AiUsageEvent.estimated_usd.is_(None)),
                    func.count().filter(AiUsageEvent.tokens_estimated.is_(True)),
                )
            )
        )
    ).one()

    by_operation = (
        await db.execute(
            scoped(
                scope.select(AiUsageEvent).with_only_columns(
                    AiUsageEvent.operation,
                    func.count(),
                    _sum_int(AiUsageEvent.input_tokens),
                    _sum_int(AiUsageEvent.output_tokens),
                    _sum_int(AiUsageEvent.total_tokens),
                    func.sum(AiUsageEvent.estimated_usd),
                )
            )
            .group_by(AiUsageEvent.operation)
            .order_by(func.count().desc())
        )
    ).all()

    calls, input_tokens, output_tokens, total_tokens, usd, unpriced, estimated = totals

    return UsageListOut(
        events=[UsageEventOut.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        summary=UsageSummary(
            calls=calls,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_usd=as_usd(usd),
            unpriced_calls=unpriced,
            estimated_calls=estimated,
            by_operation=[
                UsageByOperation(
                    operation=op,
                    calls=op_calls,
                    input_tokens=op_input,
                    output_tokens=op_output,
                    total_tokens=op_tokens,
                    estimated_usd=as_usd(op_usd),
                )
                for op, op_calls, op_input, op_output, op_tokens, op_usd in by_operation
            ],
        ),
    )
