from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.refresh_token import RefreshToken

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_MFA = "mfa"

# Hash usado para gastar o mesmo tempo quando o usuário não existe (evita enumeração por tempo).
_DUMMY_HASH = pwd_context.hash(uuid.uuid4().hex)


def hash_password(plain_password: str) -> str:
	return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
	return pwd_context.verify(plain_password, hashed_password)


def verify_password_dummy(plain_password: str) -> None:
	pwd_context.verify(plain_password, _DUMMY_HASH)


def _encode(claims: dict, expires_delta: timedelta) -> str:
	now = datetime.now(tz=timezone.utc)
	payload = {
		**claims,
		"iss": settings.JWT_ISSUER,
		"aud": settings.JWT_AUDIENCE,
		"iat": now,
		"nbf": now,
		"exp": now + expires_delta,
		"jti": uuid.uuid4().hex,
	}
	return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str, user_id: int, role: int, expires_minutes: Optional[int] = None) -> str:
	expires_delta = timedelta(minutes=expires_minutes or settings.JWT_ACCESS_EXPIRES_MINUTES)
	claims = {"sub": subject, "uid": user_id, "role": role, "typ": TOKEN_TYPE_ACCESS}
	return _encode(claims, expires_delta)


def create_mfa_token(user_id: int) -> str:
	"""Token curto que comprova a etapa da senha; só serve para /auth/mfa/*."""
	claims = {"sub": str(user_id), "uid": user_id, "typ": TOKEN_TYPE_MFA}
	return _encode(claims, timedelta(minutes=settings.JWT_MFA_EXPIRES_MINUTES))


def decode_token(token: str, expected_type: str = TOKEN_TYPE_ACCESS) -> Optional[dict]:
	"""Valida assinatura, algoritmo fixo, exp/nbf/iat, iss, aud e o tipo do token."""
	try:
		payload = jwt.decode(
			token,
			settings.JWT_SECRET,
			algorithms=[settings.JWT_ALGORITHM],
			issuer=settings.JWT_ISSUER,
			audience=settings.JWT_AUDIENCE,
			options={"require": ["exp", "iat", "nbf", "iss", "aud", "sub", "jti"]},
		)
	except jwt.PyJWTError:
		return None
	if payload.get("typ") != expected_type:
		return None
	return payload


def create_refresh_token(db: Session, user_id: int, expires_days: Optional[int] = None) -> str:
	"""Gera um refresh token UUID, armazena no banco de dados com data de expiração e retorna a string do token."""
	token_str = str(uuid.uuid4())
	days = expires_days or settings.JWT_REFRESH_EXPIRES_DAYS
	expires_at = datetime.now(tz=timezone.utc) + timedelta(days=days)

	refresh_token = RefreshToken(
		token=token_str,
		user_id=user_id,
		expires_at=expires_at,
	)
	db.add(refresh_token)
	db.commit()
	return token_str


def validate_refresh_token(db: Session, token: str) -> Optional[int]:
	"""Busca o token, verifica se não está revogado nem expirado. Retorna user_id ou None."""
	record = db.query(RefreshToken).filter(RefreshToken.token == token).first()
	if not record:
		return None
	if record.revoked_at is not None:
		return None
	now = datetime.now(tz=timezone.utc)
	expires = record.expires_at
	if expires.tzinfo is None:
		expires = expires.replace(tzinfo=timezone.utc)
	if now >= expires:
		return None
	return record.user_id


def revoke_refresh_token(db: Session, token: str) -> bool:
	"""Define revoked_at no registro do token. Retorna True se encontrado e revogado."""
	record = db.query(RefreshToken).filter(RefreshToken.token == token).first()
	if not record:
		return False
	record.revoked_at = datetime.now(tz=timezone.utc)
	db.commit()
	return True


def rotate_refresh_token(db: Session, old_token: str, user_id: int) -> Optional[str]:
	"""Revoga o token antigo e cria um novo (rotação por segurança). Retorna o novo token ou None."""
	revoked = revoke_refresh_token(db, old_token)
	if not revoked:
		return None
	return create_refresh_token(db, user_id)
