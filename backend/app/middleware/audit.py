"""Registro de alterações (métodos que modificam dados) para auditoria centralizada."""
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.auth.security import decode_token

audit_logger = logging.getLogger("sigra.audit")
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _user_id(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else request.cookies.get("access_token")
    payload = decode_token(token) if token else None
    return payload.get("uid") if payload else None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in MUTATING_METHODS:
            return await call_next(request)
        start = time.monotonic()
        response = await call_next(request)
        audit_logger.info(
            "http.change",
            extra={
                "event": "http.change",
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "user_id": _user_id(request),
                "ip": request.client.host if request.client else None,
                "duration_ms": round((time.monotonic() - start) * 1000),
            },
        )
        return response
