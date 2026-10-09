"""Remove o MFA de um usuário (inclusive administradores) para novo cadastro no próximo login.

Uso (no container do back-end): python3 scripts/reset_mfa.py <email>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.try_database import SessionLocal  # noqa: E402
from app.models.user import Usuario  # noqa: E402
from app.services.auth import mfa  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    db = SessionLocal()
    try:
        user = db.query(Usuario).filter(Usuario.email == sys.argv[1].strip()).first()
        if not user:
            print("Usuário não encontrado")
            return 1
        print("MFA removido" if mfa.reset(db, user.id) else "Usuário não tinha MFA configurado")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
