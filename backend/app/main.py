from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from app.config import get_settings
from app.try_database import Base, engine
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    auth, users, rooms, reservations, calendar, google, 
    room_types, dashboard, professors, disciplines, 
    courses, reports, periods, solicitations
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine, checkfirst=True)
    yield

settings = get_settings()
app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)
origins = [
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https?://.*",  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.JWT_SECRET)

# app.include_router(usuario.router) - Removido em favor de /auth unificado
app.include_router(solicitations.router) # Nova rota
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(rooms.router)
app.include_router(room_types.router)
app.include_router(reservations.router)
app.include_router(calendar.router)
app.include_router(google.router)
app.include_router(dashboard.router)
app.include_router(professors.router)
app.include_router(disciplines.router)
app.include_router(courses.router)
app.include_router(reports.router)
app.include_router(periods.router)

@app.get("/health")
def health():
	return {"status": "ok"}
