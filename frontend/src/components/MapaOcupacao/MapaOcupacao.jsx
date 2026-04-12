import React, { useEffect, useState, useMemo } from 'react';
import { Search, Clock, MapPin, GraduationCap, FileText, Calendar, Loader2, X, Plus, Trash2, BookOpen, User, AlertCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getReservations, createReservation, deleteReservation } from '../../services/ReservationService';
import { getRooms }   from '../../services/RoomService';
import { getPeriods } from '../../services/PeriodService';
import { getCursos }  from '../../services/CouserService';
import api from '../../services/api';

const Shift = { MANHA: 'MANHA', TARDE: 'TARDE' }
const SLOTS = [
  { label: "07:30-08:20", horaInicio: "07:30", horaFim: "08:20", shift: Shift.MANHA },
  { label: "08:20-09:10", horaInicio: "08:20", horaFim: "09:10", shift: Shift.MANHA },
  { label: "09:10-10:00", horaInicio: "09:10", horaFim: "10:00", shift: Shift.MANHA },
  { label: "10:00-10:15", horaInicio: "10:00", horaFim: "10:15", shift: Shift.MANHA, isBreak: true },
  { label: "10:15-11:05", horaInicio: "10:15", horaFim: "11:05", shift: Shift.MANHA },
  { label: "11:05-11:55", horaInicio: "11:05", horaFim: "11:55", shift: Shift.MANHA },
  { label: "13:30-14:20", horaInicio: "13:30", horaFim: "14:20", shift: Shift.TARDE },
  { label: "14:20-15:10", horaInicio: "14:20", horaFim: "15:10", shift: Shift.TARDE },
  { label: "15:10-16:00", horaInicio: "15:10", horaFim: "16:00", shift: Shift.TARDE },
  { label: "16:00-16:15", horaInicio: "16:00", horaFim: "16:15", shift: Shift.TARDE, isBreak: true },
  { label: "17:05-17:55", horaInicio: "17:05", horaFim: "17:55", shift: Shift.TARDE },
  { label: "17:55-18:45", horaInicio: "17:55", horaFim: "18:45", shift: Shift.TARDE },
]
const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const WEEKDAY_NUM = { "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6 }

const proximaData = (diaSemana) => {
  const hoje = new Date(); const alvo = WEEKDAY_NUM[diaSemana]
  const diff = (alvo - hoje.getDay() + 7) % 7 || 7
  const d = new Date(hoje); d.setDate(hoje.getDate() + diff); return d
}
const montarISO = (data, hora) => {
  const d = new Date(data); const [h, m] = hora.split(':'); const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`
}
const parseSlotMinutos = (label) => {
  const [h, m] = label.split('-')[0].split(':').map(Number); return h * 60 + m
}

export default function MapaOcupacao() {
  const isAdmin  = localStorage.getItem('userRole') === 'admin'
  const [filtroCursoId, setFiltroCursoId] = useState('')
  const [filtroPeriodoId, setFiltroPeriodoId] = useState('')
  const [todasReservas, setTodasReservas] = useState([])
  const [salas, setSalas] = useState([]); const [periodos, setPeriodos] = useState([])
  const [cursos, setCursos] = useState([]); const [professores, setProfessores] = useState([])
  const [disciplinas, setDisciplinas] = useState([]); const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ professorId: '', disciplinaId: '', salaId: '' })
  const [salvando, setSalvando] = useState(false); const [erroModal, setErroModal] = useState('')

  const carregar = async () => {
    setLoading(true)
    try {
      const [resRes, resSal, resPer, resCur, resPro, resDis] = await Promise.all([
        getReservations({ _t: Date.now() }), getRooms(), getPeriods(), getCursos(), api.get('/professors/'), api.get('/disciplines/'),
      ])
      const reservas = resRes?.items || resRes || []
      // DEBUG — mostra a primeira reserva no console para inspecionar os campos retornados
      if (reservas.length > 0) {
        console.log('[MapaOcupacao] Exemplo de reserva do backend:', JSON.stringify(reservas[0], null, 2))
      } else {
        console.log('[MapaOcupacao] Backend retornou 0 reservas.')
      }
      setTodasReservas(reservas)
      setSalas(resSal || []); setPeriodos(resPer || []); setCursos(resCur || [])
      setProfessores(resPro.data || []); setDisciplinas(resDis.data || [])
      if (resCur?.length && !filtroCursoId) setFiltroCursoId(String(resCur[0].id || resCur[0].idCurso))
      if (resPer?.length && !filtroPeriodoId) setFiltroPeriodoId(String(resPer[0].id || resPer[0].idPeriodo))
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  const abrirModal = (slot, dia) => {
    if (!isAdmin) return
    setErroModal('')
    setForm({ professorId: '', disciplinaId: '', salaId: '' })
    setModal({ slot, dia })
  }

  // Extrai campos normalizados de uma reserva, cobrindo todos os nomes possíveis do backend
  const extrair = (r) => {
    const priv = r.extendedProperties?.private || {}

    // Tenta extrair META da justificativa
    let hiddenCursoId = '', hiddenPeriodoId = '', hiddenProfId = '', hiddenDiscId = ''
    const rawJust = r.justificativa || r.description || priv.justificativa || ''
    if (rawJust.includes('| META:')) {
      try {
        const meta = JSON.parse(rawJust.split('| META:')[1])
        hiddenCursoId  = String(meta.cId   ?? '')
        hiddenPeriodoId= String(meta.pId   ?? '')
        hiddenProfId   = String(meta.profId?? '')
        hiddenDiscId   = String(meta.dId   ?? '')
      } catch(e){}
    }

    // cursoId — cobre todos os nomes possíveis
    const cursoId = hiddenCursoId
      || String(r.cursoId   ?? r.curso_id   ?? r.fk_curso   ?? priv.cursoId   ?? '')

    // periodoId — cobre todos os nomes possíveis
    const periodoId = hiddenPeriodoId
      || String(r.periodoId ?? r.periodo_id ?? r.fk_periodo ?? priv.periodoId ?? '')

    // salaId
    const salaId = String(r.salaId ?? r.sala_id ?? r.salald ?? priv.salaId ?? '')

    // professorId
    const professorId = hiddenProfId
      || String(r.professorId ?? r.professor_id ?? r.fk_professor ?? priv.professorId ?? '')

    // disciplinaId
    const disciplinaId = hiddenDiscId
      || String(r.disciplinaId ?? r.disciplina_id ?? r.disciplinald ?? priv.disciplinaId ?? '')

    // inicio — tenta todos os campos de data
    const inicio = r.dia_horario_inicio ?? r.dataInicio ?? r.start?.dateTime ?? r.start ?? ''

    // diaSemana — campo salvo explicitamente no POST
    const diaSemana = r.diaSemana ?? r.dia_semana ?? priv.diaSemana ?? ''

    // uso/nome da disciplina
    const uso = r.uso ?? r.summary ?? priv.uso ?? ''

    return { cursoId, periodoId, salaId, professorId, disciplinaId, inicio, diaSemana, uso }
  }

  const reservasFiltradas = useMemo(() => {
    return todasReservas.filter(r => {
      const d = extrair(r)
      const okCurso   = !filtroCursoId   || d.cursoId   === String(filtroCursoId)
      const okPeriodo = !filtroPeriodoId || d.periodoId === String(filtroPeriodoId)
      return okCurso && okPeriodo
    })
  }, [todasReservas, filtroCursoId, filtroPeriodoId])

  const encontrarReserva = (slot, dia) => {
    if (slot.isBreak) return null
    const slotMin = parseSlotMinutos(slot.label)
    const diaNum  = WEEKDAY_NUM[dia]

    return reservasFiltradas.find(r => {
      const d = extrair(r)

      // 1) Compara pelo campo diaSemana gravado (mais confiável)
      if (d.diaSemana) {
        if (d.diaSemana !== dia) return false
      } else {
        // 2) Fallback: deriva o dia da data, removendo Z para evitar shift UTC
        if (!d.inicio) return false
        const isoLocal = String(d.inicio).replace('Z', '')
        const startDate = new Date(isoLocal)
        if (startDate.getDay() !== diaNum) return false
      }

      // Compara horário de início com o slot (tolerância de 10 min)
      const isoLocal = String(d.inicio).replace('Z', '')
      const start = new Date(isoLocal)
      const startMin = start.getHours() * 60 + start.getMinutes()
      return Math.abs(startMin - slotMin) <= 10
    })
  }

  const salvarAula = async () => {
    if (!form.disciplinaId || !form.professorId || !form.salaId) {
      setErroModal('Preencha todos os campos antes de salvar.')
      return
    }
    setSalvando(true); setErroModal('')
    try {
      const data   = proximaData(modal.dia)
      const inicio = montarISO(data, modal.slot.horaInicio)
      const fim    = montarISO(data, modal.slot.horaFim)
      const userId = localStorage.getItem('userId')

      const meta = JSON.stringify({
        cId:    filtroCursoId,
        pId:    filtroPeriodoId,
        profId: form.professorId,
        dId:    form.disciplinaId
      })

      const discNome = disciplinas.find(d => String(d.id || d.idDisciplina) === form.disciplinaId)?.nomeDisciplina || ''
      const profNome = professores.find(p => String(p.id || p.idProfessor) === form.professorId)?.nomeProf || ''

      await createReservation({
        fk_usuario:         Number(userId),
        salaId:             Number(form.salaId),
        professorId:        Number(form.professorId),
        disciplinaId:       Number(form.disciplinaId),
        cursoId:            Number(filtroCursoId),
        periodoId:          Number(filtroPeriodoId),
        tipo:               'AULA',
        dia_horario_inicio: inicio,
        dia_horario_saida:  fim,
        diaSemana:          modal.dia,
        dataInicio:         inicio,
        dataFim:            fim,
        uso:                discNome,
        justificativa:      `${discNome} - ${profNome} | META:${meta}`,
        status:             'APPROVED'
      })

      setModal(null)
      carregar()
    } catch (err) {
      console.error('[MapaOcupacao] Erro ao salvar:', err)
      setErroModal('Erro ao salvar. Verifique o console para detalhes.')
    } finally { setSalvando(false) }
  }

  const nomeProf = (id) => professores.find(p => String(p.id || p.idProfessor) === id)?.nomeProf || 'Prof.'
  const nomeSala = (id) => salas.find(s => String(s.id || s.idSala) === id)?.nomeSala || 'Sala'

  const RenderTabela = ({ titulo, turno }) => (
    <div className="mb-10">
      <h2 className="text-lg font-black text-slate-700 mb-4">{titulo}</h2>
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
        <table className="w-full border-collapse">
          <thead><tr className="bg-[#1c1aa3] text-white">
            <th className="p-4 text-left text-xs uppercase w-28">Horário</th>
            {WEEKDAYS.map(d => <th key={d} className="p-4 text-xs uppercase">{d}</th>)}
          </tr></thead>
          <tbody>{SLOTS.filter(s => s.shift === turno).map((slot, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="p-4 text-[10px] font-black bg-slate-50 text-slate-500">{slot.label}</td>
              {WEEKDAYS.map(dia => {
                const res = encontrarReserva(slot, dia)
                const d   = res ? extrair(res) : null
                return (
                  <td key={dia} className="p-1.5 border-l min-w-[120px]">
                    {slot.isBreak
                      ? <div className="text-center text-[8px] text-amber-400 font-black">PAUSA</div>
                      : res
                        ? (
                          <div className="p-2 rounded-lg border border-blue-200 bg-blue-50 relative group">
                            <p className="text-[9px] text-blue-700 font-black">{d.uso}</p>
                            <p className="text-[8px] text-blue-600 flex items-center gap-1"><User size={8}/> {nomeProf(d.professorId)}</p>
                            <p className="text-[8px] text-blue-500 flex items-center gap-1 uppercase"><MapPin size={8}/> {nomeSala(d.salaId)}</p>
                            {isAdmin && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (window.confirm('Excluir esta aula?')) {
                                    await deleteReservation(res.id, true)
                                    carregar()
                                  }
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-red-100 p-1 rounded-full text-red-500"
                              ><Trash2 size={10}/></button>
                            )}
                          </div>
                        )
                        : (
                          <div
                            onClick={() => abrirModal(slot, dia)}
                            className={`h-16 border border-dashed rounded-lg flex items-center justify-center transition-all ${isAdmin ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                          >
                            {isAdmin && <Plus size={14} className="text-slate-300"/>}
                          </div>
                        )
                    }
                  </td>
                )
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={40}/>
    </div>
  )

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-black text-[#1c1aa3]">MAPA DE OCUPAÇÃO</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-3 rounded-xl border flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-400">CURSO</label>
          <select value={filtroCursoId} onChange={e => setFiltroCursoId(e.target.value)} className="text-sm font-bold bg-transparent outline-none">
            {cursos.map(c => <option key={c.id || c.idCurso} value={String(c.id || c.idCurso)}>{c.nomeCurso}</option>)}
          </select>
        </div>
        <div className="bg-white p-3 rounded-xl border flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-400">PERÍODO</label>
          <select value={filtroPeriodoId} onChange={e => setFiltroPeriodoId(e.target.value)} className="text-sm font-bold bg-transparent outline-none">
            {periodos.map(p => <option key={p.id || p.idPeriodo} value={String(p.id || p.idPeriodo)}>{p.semestre}</option>)}
          </select>
        </div>
      </div>

      <RenderTabela titulo="TURNO: MANHÃ" turno={Shift.MANHA} />
      <RenderTabela titulo="TURNO: TARDE" turno={Shift.TARDE} />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-black mb-1">Adicionar Aula</h2>
            <p className="text-xs text-slate-400 mb-4">{modal.dia} · {modal.slot.label}</p>
            {erroModal && <div className="p-2 bg-red-50 text-red-600 text-xs rounded mb-4">{erroModal}</div>}
            <div className="space-y-4">
              <select value={form.disciplinaId} onChange={e => setForm({...form, disciplinaId: e.target.value})} className="w-full p-2.5 border rounded-xl text-sm">
                <option value="">Selecione a Disciplina...</option>
                {disciplinas.map(d => <option key={d.id || d.idDisciplina} value={String(d.id || d.idDisciplina)}>{d.nomeDisciplina}</option>)}
              </select>
              <select value={form.professorId} onChange={e => setForm({...form, professorId: e.target.value})} className="w-full p-2.5 border rounded-xl text-sm">
                <option value="">Selecione o Professor...</option>
                {professores.map(p => <option key={p.id || p.idProfessor} value={String(p.id || p.idProfessor)}>{p.nomeProf}</option>)}
              </select>
              <select value={form.salaId} onChange={e => setForm({...form, salaId: e.target.value})} className="w-full p-2.5 border rounded-xl text-sm">
                <option value="">Selecione a Sala...</option>
                {salas.map(s => <option key={s.id || s.idSala} value={String(s.id || s.idSala)}>{s.nomeSala}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2 border rounded-xl">Cancelar</button>
              <button onClick={salvarAula} disabled={salvando} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}