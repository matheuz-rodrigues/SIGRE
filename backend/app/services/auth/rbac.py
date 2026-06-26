from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.models import Usuario
from app.services.auth.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

ROLE_USER = 1
ROLE_ADMIN = 3
ROLE_TECNICO_ADM = 4


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
	payload = decode_token(token)
	if not payload:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
	user_id = payload.get("uid")
	if not user_id:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
	user = db.query(Usuario).filter(Usuario.id == user_id, Usuario.deleted_at.is_(None)).first()
	if not user:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
	return user


def require_role(min_role: int):
	def role_checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
		role = int(current_user.tipo_usuario or ROLE_USER)
		if role < min_role:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
		return current_user

	return role_checker


def require_role_exact(*allowed: int):
	"""Restricts access to users whose tipo_usuario is exactly one of the allowed values."""
	def role_checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
		role = int(current_user.tipo_usuario or ROLE_USER)
		if role not in allowed:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
		return current_user

	return role_checker


