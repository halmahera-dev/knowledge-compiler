"""What a model call costs.

Token counts are measured; money is not. A rate is a fact about your AWS
account on a given day — it varies by region, by negotiated commitment, and it
changes without asking. So no rates are hardcoded here.

The consequence is deliberate: with nothing configured, cost reads as unknown
rather than as zero. A dashboard that quietly reports $0.00 because it has no
price list is worse than one that says it does not know — the first is a wrong
number people plan with, the second is a prompt to go and set it.

Configure with ``AI_PRICING``, a JSON object of model id to rate in USD per
million tokens::

    AI_PRICING={"zai.glm-5":{"input":0.6,"output":2.2},
                "global.cohere.embed-v4:0":{"input":0.12}}

Rates are per **million** tokens because that is the unit AWS publishes, and
converting in your head at 3am is how a decimal point goes missing. Look them up
at https://aws.amazon.com/bedrock/pricing/ for the region you actually run in —
``ap-southeast-3`` is not priced the same as ``us-east-1``.

An embedding model has no output tokens; omit ``output`` and it is treated as 0.
"""

from __future__ import annotations

import json
import logging
import os
from decimal import Decimal

logger = logging.getLogger(__name__)

#: USD per million tokens, so the arithmetic below matches the published unit.
PER_MILLION = Decimal(1_000_000)


def _load() -> dict[str, dict[str, Decimal]]:
    """Reads AI_PRICING, tolerating anything malformed.

    A broken price list must not stop the API booting: usage recording is
    observability, and observability that takes the product down with it when
    misconfigured has cost more than it saved.
    """
    raw = os.getenv("AI_PRICING", "").strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        logger.warning("AI_PRICING is not valid JSON, so costs stay unknown: %s", error)
        return {}

    if not isinstance(parsed, dict):
        logger.warning("AI_PRICING must be a JSON object of model to rates.")
        return {}

    table: dict[str, dict[str, Decimal]] = {}
    for model, rates in parsed.items():
        if not isinstance(rates, dict):
            logger.warning("AI_PRICING entry for %r is not an object; ignored.", model)
            continue
        try:
            entry = {
                key: Decimal(str(rates[key])) for key in ("input", "output") if key in rates
            }
        except (ArithmeticError, ValueError):
            logger.warning("AI_PRICING rates for %r are not numbers; ignored.", model)
            continue
        if entry:
            table[model] = entry

    return table


#: Read once at import. Changing rates is a restart, which is the right shape:
#: a price that changed mid-process would make two rows disagree with no record
#: of why.
PRICES = _load()


def estimate_usd(
    model: str, input_tokens: int | None, output_tokens: int | None
) -> Decimal | None:
    """Cost of one call, or None when the model has no configured rate.

    None rather than zero, always. The two are not the same claim and the UI
    renders them differently.
    """
    rates = PRICES.get(model)
    if not rates:
        return None

    total = Decimal(0)
    total += (rates.get("input", Decimal(0)) * Decimal(input_tokens or 0)) / PER_MILLION
    total += (rates.get("output", Decimal(0)) * Decimal(output_tokens or 0)) / PER_MILLION
    return total


#: Rough characters per token, for text whose call never reported a count.
#:
#: Four is the usual English approximation and it is only ever used for rows
#: flagged ``tokens_estimated``. It is wrong for code and wrong for Indonesian;
#: it is right enough to answer "which part of this product is expensive", which
#: is the question the log exists to answer.
CHARS_PER_TOKEN = 4


def tokens_from_text(text: str | None) -> int:
    """A token count for text the provider never counted for us."""
    if not text:
        return 0
    return max(1, len(text) // CHARS_PER_TOKEN)
