import pytest
import os
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import asyncio
from httpx import Client

from app.try_database import Base, get_db
from app.main import app

# Setup up a SQLite in-memory database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module")
def db_session():
    # Create the tables
    Base.metadata.create_all(bind=engine)
    
    # Get a session
    db = TestingSessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        # Drop the tables after all tests in the session end
        Base.metadata.drop_all(bind=engine)

from fastapi.testclient import TestClient

@pytest.fixture(scope="module")
def client(db_session):
    # Override the dependency to use the test database
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    
    # Return fastapi TestClient
    with TestClient(app) as c:
        yield c
        
from app.services.security import create_access_token

@pytest.fixture
def test_admin_user(db_session):
    from app.models.user import Usuario
    # clean up first if exists
    admin = db_session.query(Usuario).filter(Usuario.email == "admin@test.com").first()
    if not admin:
        admin = Usuario(
            email="admin@test.com",
            username="admin_test",
            senha="hashed_password",
            tipo_usuario=3, # admin
            status="aprovado",
            nome="Admin Test"
        )
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)
    return admin

@pytest.fixture
def admin_token_headers(test_admin_user):
    access_token = create_access_token(
        subject=test_admin_user.email, 
        user_id=test_admin_user.id, 
        role=test_admin_user.tipo_usuario
    )
    return {"Authorization": f"Bearer {access_token}"}

@pytest.fixture(autouse=True)
def rollback_after_test(db_session):
    yield
    db_session.rollback()

@pytest.fixture(autouse=True)
def mock_google_calendar():
    fake_creds = MagicMock()
    with patch("app.services.google_calendar._get_credentials", return_value=fake_creds), \
         patch("app.services.google_calendar.list_events", return_value=[]), \
         patch("app.services.google_calendar.create_event", return_value={"id": "mock_event_id"}), \
         patch("app.services.google_calendar.update_event", return_value={"id": "mock_event_id"}), \
         patch("app.services.google_calendar.delete_event", return_value=True):
        yield
