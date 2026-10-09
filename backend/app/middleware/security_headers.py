"""Cabeçalhos de segurança HTTP nas respostas da API."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# A API só devolve JSON/redirecionamentos: nada deve ser executado nem enquadrado
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_PATHS = ("/docs", "/redoc")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, hsts: bool):
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # Swagger/ReDoc (só fora de produção) carregam scripts de CDN
        if not request.url.path.startswith(DOCS_PATHS):
            headers.setdefault("Content-Security-Policy", API_CSP)
        if self.hsts:
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
