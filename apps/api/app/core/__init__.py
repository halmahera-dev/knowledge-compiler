"""Cross-cutting machinery: settings, database session, auth, queue, scoping.

Nothing here knows about a specific endpoint or a specific piece of domain
logic. If a module would have to import from `app.services` to do its job, it
belongs in services rather than here.
"""
