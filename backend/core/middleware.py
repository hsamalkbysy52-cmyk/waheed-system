from django.db import connection


class JWTTenantMiddleware:
    """Puts every request on the public schema.

    Ticket 03 adds the resolution rules from the plan (§3.2): a JWT selects the caller's
    Restaurant, a Super admin picks one with X-Restaurant-Id, and customer endpoints accept a
    Slug. Until then the connection is pinned to ``public`` on every request, so no request
    inherits a schema left on a reused database connection.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        connection.set_schema_to_public()
        return self.get_response(request)
