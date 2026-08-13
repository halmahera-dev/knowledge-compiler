"""One-off entry points, run by hand rather than served.

Seeding and backfills. Kept out of the application package proper so that
importing the app never drags in a migration script, and so it is obvious which
modules are operational tools rather than product code.
"""
