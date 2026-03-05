"""
Session auth for the API that does not enforce CSRF.
Used so the SPA on a different origin (e.g. localhost:3025) can POST
login/register/logout without sending a CSRF token.
CSRF is still enforced by Django for non-API views (e.g. admin).
"""
from rest_framework.authentication import SessionAuthentication


class SessionAuthenticationNoCSRF(SessionAuthentication):
    def enforce_csrf(self, request):
        # Skip CSRF so SPA can use session auth cross-origin.
        pass
