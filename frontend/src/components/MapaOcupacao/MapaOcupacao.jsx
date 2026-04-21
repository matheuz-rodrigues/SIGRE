import React, { useState, useMemo, useEffect } from 'react';
import { getCookie } from '../../utils/cookieUtils';
import { MapPin, FileText, Loader2, User, Clock, X, CheckCircle2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getReservations } from '../../services/ReservationService';
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

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

const parseSlotRange = (label) => {
  const [start, end] = label.split('-')
  return { start: timeToMinutes(start), end: timeToMinutes(end) }
}

export default function MapaOcupacao() {
  const userRole = getCookie('userRole')
  const isAdmin  = userRole === 'admin'
  const [filtroCursoId, setFiltroCursoId] = useState('')
  const [filtroPeriodoId, setFiltroPeriodoId] = useState('')
  const [todasReservas, setTodasReservas] = useState([])
  const [salas, setSalas] = useState([]); const [periodos, setPeriodos] = useState([])
  const [cursos, setCursos] = useState([]); const [professores, setProfessores] = useState([])
  const [disciplinas, setDisciplinas] = useState([]); const [loading, setLoading] = useState(true)
  const [detalhesSlot, setDetalhesSlot] = useState(null)

  const carregar = async () => {
    setLoading(true)
    try {
      const [resRes, resSal, resPer, resCur, resPro, resDis] = await Promise.all([
        getReservations({ _t: Date.now() }), getRooms(), getPeriods(), getCursos(), api.get('/professors/'), api.get('/disciplines/'),
      ])
      const reservas = resRes?.items || resRes || []
      setTodasReservas(reservas)
      setSalas(resSal || []); setPeriodos(resPer || []); setCursos(resCur || [])
      setProfessores(resPro.data || []); setDisciplinas(resDis.data || [])
      if (resCur?.length && !filtroCursoId) setFiltroCursoId(String(resCur[0].id || resCur[0].idCurso))
      if (resPer?.length && !filtroPeriodoId) setFiltroPeriodoId(String(resPer[0].id || resPer[0].idPeriodo))
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  // Extrai campos normalizados de uma reserva
  const extrair = (r) => {
    const priv = r.extendedProperties?.private || {}
    const cursoId = String(r.cursoId ?? r.curso_id ?? r.fk_curso ?? priv.cursoId ?? priv.fk_curso ?? '')
    const periodoId = String(r.periodoId ?? r.periodo_id ?? r.fk_periodo ?? priv.periodoId ?? priv.fk_periodo ?? '')
    const salaId = String(r.salaId ?? r.sala_id ?? r.salald ?? priv.salaId ?? priv.fk_sala ?? '')
    const professorId = String(r.fk_professor ?? r.professorId ?? r.professor_id ?? priv.fk_professor ?? priv.professorId ?? '')
    const disciplinaId = String(r.fk_disciplina ?? r.disciplinaId ?? r.disciplina_id ?? priv.fk_disciplina ?? priv.disciplinaId ?? '')
    const inicio = r.dia_horario_inicio ?? r.dataInicio ?? r.start?.dateTime ?? r.start ?? ''
    const diaSemana = r.diaSemana ?? r.dia_semana ?? priv.dia_semana ?? priv.diaSemana ?? ''
    const uso = r.uso ?? r.summary ?? priv.uso ?? ''
    const status = (r.status || 'PENDING').toLowerCase()
    
    // Calcular minutos de início e fim
    let startMin = 0, endMin = 0
    if (r.start?.dateTime) {
      const dt = new Date(r.start.dateTime.replace('Z', ''))
      startMin = dt.getHours() * 60 + dt.getMinutes()
      const edt = new Date(r.end.dateTime.replace('Z', ''))
      endMin = edt.getHours() * 60 + edt.getMinutes()
    } else if (r.dia_horario_inicio) {
        const dt = new Date(r.dia_horario_inicio.replace('Z', ''))
        startMin = dt.getHours() * 60 + dt.getMinutes()
        const edt = new Date(r.dia_horario_saida.replace('Z', ''))
        endMin = edt.getHours() * 60 + edt.getMinutes()
    }

    const dataInicioSeries = priv.data_inicio ? new Date(priv.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
    const dataFimSeries    = priv.data_fim    ? new Date(priv.data_fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''

    return { cursoId, periodoId, salaId, professorId, disciplinaId, inicio, diaSemana, uso, status, startMin, endMin, dataInicioSeries, dataFimSeries }
  }

  const reservasFiltradas = useMemo(() => {
    return todasReservas.filter(r => {
      const d = extrair(r)
      const okCurso   = !filtroCursoId   || d.cursoId   === String(filtroCursoId)
      const okPeriodo = !filtroPeriodoId || d.periodoId === String(filtroPeriodoId)
      return okCurso && okPeriodo
    })
  }, [todasReservas, filtroCursoId, filtroPeriodoId])

  const encontrarReservas = (slot, dia) => {
    if (slot.isBreak) return []
    const { start: sStart, end: sEnd } = parseSlotRange(slot.label)
    const diaNum  = WEEKDAY_NUM[dia]

    return reservasFiltradas.filter(r => {
      const d = extrair(r)
      
      // Validação de Dia
      if (d.diaSemana) {
        if (d.diaSemana !== dia) return false
      } else {
        if (!d.inicio) return false
        const dt = new Date(d.inicio.replace('Z', ''))
        if (dt.getDay() !== diaNum) return false
      }

      // Detecção de Sobreposição (Overlap)
      return (d.startMin < sEnd) && (d.endMin > sStart)
    })
  }

  const agruparMatches = (matches) => {
    if (!matches.length) return []
    
    // Sort: Approved first, then by date
    const sorted = [...matches].sort((a, b) => {
      const da = extrair(a), db = extrair(b);
      const isAppA = da.status === 'approved' || da.status === 'aprovado'
      const isAppB = db.status === 'approved' || db.status === 'aprovado'
      if (isAppA !== isAppB) return isAppA ? -1 : 1
      return 0
    })

    const groups = {}
    sorted.forEach(r => {
      const d = extrair(r)
      const key = d.uso
      if (!groups[key]) {
        groups[key] = { 
          uso: d.uso, 
          status: d.status,
          inicio: d.dataInicioSeries,
          fim: d.dataFimSeries,
          professorId: d.professorId,
          salaId: d.salaId,
          count: 0
        }
      }
      groups[key].count++
    })
    return Object.values(groups)
  }

  const nomeProf = (id) => professores.find(p => String(p.id || p.idProfessor) === String(id))?.nomeProf || 'Prof.'
  const nomeSala = (id) => salas.find(s => String(s.id || s.idSala) === String(id))?.nomeSala || 'Sala'

  const gerarPDF = () => {
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    const curso = cursos.find(c => String(c.id || c.idCurso) === filtroCursoId)?.nomeCurso || 'Geral';
    const periodo = periodos.find(p => String(p.id || p.idPeriodo) === filtroPeriodoId)?.semestre || '';
    doc.setFontSize(16);
    doc.text(`Mapa de Ocupação - ${curso}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${periodo} | Gerado em: ${new Date().toLocaleString()}`, 14, 22);
    const processarTurno = (turno) => {
      const slots = SLOTS.filter(s => s.shift === turno);
      return slots.map(slot => {
        const row = [slot.label];
        WEEKDAYS.forEach(dia => {
          if (slot.isBreak) {
            row.push('PAUSA');
          } else {
            const matches = encontrarReservas(slot, dia);
            const approved = matches.filter(m => {
              const d = extrair(m)
              return d.status === 'approved' || d.status === 'aprovado'
            })
            
            if (approved.length > 0) {
              const d = extrair(approved[0]);
              const info = `${d.uso}\n(${d.dataInicioSeries} - ${d.dataFimSeries})\n${nomeProf(d.professorId)}`;
              row.push(approved.length > 1 ? `[CONFLITO]\n${info}` : info);
            } else if (matches.length > 0) {
              row.push('STATUS: PENDENTE\n(Aguardando Aprovação)');
            } else {
              row.push('');
            }
          }
        });
        return row;
      });
    };
    autoTable(doc, {
      startY: 28,
      head: [['Horário', ...WEEKDAYS]],
      body: processarTurno(Shift.MANHA),
      theme: 'grid',
      headStyles: { fillColor: [28, 26, 163], fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 15 },
      columnStyles: { 0: { cellWidth: 25, fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.cell.text[0] === 'PAUSA') {
          data.cell.styles.fillColor = [255, 248, 220];
        }
      }
    });
    doc.addPage();
    doc.text(`TURNO: TARDE`, 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Horário', ...WEEKDAYS]],
      body: processarTurno(Shift.TARDE),
      theme: 'grid',
      headStyles: { fillColor: [28, 26, 163], fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 15 },
      columnStyles: { 0: { cellWidth: 25, fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.cell.text[0] === 'PAUSA') {
          data.cell.styles.fillColor = [255, 248, 220];
        }
      }
    });
    doc.save(`Mapa_Ocupacao_${curso.replace(/\s+/g, '_')}.pdf`);
  };

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
                const matches = encontrarReservas(slot, dia)
                const meta    = agruparMatches(matches)

                return (
                  <td key={dia} className="p-1.5 border-l min-w-[140px] align-top">
                    {slot.isBreak
                      ? <div className="text-center text-[8px] text-amber-400 font-black py-4">PAUSA</div>
                      : meta.length > 0
                        ? (
                          <div 
                            onClick={() => setDetalhesSlot({ matches, slot, dia })}
                            className={`p-2 rounded-xl border cursor-pointer hover:shadow-md transition-all duration-300 animate-in zoom-in ${
                              meta.length > 1 
                                ? 'bg-indigo-600 border-indigo-700 shadow-indigo-100' 
                                : (meta[0].status === 'approved' || meta[0].status === 'aprovado'
                                    ? 'bg-blue-50 border-blue-200' 
                                    : 'bg-amber-50 border-amber-200')
                            }`}
                          >
                            {meta.length > 1 ? (
                              <div className="text-center py-1">
                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{meta.length} Matérias</p>
                                <p className="text-[8px] font-medium text-indigo-100 opacity-80 italic">Clique para detalhes</p>
                              </div>
                            ) : (
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <p className={`text-[9px] font-black truncate ${
                                          (meta[0].status === 'approved' || meta[0].status === 'aprovado') ? 'text-blue-700' : 'text-amber-700'
                                        }`}>
                                          {meta[0].uso}
                                        </p>
                                        {!(meta[0].status === 'approved' || meta[0].status === 'aprovado') && 
                                          <span className="text-[7px] font-black px-1 rounded bg-amber-200 text-amber-800 uppercase shrink-0">Pendente</span>
                                        }
                                    </div>
                                    <p className={`text-[7px] font-bold italic leading-none ${
                                      (meta[0].status === 'approved' || meta[0].status === 'aprovado') ? 'text-blue-600/70' : 'text-amber-600/70'
                                    }`}>
                                      ({meta[0].inicio || '?'} até {meta[0].fim || '?'})
                                    </p>
                                </div>
                            )}
                          </div>
                        )
                        : <div className="h-16" />
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
        <button onClick={gerarPDF} className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all">
          <FileText size={18} /> Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-3 rounded-xl border flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-400">CURSO</label>
          <select value={filtroCursoId} onChange={e => setFiltroCursoId(e.target.value)} className="text-sm font-bold bg-transparent outline-none">
            {cursos.map(c => <option key={c.id || c.idCurso} value={String(c.id || c.idCurso)}>{c.nomeCurso || c.nome}</option>)}
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

      {/* MODAL DE DETALHES DO SLOT */}
      {detalhesSlot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="px-8 py-6 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}>
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Clock className="text-white" size={20} />
                 </div>
                 <div>
                    <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">Detalhes do Horário</h3>
                    <p className="text-blue-200 text-xs font-bold">{detalhesSlot.dia} — {detalhesSlot.slot.label}</p>
                 </div>
              </div>
              <button 
                onClick={() => setDetalhesSlot(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumo das Reservas ({agruparMatches(detalhesSlot.matches).length})</p>
              
              {agruparMatches(detalhesSlot.matches).map((grp, idx) => {
                const isApproved = grp.status === 'approved' || grp.status === 'aprovado'
                return (
                  <div key={idx} className={`p-5 rounded-3xl border-2 transition-all ${
                    isApproved ? 'bg-blue-50/50 border-blue-100 hover:border-blue-300' : 'bg-amber-50/50 border-amber-100 hover:border-amber-300'
                  }`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h4 className={`text-sm font-black uppercase ${isApproved ? 'text-blue-900' : 'text-amber-900'}`}>{grp.uso}</h4>
                        <p className={`text-[10px] font-bold italic mb-1 ${isApproved ? 'text-blue-600/70' : 'text-amber-600/70'}`}>
                          Duração: {grp.inicio || '?'} — {grp.fim || '?'}
                        </p>
                        <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                          isApproved ? 'bg-blue-200 text-blue-800' : 'bg-amber-200 text-amber-800'
                        }`}>
                          {isApproved ? 'Confirmado' : 'Aguardando Aprovação'}
                        </span>
                      </div>
                      <div className={`p-2 rounded-xl scale-75 origin-top-right ${isApproved ? 'bg-blue-200/50' : 'bg-amber-200/50'}`}>
                         {isApproved ? <CheckCircle2 className="text-blue-600" /> : <Clock className="text-amber-600" />}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isApproved ? 'bg-blue-100' : 'bg-amber-100'}`}>
                           <User size={14} className={isApproved ? 'text-blue-600' : 'text-amber-600'} />
                         </div>
                         <div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase leading-none mb-1">Professor</p>
                            <p className="text-[11px] font-black text-slate-700 truncate">{nomeProf(grp.professorId)}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isApproved ? 'bg-blue-100' : 'bg-amber-100'}`}>
                           <MapPin size={14} className={isApproved ? 'text-blue-600' : 'text-amber-600'} />
                         </div>
                         <div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase leading-none mb-1">Local/Sala</p>
                            <p className="text-[11px] font-black text-slate-700 truncate uppercase">{nomeSala(grp.salaId)}</p>
                         </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-8 pt-0">
               <button 
                  onClick={() => setDetalhesSlot(null)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-[0.98]"
               >
                  Fechar Visualização
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}