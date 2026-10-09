"""Proteção CSRF (double-submit) para requisições autenticadas por cookie."""
import hmac

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Rotas sem sessão estabelecida (login, cadastro, MFA) ou que só usam o refresh cookie (path=/auth)
EXEMPT_PATHS = {
    "/auth/login",
    "/auth/token",
    "/auth/register",
    "/auth/refresh",
    "/auth/logout",
    "/auth/mfa/setup",
    "/auth/mfa/verify",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allowed_origins: list[str]):
        super().__init__(app)
        self.allowed_origins = set(allowed_origins)

    async def dispatch(self, request: Request, call_next):
        if request.method in UNSAFE_METHODS and request.url.path not in EXEMPT_PATHS:
            origin = request.headers.get("origin")
            if origin and origin.rstrip("/") not in self.allowed_origins:
                return JSONResponse({"detail": "Origem não permitida"}, status_code=403)

            # Header Authorization não é enviado automaticamente pelo navegador: sem risco de CSRF
            uses_cookie = "access_token" in request.cookies and "authorization" not in request.headers
            if uses_cookie:
                cookie_token = request.cookies.get("csrf_token", "")
                header_token = request.headers.get("x-csrf-token", "")
                if not cookie_token or not hmac.compare_digest(cookie_token, header_token):
                    return JSONResponse({"detail": "Token CSRF ausente ou inválido"}, status_code=403)
        return await call_next(request)
