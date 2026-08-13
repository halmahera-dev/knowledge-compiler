---
name: cockroachdb-sum-widens-to-decimal
description: Use when writing aggregate queries against CockroachDB integer columns, especially through an ORM. SUM over an INT returns DECIMAL, so the familiar coalesce(sum(x), 0) pairs a decimal with an integer literal and CockroachDB rejects the statement outright with "incompatible COALESCE expressions" — a runtime 500 that neither typechecking nor a unit test with a mocked database will catch. Covers the cast that fixes it and the class of type-widening surprises it belongs to.
---

# SUM over an INT is a DECIMAL

## The error

```
incompatible COALESCE expressions: expected $1::INT8 to be of type decimal, found type int
```

From a query that looks entirely ordinary:

```sql
SELECT coalesce(sum(input_tokens), 0) FROM ai_usage_events;
```

## Why

CockroachDB widens `SUM` over an `INT` to `DECIMAL`, to avoid overflow on large
aggregates. `COALESCE` then receives a decimal branch and an integer branch and
refuses, rather than coercing one silently.

PostgreSQL behaves the same way for `bigint` inputs, so this is not exotic — but
it commonly surfaces first on CockroachDB, and it surfaces as a rejected
statement rather than a wrong number.

## The fix

Cast the sum back before the coalesce, so both branches are the same type:

```sql
SELECT coalesce(sum(input_tokens)::INT8, 0) FROM ai_usage_events;
```

Through SQLAlchemy:

```python
def _sum_int(column):
    """SUM over an integer column, as an integer, defaulting to zero."""
    return func.coalesce(cast(func.sum(column), BigInteger), 0)
```

Give it a name and use it everywhere rather than repeating the cast. The next
person writing an aggregate will write the obvious version otherwise, and it will
pass review because it looks right.

## Why it escapes testing

This is a database type error, so it appears only when the statement reaches a
real CockroachDB. It survives:

- typechecking, which sees a valid expression
- unit tests with a mocked or in-memory database
- code review, because the broken form is the idiomatic one

A dashboard endpoint built this way returns 500 for every user, on a code path
that was never exercised against the real database.

**Run aggregate endpoints against a real CockroachDB before shipping them.** One
call with real data is worth more here than any number of tests that never touch
the engine.

## The wider class

Anywhere a value changes type on its way through the database:

| Expression | Result type |
| --- | --- |
| `sum(int_col)` | `DECIMAL` |
| `avg(int_col)` | `DECIMAL` |
| `count(*)` | `INT` |
| `int_col / int_col` | `DECIMAL` — not integer division |

That last one is the other frequent surprise: division does not truncate. Use
`//` semantics deliberately with `div()` or a floor if truncation is what you
meant.
