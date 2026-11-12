"""CORS com lista fixa de origens que não dá nenhuma pista a origens recusadas."""
from starlette.datastructures import Headers
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import PlainTextResponse, Response


class StrictCORSMiddleware(CORSMiddleware):
    def preflight_response(self, request_headers: Headers) -> Response:
        # O Starlette devolve Allow-Credentials/Methods/Headers mesmo quando recusa a origem
        if not self.is_allowed_origin(origin=request_headers.get("origin", "")):
            return PlainTextResponse("Disallowed CORS origin", status_code=400)
        return super().preflight_response(request_headers)
