"""The HTTP surface: routers and the dependencies they inject.

Routers stay thin — they validate, delegate to a service, and shape the
response. Anything that reads or writes the knowledge base lives in
`app.services`, so the same operation can be exercised without a request.
"""
