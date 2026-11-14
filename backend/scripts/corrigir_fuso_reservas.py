"""
Corrige reservas gravadas 3 h depois do horário escolhido (bug B3 do relatório de testes E2E).

Antes da correção, "Novo evento" e "Nova aula" gravavam o horário em UTC numa coluna lida como
hora de Belém. Reservas vindas de solicitação aprovada (tipo SOLICITACAO) sempre foram gravadas
certas e ficam de fora.

Uso (de backend/):
    python scripts/corrigir_fuso_reservas.py                      # só lista as candidatas
    python scripts/corrigir_fuso_reservas.py --ids 12,15 --aplicar
    python scripts/corrigir_fuso_reservas.py --ids 12,15 --aplicar --sincronizar-google --admin-email adm@uepa.br

Revise a lista com o time antes de aplicar: nem toda reserva candidata está errada.
Só o início e o fim (e as datas de EXDATE) são deslocados. `data_inicio`/`data_fim` não mudam:
o front manda essas datas como meia-noite UTC, e elas só marcam o dia.
"""
import argparse
import os
import re
import sys
from datetime import datetime, timedelta

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.try_database import SessionLocal
from app.models import *  # noqa: F401,F403 - registra todos os modelos
from app.models.allocation import Alocacao
from app.models.room import Sala
from app.models.user import Usuario

DESLOCAMENTO = timedelta(hours=3)
_EXDATE_VALUE = re.compile(r"\d{8}T\d{6}")


def _corrigir_exdate(recurrency: str) -> str:
    def corrigir_linha(linha: str) -> str:
        if not linha.startswith("EXDATE"):
            return linha
        return _EXDATE_VALUE.sub(
            lambda m: (datetime.strptime(m.group(0), "%Y%m%dT%H%M%S") - DESLOCAMENTO).strftime("%Y%m%dT%H%M%S"),
            linha,
        )
    return "\n".join(corrigir_linha(linha) for linha in recurrency.split("\n"))


def listar(db) -> list[Alocacao]:
    return (
        db.query(Alocacao)
        .filter(Alocacao.tipo != "SOLICITACAO")
        .order_by(Alocacao.dia_horario_inicio)
        .all()
    )


def imprimir(alocacoes: list[Alocacao]) -> None:
    print(f"{'id':>6}  {'sala':<10} {'status':<9} {'tipo':<10} {'início atual':<17} → {'corrigido':<17}  uso")
    for a in alocacoes:
        sala = a.sala.codigo_sala if a.sala else a.fk_sala
        inicio = a.dia_horario_inicio
        recorrente = " (semanal)" if a.recurrency else ""
        print(
            f"{a.id:>6}  {str(sala):<10} {a.status:<9} {a.tipo:<10} "
            f"{inicio:%d/%m/%Y %H:%M} → {inicio - DESLOCAMENTO:%d/%m/%Y %H:%M}  {a.uso or ''}{recorrente}"
        )
    print(f"\n{len(alocacoes)} reserva(s) candidata(s).")


def aplicar(db, ids: list[int], sincronizar_google: bool, admin_email: str | None) -> None:
    alocacoes = db.query(Alocacao).filter(Alocacao.id.in_(ids), Alocacao.tipo != "SOLICITACAO").all()
    faltando = set(ids) - {a.id for a in alocacoes}
    if faltando:
        sys.exit(f"Ids inexistentes ou de solicitação (não corrigidos): {sorted(faltando)}")

    admin = None
    if sincronizar_google:
        admin = db.query(Usuario).filter(Usuario.email == admin_email).first() if admin_email else None
        if not admin:
            sys.exit("--sincronizar-google exige --admin-email de um admin existente.")

    for a in alocacoes:
        a.dia_horario_inicio -= DESLOCAMENTO
        a.dia_horario_saida -= DESLOCAMENTO
        if a.recurrency:
            a.recurrency = _corrigir_exdate(a.recurrency)
    db.commit()
    print(f"{len(alocacoes)} reserva(s) corrigida(s) no banco.")

    if not sincronizar_google:
        return

    from app.services.booking.reservation_service import allocation_service
    for a in alocacoes:
        if a.status != "APPROVED" or not a.google_event_id:
            continue
        room = db.query(Sala).filter(Sala.id == a.fk_sala).first()
        try:
            allocation_service._sync_google_update(db, a, admin, room)
            print(f"  Google atualizado: reserva {a.id}")
        except Exception as exc:  # segue com as outras; o erro fica no relatório
            print(f"  FALHA no Google para a reserva {a.id}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ids", help="ids revisados, separados por vírgula")
    parser.add_argument("--aplicar", action="store_true", help="grava a correção (sem isso, só lista)")
    parser.add_argument("--sincronizar-google", action="store_true", help="atualiza os eventos aprovados no Google")
    parser.add_argument("--admin-email", help="admin usado como usuário atual na sincronização com o Google")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if not args.aplicar:
            imprimir(listar(db))
            return
        if not args.ids:
            sys.exit("--aplicar exige --ids com as reservas revisadas.")
        ids = [int(i) for i in args.ids.split(",") if i.strip()]
        aplicar(db, ids, args.sincronizar_google, args.admin_email)
    finally:
        db.close()


if __name__ == "__main__":
    main()
