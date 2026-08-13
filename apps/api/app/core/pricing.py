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
import re
from decimal import Decimal

from app.core.config import get_settings

logger = logging.getLogger(__name__)

#: USD per million tokens, so the arithmetic below matches the published unit.
PER_MILLION = Decimal(1_000_000)


def _load() -> dict[str, dict[str, Decimal]]:
    """Reads AI_PRICING, tolerating anything malformed.

    Read through Settings rather than ``os.getenv``: .env is loaded by
    pydantic-settings, which does not export anything into the process
    environment. ``os.getenv`` returned nothing for a value plainly present in
    .env, and the only symptom was cost staying unknown forever.

    A broken price list must not stop the API booting: usage recording is
    observability, and observability that takes the product down with it when
    misconfigured has cost more than it saved.
    """
    raw = (get_settings().ai_pricing or "").strip()
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


def _key(text: str) -> str:
    """Strips everything but letters and digits, lowercased."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


#: What the backfill writes when nothing recorded which model ran a call. Our
#: own sentinel, not a model name, so it must never match a configured rate.
UNKNOWN_MODEL = "unknown"

#: Shortest configured name allowed to match as a substring.
#:
#: Without a floor, a one- or two-letter entry matches almost every id — a key
#: of "n" priced every `unknown` row in the table. Four still admits "gpt4",
#: which is about as terse as a real model name gets.
MIN_FUZZY_KEY = 4


def rates_for(model: str) -> dict[str, Decimal] | None:
    """The configured rates for a model id, matched forgivingly.

    Exact first. Failing that, a configured name that survives as a substring
    once both sides are reduced to letters and digits.

    That fallback exists because the ids stored here are not the ids anyone
    would think to write down. An embedding row records
    ``bedrock:global.cohere.embed-v4:0@ap-southeast-3`` — prefix, inference
    profile, region and all — and requiring that to be reproduced character for
    character means the sensible-looking ``cohere-embed-v4`` silently prices
    nothing, with no error to explain why.

    The longest match wins, so a specific name beats a general one when both
    would fit and ``gpt-4`` cannot quietly claim ``gpt-4o``'s calls.
    """
    exact = PRICES.get(model)
    if exact:
        return exact

    if model == UNKNOWN_MODEL:
        return None

    target = _key(model)
    candidates = [
        name
        for name in PRICES
        if len(_key(name)) >= MIN_FUZZY_KEY and _key(name) in target
    ]
    if not candidates:
        return None
    return PRICES[max(candidates, key=lambda name: len(_key(name)))]


def estimate_usd(
    model: str, input_tokens: int | None, output_tokens: int | None
) -> Decimal | None:
    """Cost of one call, or None when the model has no configured rate.

    None rather than zero, always. The two are not the same claim and the UI
    renders them differently.
    """
    rates = rates_for(model)
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
