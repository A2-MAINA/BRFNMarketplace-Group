from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    Session authentication without CSRF enforcement.
    Used when frontend and backend run on different origins (ports).
    CSRF is designed for same-origin forms, not cross-origin API calls.
    """
    def enforce_csrf(self, request):
        return