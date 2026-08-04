"""Reconstructing the AI usage log for calls made before it existed.

Run with::

    cd apps/api && uv run python -m app.backfill_usage          # report only
    cd apps/api && uv run python -m app.backfill_usage --write  # insert

**Read this before trusting the numbers it produces.** Nothing recorded token
counts before the `ai_usage_events` table existed, and no provider will tell us
retrospectively. So these rows are reconstructed from the text that survived —
the captured document, the question, the answer — at roughly four characters per
token. Every row it writes is flagged ``tokens_estimated``, and the UI separates
them from measured ones.

That makes the backfill useful for one thing and useless for another. It answers
"which part of this product has been consuming the most", because the relative
sizes are about right. It cannot be reconciled against an AWS invoice, and any
sum that mixes it with measured rows should be read as an order of magnitude.

What it maps:

    raw_items          → one `embedding` call each, the text it was embedded from
    compile_runs       → the four reasoning steps, from the item's own text
    chat_messages      → one `copilot` call per answered turn

Idempotent: each source row is looked up before inserting, so running it twice
does not double the history. Cheaper than a marker column and it stays correct
if someone runs it against a partially-backfilled database.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter

from sqlalchemy import func, select

from .db import session_scope
from .models import AiUsageEvent, ChatMessage, ChatSession, CompileRun, RawItem
from .pricing import tokens_from_text
from .services.usage import AGENT, API, record

#: The reasoning steps a compile runs, and roughly how much of the source text
#: each one sees. Extract reads the whole document; the later steps work from
#: what extract produced plus the target page, which is smaller.
COMPILE_STEPS = (("extract", 1.0), ("match", 0.3), ("compile", 0.8), ("link", 0.25))

#: An answer is a fraction of its prompt: the prompt carries the retrieved
#: claims, the answer is prose. Only used where the real answer text is absent.
ANSWER_RATIO = 0.25


async def _already_recorded(db, column, value) -> bool:
    """Whether this source row has already been backfilled."""
    found = await db.scalar(select(func.count()).select_from(AiUsageEvent).where(column == value))
    return bool(found)


async def backfill(write: bool) -> Counter:
    counts: Counter = Counter()

    async with session_scope() as db:
        # ── captures → embedding calls ───────────────────────────────────────
        items = (await db.execute(select(RawItem))).scalars().all()
        for item in items:
            if await _already_recorded(db, AiUsageEvent.raw_item_id, item.id):
                counts["item_skipped"] += 1
                continue

            tokens = tokens_from_text(f"{item.title}\n\n{item.content}")
            counts["embedding"] += 1
            if write:
                event = await record(
                    db,
                    workspace_id=item.workspace_id,
                    service=API,
                    operation="embedding",
                    provider="bedrock-runtime",
                    model=item.embedding_model or "unknown",
                    input_tokens=tokens,
                    tokens_estimated=True,
                    raw_item_id=item.id,
                )
                # Backdated to when the work happened, not when this script ran,
                # or every historical call would pile up on today's date and the
                # "spend over time" view would be a lie.
                if event is not None:
                    event.created_at = item.created_at

        # ── compile runs → the four reasoning steps ──────────────────────────
        runs = (
            await db.execute(
                select(CompileRun, RawItem).join(RawItem, CompileRun.raw_item_id == RawItem.id)
            )
        ).all()
        for run, item in runs:
            if await _already_recorded(db, AiUsageEvent.compile_run_id, run.id):
                counts["run_skipped"] += 1
                continue
            if run.status != "succeeded":
                # A failed run burned tokens too, but how far it got is not
                # recoverable, and inventing four steps for a run that died in
                # the first would overstate it.
                counts["run_unsuccessful_skipped"] += 1
                continue

            source_tokens = tokens_from_text(f"{item.title}\n\n{item.content}")
            for step, share in COMPILE_STEPS:
                input_tokens = max(1, int(source_tokens * share))
                counts[step] += 1
                if write:
                    event = await record(
                        db,
                        workspace_id=run.workspace_id,
                        service=AGENT,
                        operation=step,
                        provider="bedrock-mantle",
                        model="unknown",
                        input_tokens=input_tokens,
                        output_tokens=max(1, int(input_tokens * ANSWER_RATIO)),
                        tokens_estimated=True,
                        compile_run_id=run.id,
                        raw_item_id=item.id,
                    )
                    if event is not None:
                        event.created_at = run.finished_at or run.created_at

        # ── answered turns → copilot calls ───────────────────────────────────
        turns = (
            await db.execute(
                select(ChatMessage, ChatSession)
                .join(ChatSession, ChatMessage.session_id == ChatSession.id)
                .where(ChatMessage.role == "assistant", ChatMessage.refused.is_(False))
            )
        ).all()
        for message, session in turns:
            if await _already_recorded(db, AiUsageEvent.chat_session_id, session.id):
                counts["session_skipped"] += 1
                continue

            # The prompt carried the claims, which is most of what was sent.
            claim_text = " ".join(
                str(claim.get("text", ""))
                for claim in (message.claims or [])
                if isinstance(claim, dict)
            )
            counts["copilot"] += 1
            if write:
                event = await record(
                    db,
                    workspace_id=session.workspace_id,
                    service=AGENT,
                    operation="copilot",
                    provider="bedrock-mantle",
                    model="unknown",
                    input_tokens=tokens_from_text(claim_text) or 1,
                    output_tokens=tokens_from_text(message.content),
                    tokens_estimated=True,
                    chat_session_id=session.id,
                )
                if event is not None:
                    event.created_at = message.created_at

        if write:
            await db.commit()

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="insert the rows. Without it, only reports what would be written.",
    )
    args = parser.parse_args()

    counts = asyncio.run(backfill(args.write))

    print()
    print("  Reconstructed AI usage" if args.write else "  Dry run — nothing written")
    print()
    for key in sorted(counts):
        print(f"    {key:28} {counts[key]:>6}")
    if not counts:
        print("    nothing to backfill")
    print()
    print("  Every row is flagged as estimated. See this module's docstring")
    print("  for what that means before quoting the totals.")
    print()
    if not args.write:
        print("  Re-run with --write to insert.")
        print()


if __name__ == "__main__":
    main()
