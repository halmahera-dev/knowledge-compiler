"""Recomputing stored costs after the rates change.

Run with::

    cd apps/api && uv run python -m app.reprice          # report only
    cd apps/api && uv run python -m app.reprice --write  # apply

Cost is worked out when a usage row is written and stored on the row, not
computed on the way out. That is deliberate — a rate is a fact about a moment,
and recomputing history every time someone edits AI_PRICING would quietly
restate what last month cost. The price of that choice is this command: setting
a rate for the first time leaves everything already recorded reading as unknown
until you run it.

Rows whose model is ``unknown`` came from the backfill, which reconstructed
calls made before the log existed. Nothing recorded which model ran them, so
there is no rate to look up and they price as unknown.

They can be adopted, but only by saying so out loud::

    uv run python -m app.reprice --assume-agent-model zai.glm-5 --write

Every one of them was made by the agent, and the agent has a single configured
model — so in practice they almost certainly all ran on it. Almost certainly is
not recorded fact, though, and the difference matters when the number is money.
So it is opt-in, the operator names the model rather than the tool inferring it,
and the row is stored as ``zai.glm-5 (assumed)`` — which still matches the
configured rate, and still says on the screen that somebody assumed it.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter

from sqlalchemy import select

from .db import session_scope
from .models import AiUsageEvent
from .pricing import PRICES, UNKNOWN_MODEL, estimate_usd
from .services.usage import AGENT

#: Appended to an adopted model id, so the assumption survives on screen. The
#: fuzzy matcher ignores punctuation, so the configured rate still applies.
ASSUMED = " (assumed)"


async def reprice(write: bool, assume_agent_model: str | None = None) -> Counter:
    counts: Counter = Counter()

    async with session_scope() as db:
        rows = (await db.execute(select(AiUsageEvent))).scalars().all()

        for row in rows:
            model = row.model

            if assume_agent_model and model == UNKNOWN_MODEL and row.service == AGENT:
                model = f"{assume_agent_model}{ASSUMED}"
                counts["adopted"] += 1
                if write:
                    row.model = model

            fresh = estimate_usd(model, row.input_tokens, row.output_tokens)

            if fresh is None:
                counts["still unpriced"] += 1
                counts[f"  no rate for {model}"] += 1
                continue

            # Compared as Decimal, not float: the column is DECIMAL(14,10) and a
            # float round-trip would report a change on every run.
            if row.estimated_usd is not None and row.estimated_usd == fresh:
                counts["unchanged"] += 1
                continue

            counts["priced" if row.estimated_usd is None else "updated"] += 1
            if write:
                row.estimated_usd = fresh

        if write:
            await db.commit()

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="apply the new costs")
    parser.add_argument(
        "--assume-agent-model",
        metavar="MODEL",
        help=(
            "adopt backfilled agent rows as having run on MODEL. Stored with an "
            "'(assumed)' marker, because it is your assertion and not a record."
        ),
    )
    args = parser.parse_args()

    if not PRICES:
        print()
        print("  AI_PRICING is empty, so there is nothing to price with.")
        print("  Set it in .env and try again — see .env.example for the shape.")
        print()
        return

    counts = asyncio.run(reprice(args.write, args.assume_agent_model))

    print()
    print("  Repriced" if args.write else "  Dry run — nothing written")
    print(f"  Using rates for: {', '.join(sorted(PRICES))}")
    if args.assume_agent_model:
        print(f"  Adopting backfilled agent rows as: {args.assume_agent_model} (assumed)")
    print()
    for key in sorted(counts):
        print(f"    {key:34} {counts[key]:>6}")
    if not counts:
        print("    no usage rows yet")
    print()
    if not args.write:
        print("  Re-run with --write to apply.")
        print()


if __name__ == "__main__":
    main()
