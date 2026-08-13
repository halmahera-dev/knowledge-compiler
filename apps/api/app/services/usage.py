"""Recording what each model call cost.

Every call the product makes passes through here, so there is one place that
decides how tokens become money and one place to look when the bill is a
surprise.

Two rules hold this together:

**Recording never breaks the thing it is recording.** A failure to write a usage
row is logged and swallowed. Losing a line of accounting is a bad day; losing a
compiled page because accounting failed is a bug, and the caller is usually
mid-transaction with work worth more than the measurement.

**Unknown is not zero.** A model with no configured rate yields a null cost, and
counts the provider never reported are marked estimated. Both are rendered
differently by the UI, because a made-up zero is a number people plan with.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pricing import estimate_usd, tokens_from_text
from app.models import AiUsageEvent

log = structlog.get_logger(__name__)

#: The service that made the call.
AGENT = "agent"
API = "api"


async def record(
    db: AsyncSession,
    *,
    workspace_id: str,
    service: str,
    operation: str,
    provider: str,
    model: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    tokens_estimated: bool = False,
    latency_ms: int | None = None,
    status: str = "ok",
    error: str | None = None,
    compile_run_id: uuid.UUID | None = None,
    chat_session_id: uuid.UUID | None = None,
    raw_item_id: uuid.UUID | None = None,
) -> AiUsageEvent | None:
    """Writes one usage row. Returns None if it could not be written.

    Does not commit: the caller owns the transaction, and a usage row belongs in
    the same one as the work it describes — otherwise a rolled-back compile
    leaves a charge for a page that does not exist.
    """
    total = None
    if input_tokens is not None or output_tokens is not None:
        total = (input_tokens or 0) + (output_tokens or 0)

    try:
        event = AiUsageEvent(
            workspace_id=workspace_id,
            service=service,
            operation=operation,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total,
            tokens_estimated=tokens_estimated,
            estimated_usd=estimate_usd(model, input_tokens, output_tokens),
            latency_ms=latency_ms,
            status=status,
            error=(error or None) and error[:500],
            compile_run_id=compile_run_id,
            chat_session_id=chat_session_id,
            raw_item_id=raw_item_id,
        )
        db.add(event)
        await db.flush()
        return event
    except Exception:  # noqa: BLE001 — see the module docstring.
        log.warning(
            "ai_usage_record_failed", operation=operation, model=model, exc_info=True
        )
        return None


def estimated_from_text(
    prompt: str | None, completion: str | None
) -> tuple[int, int]:
    """Token counts for a provider that reported none.

    Only for paths where the provider genuinely gives nothing back — Bedrock's
    embedding responses, and the backfill of calls made before this table
    existed. Rows built from this must be flagged ``tokens_estimated``.
    """
    return tokens_from_text(prompt), tokens_from_text(completion)


def as_usd(value: Decimal | None) -> float | None:
    """Decimal to JSON. Null stays null — see the note on unknown versus zero."""
    return None if value is None else float(value)
