---
name: vector-index-on-the-write-path
description: Use when building agent memory on CockroachDB vector indexing and deciding where the k-NN query belongs. Running it at write time — to decide whether new material joins an existing record or creates one — produces a memory that consolidates, while running it only at read time produces a growing pile of near-duplicates that must be re-ranked on every question. Covers the write-time merge decision, why the similarity threshold must follow the embedding model rather than be a global constant, and how to calibrate it.
---

# Deciding at write time, not at read time

## When this applies

Any agent memory where new material arrives repeatedly on topics the store has
seen before: saved articles, meeting notes, support threads, crawled documents.

## The choice

The reflexive design embeds on write and searches on read. Every document is
kept, and each question runs k-NN to find the closest few.

That is correct for retrieval over a fixed corpus. It is the wrong shape for
memory, because nothing ever consolidates. Ten articles about one topic stay ten
rows, the model re-derives the same summary on every question, and contradictions
between them are never noticed — no step ever compares them to each other.

Moving the query to the write path changes what the store *is*:

```sql
SELECT id, 1 - (embedding <=> $1) AS similarity
FROM wiki_pages
WHERE workspace_id = $2
ORDER BY embedding <=> $1
LIMIT $3
```

Run at ingest, this answers "does this belong to something I already know?" —
and its answer decides whether the write creates a record or merges into one.
Reads afterwards are ordinary indexed lookups of already-consolidated prose.

The cost moves to where it belongs. Ingest is once per document; questions are
many, and the expensive reasoning has already happened.

## The threshold follows the model

The tempting global constant is the trap. Cosine similarity is not comparable
across embedding models, and choosing one number for all of them means merging
everything on one and nothing on another.

Measured over one corpus, with unrelated text as the baseline:

| Model | Merge above | Unrelated text sits near |
| --- | --- | --- |
| Cohere Embed v4 | 0.40 | 0.24 |
| Titan Text v2 | 0.78 | — |
| bge-small (local) | 0.70 | 0.48 |

A single 0.78 merges nothing at all on Cohere. Carry the threshold with the
provider, and record which model produced each stored vector, so a provider
change is visible per row rather than a silent recalibration of history.

## Calibrating

Do not guess it. Take a corpus with known clusters, embed it, and look at the
similarity distribution for pairs you know are related against pairs you know
are not. Put the threshold between them, biased toward precision.

Bias that way because the two errors are not symmetric. A false merge fuses two
unrelated topics into one record and needs an explicit undo; a missed merge just
leaves two records that a later document can still join.

## Verifying

Confirm the planner is using the index rather than scanning — at write time a
full scan is paid on every single ingest:

```sql
EXPLAIN SELECT id FROM wiki_pages ORDER BY embedding <=> $1 LIMIT 5;
```

Then check the behaviour that matters: save the same topic twice and assert the
second save merged rather than created. That is one test, and it fails loudly
the day a threshold or a provider changes underneath you.
