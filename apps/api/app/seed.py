"""Demo seed data.

Eighteen sources across three deliberately overlapping topic clusters, so the
graph shows clusters rather than a flat list (PRD §8) and merging is observable
rather than asserted.

Two properties are engineered in:

* Every cluster has multiple sources on the same topic, so the second and later
  saves must MERGE. A run of "created" diffs means matching is not working.
* One pair contradicts on a checkable fact — whether the pattern replaces RAG or
  complements it — so contradiction detection has something real to catch.

Run with:  pnpm seed
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx

from .config import get_settings

# (title, body). Bodies are written as prose a person might actually clip.
SOURCES: list[tuple[str, str]] = [
    # ── cluster 1: the compile-don't-retrieve pattern ────────────────────────
    (
        "Karpathy's LLM Knowledge Base pattern",
        "Andrej Karpathy has described what he calls an LLM knowledge base: a folder of raw "
        "sources that a language model incrementally compiles into an interlinked markdown wiki. "
        "The central move is compiling once rather than retrieving per query. Instead of "
        "re-deriving an answer from raw documents every time a question is asked, the model "
        "maintains summaries, backlinks, and concept pages that accumulate over time. He is "
        "explicit that this is a workflow pattern to paste into a coding agent, not a product.",
    ),
    (
        "Compile-time versus query-time knowledge",
        "There is a long-standing distinction in systems design between doing work at compile "
        "time and doing it at query time. Retrieval-augmented generation sits firmly at query "
        "time: each question triggers a fresh search over a document store, and the model sees "
        "only the chunks that search returned. A compiled knowledge base moves that work "
        "forward. The synthesis happens once, when a document arrives, and every later question "
        "reads an already-organised artifact. The tradeoff is staleness against latency.",
    ),
    (
        "Why compiled notes beat retrieval for personal knowledge",
        "For a personal reading corpus, compilation has a decisive advantage over retrieval: it "
        "forces the system to reconcile sources against each other. Retrieval returns five "
        "passages and leaves the reader to notice that two of them disagree. A compiled page has "
        "to decide what the topic actually says, which surfaces contradictions instead of hiding "
        "them behind ranked results. This pattern is best understood as replacing RAG entirely "
        "for personal corpora — once a wiki exists, there is no remaining reason to run "
        "similarity search over raw documents.",
    ),
    (
        "RAG and compiled wikis are complementary, not competing",
        "It is a mistake to frame compiled knowledge bases as a replacement for retrieval. The "
        "two solve different problems and production systems need both. A compiled wiki is "
        "excellent for topics the system has already seen and synthesised, but it cannot answer "
        "questions about material that has not yet been compiled, and recompiling a large corpus "
        "is expensive. Retrieval remains the right tool for long-tail and freshly-ingested "
        "content. The sensible architecture uses a compiled layer for well-trodden topics and "
        "falls back to retrieval for everything else.",
    ),
    (
        "Incremental compilation and the staleness problem",
        "Any compiled artifact faces a staleness problem: the compiled form can fall behind the "
        "sources it was derived from. Build systems solve this with dependency tracking and "
        "incremental rebuilds. A knowledge base needs the same discipline. When a new source "
        "arrives, only the pages it touches should be recompiled, and each page should record "
        "which sources contributed to it so the dependency graph is explicit rather than implied.",
    ),
    (
        "Provenance in generated summaries",
        "A generated summary without provenance is unfalsifiable. If a claim cannot be traced "
        "back to the sentence that produced it, a reader has no way to check whether the model "
        "synthesised or invented it. Systems that compile documents into structured knowledge "
        "should attach the verbatim source span to every claim, not merely cite the document. "
        "Document-level citation is too coarse: it tells you where to start looking, not what "
        "was actually said.",
    ),
    # ── cluster 2: knowledge graphs and typed relations ─────────────────────
    (
        "What a knowledge graph actually buys you",
        "A knowledge graph stores entities as nodes and relationships as edges. The value is not "
        "the visualisation, which is usually a hairball, but the ability to traverse: to ask what "
        "connects two concepts, or what a concept depends on. A graph whose edges are all "
        "untyped 'related to' links carries almost no information beyond co-occurrence.",
    ),
    (
        "Typed edges and why relation semantics matter",
        "The difference between a useful graph and a decorative one is whether edges carry "
        "meaning. An edge labelled 'prerequisite of' supports a genuinely different query than "
        "one labelled 'contradicts' or 'is an example of'. Typed relations let a system answer "
        "questions about structure — what must I understand first, where do my sources disagree "
        "— that an untyped adjacency list simply cannot express.",
    ),
    (
        "Node weight as a proxy for attention",
        "In a personal knowledge graph, a natural weighting for a topic node is how much of the "
        "collection touches it. Nodes that many sources contribute to are the topics the reader "
        "keeps returning to. Rendering node radius proportional to that weight turns the graph "
        "into a map of attention. Radius should scale with the square root of weight, since area "
        "rather than radius is what the eye reads as magnitude.",
    ),
    (
        "Graph layout and the hairball problem",
        "Force-directed layouts place connected nodes near each other by simulating repulsion "
        "between all nodes and attraction along edges. They produce readable clusters at small "
        "scale and an unreadable hairball past a few thousand nodes. Mitigations include "
        "filtering by edge weight, collapsing clusters into supernodes, and rendering only the "
        "neighbourhood of a selected node.",
    ),
    (
        "Entity resolution across sources",
        "The hardest part of building a graph from many documents is deciding when two mentions "
        "refer to the same thing. 'RAG', 'retrieval-augmented generation', and 'retrieval "
        "augmentation' should collapse to one node. Embedding similarity handles paraphrase well "
        "but conflates topics that are merely adjacent, so a threshold alone is not sufficient — "
        "alias lists and exact-match entity keys still carry weight.",
    ),
    (
        "Backlinks as a navigation primitive",
        "Bidirectional linking, popularised by wiki software and later by tools like Roam and "
        "Obsidian, means a page shows not only what it links to but what links to it. Backlinks "
        "turn a collection of documents into a navigable space: arriving at a page tells you "
        "where else the idea appears, which is often more useful than the page's own content.",
    ),
    # ── cluster 3: embeddings and semantic similarity ───────────────────────
    (
        "Cosine similarity and why direction beats magnitude",
        "Cosine similarity measures the angle between two vectors and ignores their length. For "
        "text embeddings this is the right choice, because vector magnitude tends to track "
        "document length rather than meaning. Two passages about the same topic should be judged "
        "similar whether one is a paragraph and the other is a page.",
    ),
    (
        "Vector indexes and approximate nearest neighbour search",
        "Exact nearest-neighbour search over embeddings is linear in the size of the collection, "
        "which stops being viable quickly. Vector indexes trade a small amount of recall for a "
        "large speedup, using structures like HNSW graphs or partitioned trees. CockroachDB added "
        "a native VECTOR type in v24.2 and distributed vector indexing in v25.2, which means "
        "similarity search can live in the same transactional store as the rest of the data.",
    ),
    (
        "Embedding dimensionality and storage cost",
        "Embedding models emit vectors of a fixed width — commonly 384, 768, or 1024 dimensions. "
        "Wider vectors capture more nuance and cost proportionally more to store and compare. "
        "Amazon Titan Text Embeddings V2 can emit 256, 512, or 1024 dimensions from the same "
        "model, letting a system trade accuracy against cost without changing providers.",
    ),
    (
        "Similarity thresholds are model-specific",
        "A cosine similarity of 0.75 does not mean the same thing across embedding models. "
        "Uncentered models place unrelated text at a high baseline similarity, so a threshold "
        "tuned for one model will merge far too eagerly or never merge at all on another. Any "
        "system that makes decisions on a similarity threshold has to calibrate that threshold "
        "per model, and recalibrate when the model changes.",
    ),
    (
        "Why embeddings from different models cannot be compared",
        "Two embedding models produce vectors in unrelated coordinate spaces. A vector from one "
        "and a vector from another have no meaningful geometric relationship, even when both are "
        "the same width. Any store that permits the embedding model to change must record which "
        "model produced each vector and re-embed the collection when it changes, or similarity "
        "comparisons silently become noise.",
    ),
    (
        "Chunking strategies and their failure modes",
        "Splitting documents for embedding is a lossy decision made before any question is asked. "
        "Fixed-size chunks cut mid-argument; paragraph chunks vary wildly in information density; "
        "semantic chunking is expensive and still guesses. Every strategy discards some context, "
        "which is a large part of why compiling a document into a structured page is attractive: "
        "the structure survives, where chunk boundaries destroy it.",
    ),
]


class SeedAuthError(RuntimeError):
    """Raised with something the reader can act on, not a stack trace."""


async def _bearer_token(client: httpx.AsyncClient, settings) -> str:
    """A workspace-scoped token to seed into.

    Seeding used to post with no Authorization header at all, which worked only
    while the API allowed anonymous writes. With `ALLOW_ANONYMOUS=false` — the
    setting any real deployment uses — every one of the eighteen sources came
    back 401, so the command the README hands new users failed completely.

    There is no way around holding a real identity: items are scoped to a
    workspace, and a seed that invented one would put the demo content somewhere
    the reader cannot see.
    """
    token = os.environ.get("SEED_TOKEN")
    if token:
        return token

    email = os.environ.get("SEED_EMAIL")
    password = os.environ.get("SEED_PASSWORD")
    if not (email and password):
        raise SeedAuthError(
            "Seeding needs an account to seed into. Either set SEED_EMAIL and "
            "SEED_PASSWORD for the account you signed up with, or paste a token "
            "into SEED_TOKEN (the app mints one at "
            f"{settings.auth_base_url}/api/auth/token while signed in)."
        )

    auth = settings.auth_base_url.rstrip("/")
    # Better Auth checks Origin on state-changing requests.
    headers = {"Origin": auth, "Content-Type": "application/json"}

    signin = await client.post(
        f"{auth}/api/auth/sign-in/email",
        json={"email": email, "password": password},
        headers=headers,
    )
    if signin.status_code != 200:
        raise SeedAuthError(f"Could not sign in as {email} ({signin.status_code}).")

    cookies = signin.cookies

    # A fresh session has no active organization and the API refuses to guess
    # one, so the first workspace is selected explicitly.
    orgs = await client.get(f"{auth}/api/auth/organization/list", cookies=cookies)
    listed = orgs.json() if orgs.status_code == 200 else []
    if not listed:
        raise SeedAuthError(
            f"{email} has no workspace yet. Sign in to the app once to create one."
        )

    await client.post(
        f"{auth}/api/auth/organization/set-active",
        json={"organizationId": listed[0]["id"]},
        headers=headers,
        cookies=cookies,
    )

    minted = await client.get(f"{auth}/api/auth/token", cookies=cookies)
    token = minted.json().get("token") if minted.status_code == 200 else None
    if not token:
        raise SeedAuthError("Signed in, but the app would not mint an API token.")

    print(f"Seeding into “{listed[0].get('name', 'workspace')}” as {email}")
    return token


async def seed() -> int:
    settings = get_settings()
    base = f"http://127.0.0.1:{settings.api_port}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            health = await client.get(f"{base}/health")
            health.raise_for_status()
        except httpx.HTTPError:
            print(f"Cannot reach the API at {base}. Start it with `pnpm api:dev` first.")
            return 1

        info = health.json()
        print(
            f"API up · embeddings: {info.get('embeddingProvider')} "
            f"· model: {info.get('chatModel')}"
        )
        try:
            token = await _bearer_token(client, settings)
        except SeedAuthError as exc:
            print(f"\n{exc}")
            return 1
        auth_header = {"Authorization": f"Bearer {token}"}

        print(f"Seeding {len(SOURCES)} sources across 3 overlapping clusters\n")

        created = duplicate = failed = 0
        for index, (title, body) in enumerate(SOURCES, start=1):
            try:
                response = await client.post(
                    f"{base}/api/v1/items",
                    json={"captureType": "paste", "title": title, "content": body},
                    headers=auth_header,
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                failed += 1
                print(f"  {index:2}. FAILED  {title} — {exc}")
                continue

            result = response.json()
            if result.get("duplicate"):
                duplicate += 1
                print(f"  {index:2}. dup     {title}")
            else:
                created += 1
                print(f"  {index:2}. queued  {title}")

            # Compiles are queued, and each one matches against pages written by
            # earlier ones. Pacing keeps that ordering intact — firing all
            # eighteen at once would have several of them match an empty wiki and
            # create duplicate pages on the same topic.
            await asyncio.sleep(1.5)

    print(f"\nqueued {created} · already present {duplicate} · failed {failed}")
    if created:
        print("Watch them compile at http://localhost:3000")
    return 0 if failed == 0 else 1


def main() -> None:
    sys.exit(asyncio.run(seed()))


if __name__ == "__main__":
    main()
