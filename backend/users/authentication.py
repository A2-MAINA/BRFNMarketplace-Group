from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    Session auth without CSRF — used ONLY on the auth boundary
    (login + registration) where the client has no session/cookie yet.
    Every other endpoint uses standard SessionAuthentication via
    DEFAULT_AUTHENTICATION_CLASSES.
    """
    def enforce_csrf(self, request):
        return
