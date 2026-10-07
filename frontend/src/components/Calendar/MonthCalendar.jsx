import { useState, useMemo, useEffect } from 'react'
import { useSchedule } from '../Schedule/ScheduleContext'
import { getCalendarEvents } from '../../services/GoogleServices'
import {
    ChevronLeft, ChevronRight, Building2, X,
    CheckCircle2, XCircle, Clock, User, Plus, Trash2, Filter
} from 'lucide-react'

// Mapeamento nome do dia (PT) → índice JS (0=Dom, 1=Seg...)
const DIA_SEMANA_MAP = {
    'Domingo': 0,
    'Segunda': 1,
    'Terça': 2,
    'Quarta': 3,
    'Quinta': 4,
    'Sexta': 5,
    'Sábado': 6,
}

const MESES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const DIAS_SEMANA_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function buildCalendarGrid(year, month) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const grid = []
    for (let i = 0; i < firstDay; i++) grid.push(null)
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d))
    while (grid.length % 7 !== 0) grid.push(null)
    return grid
}

// Verifica se uma data (YYYY-MM-DD) está dentro do período de vigência do horário
function dateInRange(dStr, dataInicio, dataFim) {
    if (dataInicio && dStr < dataInicio) return false
    if (dataFim && dStr > dataFim) return false
    return true
}

const formatYMD = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

// Datas "all-day" do Google vêm como YYYY-MM-DD: interpretar no fuso local (não UTC)
const parseGoogleDate = (g) => g.dateTime ? new Date(g.dateTime) : new Date(g.date + 'T00:00:00')

const MonthCalendar = ({ onAddForDate, isAdmin = false }) => {
    const { horarios, salas, cursos, professores, removerHorario, refreshCount } = useSchedule()
    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth())
    const [selectedDate, setSelectedDate] = useState(null)
    const [filterSala, setFilterSala] = useState('')
    const [filterCurso, setFilterCurso] = useState('')
    const [filterProfessor, setFilterProfessor] = useState('')
    const [googleEvents, setGoogleEvents] = useState([])
    const [googleEventCount, setGoogleEventCount] = useState(null)

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false
        const anchor = new Date(viewYear, viewMonth, 15)
        getCalendarEvents({ view: 'month', anchor: anchor.toISOString() })
            .then((r) => {
                if (cancelled) return
                const items = Array.isArray(r.items) ? r.items : []
                setGoogleEventCount(items.length)
                setGoogleEvents(items)
            })
            .catch(() => {
                if (cancelled) return
                setGoogleEventCount(null)
                setGoogleEvents([])
            })
        return () => { cancelled = true }
    }, [viewYear, viewMonth, isAdmin, refreshCount])

    // Navegar mês
    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
        else setViewMonth(m => m - 1)
        setSelectedDate(null)
    }
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
        else setViewMonth(m => m + 1)
        setSelectedDate(null)
    }

    const grid = useMemo(() => buildCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth])

    const googleMapeados = useMemo(() => googleEvents.map((ev) => {
        const priv = (ev.extendedProperties?.private) || {}
        const start = parseGoogleDate(ev.start)
        const end = parseGoogleDate(ev.end)
        // No Google, o fim de um evento all-day é exclusivo
        const endDay = ev.end.date && !ev.end.dateTime ? new Date(end.getTime() - 24 * 60 * 60 * 1000) : end

        return {
            id: `google-${ev.id}`,
            googleId: ev.id,
            localId: priv.local_reservation_id || null,
            salaId: parseInt(priv.fk_sala) || null,
            cursoId: parseInt(priv.fk_curso) || null,
            professorId: parseInt(priv.fk_professor) || null,
            disciplina: ev.summary || 'Evento Externo',
            professor: priv.professor_nome || '',
            horarioInicio: start.getHours().toString().padStart(2, '0') + ':' + start.getMinutes().toString().padStart(2, '0'),
            horarioFim: end.getHours().toString().padStart(2, '0') + ':' + end.getMinutes().toString().padStart(2, '0'),
            dataInicio: formatYMD(start),
            dataFim: formatYMD(endDay),
            isGoogleOnly: !priv.local_reservation_id,
        }
    }), [googleEvents])

    const getOcupacoesDoDia = (date) => {
        if (!date) return []
        const diaSemanaIdx = date.getDay()
        const nomeDia = Object.keys(DIA_SEMANA_MAP).find(k => DIA_SEMANA_MAP[k] === diaSemanaIdx)

        const ocupaDia = (h) => {
            if (!h) return false
            if (filterSala && String(h.salaId) !== String(filterSala)) return false
            if (filterCurso && h.cursoId !== parseInt(filterCurso)) return false
            if (filterProfessor && h.professorId !== parseInt(filterProfessor)) return false

            // Converte para data simples YYYY-MM-DD para comparação sem hora
            const dStr = formatYMD(date)
            const iniStr = h.dataInicio
            const fimStr = h.dataFim

            if (!dateInRange(dStr, iniStr, fimStr)) return false

            // Se for evento recorrente (tem diaSemana), precisa bater
            // Exceto se for um evento longo (mais de 1 dia de intervalo)
            const isRecurrent = !!h.diaSemana
            const isLong = !!iniStr && !!fimStr && iniStr !== fimStr

            if (isRecurrent && !isLong) {
                return h.diaSemana === nomeDia
            }

            return true
        }

        const locais = horarios.filter(ocupaDia)
        const idsLocais = new Set(horarios.map(h => String(h.id).split(':')[0]))
        const googleFiltrados = googleMapeados
            .filter(ge => {
                if (ge.localId && idsLocais.has(String(ge.localId))) return false
                return ocupaDia(ge)
            })

        return [...locais, ...googleFiltrados]
    }

    const getDayStats = (date) => {
        if (!date) return null
        const ocupacoes = getOcupacoesDoDia(date)
        const salasOcupadas = new Set(ocupacoes.filter(h => h.salaId).map(h => String(h.salaId)))
        const numOcupadas = salasOcupadas.size
        const totalSalas = filterSala ? 1 : Math.max(salas.length, numOcupadas, 1)

        return {
            ocupadas: Math.min(numOcupadas, totalSalas),
            total: totalSalas,
            taxa: Math.min(1, numOcupadas / totalSalas),
            horarios: ocupacoes,
        }
    }

    // Cor de fundo da célula baseada na taxa de ocupação
    const getCellStyle = (taxa, isToday, isSelected) => {
        if (isSelected) return { bg: '#1c1aa3', text: 'white', border: '#1c1aa3' }
        if (isToday) return { bg: '#eef2ff', text: '#1c1aa3', border: '#818cf8' }
        if (taxa === 0) return { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' }
        if (taxa <= 0.4) return { bg: '#fefce8', text: '#ca8a04', border: '#fde68a' }
        if (taxa <= 0.75) return { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' }
        return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
    }

    const isToday = (date) =>
        date &&
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()

    const isSelected = (date) =>
        date && selectedDate &&
        date.toDateString() === selectedDate.toDateString()

    // Dados do dia selecionado para o painel lateral
    const selectedStats = selectedDate ? getDayStats(selectedDate) : null
    const salasSelecionadas = selectedDate ? (() => {
        const ocupacoesMap = {}
        getOcupacoesDoDia(selectedDate).forEach(h => {
            if (!ocupacoesMap[h.salaId]) ocupacoesMap[h.salaId] = []
            ocupacoesMap[h.salaId].push(h)
        })

        return salas
            .filter(s => !filterSala || String(s.id) === String(filterSala))
            .map(s => ({
                ...s,
                horarios: (ocupacoesMap[s.id] || []).sort((a, b) =>
                    a.horarioInicio.localeCompare(b.horarioInicio)
                ),
                ocupada: !!ocupacoesMap[s.id],
            }))
            .sort((a, b) => b.ocupada - a.ocupada) // ocupadas primeiro
    })() : []

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* ── Cabeçalho ── */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100"
                style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}>
                <div>
                    <h2 className="text-xl font-black text-white">Calendário de Ocupação</h2>
                    <p className="text-blue-200 text-xs mt-0.5">Disponibilidade mensal das salas</p>
                    {googleEventCount !== null && (
                        <p className="text-emerald-200 text-[10px] mt-1 font-semibold">
                            Google Calendar: {googleEventCount} evento(s) SIGRA neste mês (conta conectada).
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Navegação de mês */}
                    <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                        <button onClick={prevMonth}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 text-white transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-white font-bold text-sm px-3 min-w-[140px] text-center">
                            {MESES_PT[viewMonth]} {viewYear}
                        </span>
                        <button onClick={nextMonth}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 text-white transition-colors">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Barra de Filtros ── */}
            <div className="px-6 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-gray-400 mr-1">
                    <Filter size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Filtros</span>
                </div>

                {/* Filtro Sala */}
                <select
                    value={filterSala}
                    onChange={(e) => { setFilterSala(e.target.value); setSelectedDate(null) }}
                    className="text-[11px] bg-gray-50 border border-gray-200 text-gray-700 rounded-lg p-1.5 outline-none hover:border-blue-300 transition-colors min-w-[120px]"
                >
                    <option value="">Todas as Salas</option>
                    {salas.map(s => (
                        <option key={s.id} value={s.id}>{s.nomeSala || s.nome}</option>
                    ))}
                </select>

                {/* Filtro Turma/Curso */}
                <select
                    value={filterCurso}
                    onChange={(e) => { setFilterCurso(e.target.value); setSelectedDate(null) }}
                    className="text-[11px] bg-gray-50 border border-gray-200 text-gray-700 rounded-lg p-1.5 outline-none hover:border-blue-300 transition-colors min-w-[120px]"
                >
                    <option value="">Todas as Turmas</option>
                    {cursos.map(c => (
                        <option key={c.id} value={c.id}>{c.siglaCurso || c.sigla}</option>
                    ))}
                </select>

                {/* Filtro Professor */}
                <select
                    value={filterProfessor}
                    onChange={(e) => { setFilterProfessor(e.target.value); setSelectedDate(null) }}
                    className="text-[11px] bg-gray-50 border border-gray-200 text-gray-700 rounded-lg p-1.5 outline-none hover:border-blue-300 transition-colors min-w-[120px]"
                >
                    <option value="">Todos os Professores</option>
                    {professores.map(p => (
                        <option key={p.id} value={p.id}>{p.nomeProf || p.nome}</option>
                    ))}
                </select>

                {/* Limpar Filtros */}
                {(filterSala || filterCurso || filterProfessor) && (
                    <button
                        onClick={() => {
                            setFilterSala('');
                            setFilterCurso('');
                            setFilterProfessor('');
                            setSelectedDate(null);
                        }}
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 px-2"
                    >
                        Limpar
                    </button>
                )}
            </div>

            {/* ── Legenda de cores ── */}
            <div className="flex flex-wrap items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs">
                <span className="text-gray-500 font-semibold">Ocupação:</span>
                {[
                    { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', label: 'Livre' },
                    { bg: '#fefce8', border: '#fde68a', color: '#ca8a04', label: '1–40%' },
                    { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c', label: '41–75%' },
                    { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', label: '76–100%' },
                ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded border inline-block"
                            style={{ background: l.bg, borderColor: l.border }} />
                        <span style={{ color: l.color }} className="font-medium">{l.label}</span>
                    </span>
                ))}
                <span className="flex items-center gap-1.5 ml-auto">
                    <span className="w-4 h-4 rounded border inline-block bg-indigo-50 border-indigo-300" />
                    <span className="text-indigo-600 font-medium">Hoje</span>
                </span>
            </div>

            <div className="flex">
                {/* ── Grade do calendário ── */}
                <div className={`flex-1 p-4 ${selectedDate ? 'pr-2' : ''}`}>

                    {/* Cabeçalho dos dias da semana */}
                    <div className="grid grid-cols-7 mb-1">
                        {DIAS_SEMANA_PT.map(d => (
                            <div key={d} className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider py-2">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Células do mês */}
                    <div className="grid grid-cols-7 gap-1">
                        {grid.map((date, idx) => {
                            if (!date) return <div key={`empty-${idx}`} />

                            const stats = getDayStats(date)
                            const todayFlag = isToday(date)
                            const selFlag = isSelected(date)
                            const style = getCellStyle(stats.taxa, todayFlag, selFlag)
                            const isPast = date < today && !todayFlag

                            const isTodayHighlight = todayFlag && !selFlag

                            return (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedDate(selFlag ? null : date)}
                                    className="relative flex flex-col items-center justify-start rounded-xl p-1.5 min-h-[64px] transition-all duration-150 hover:scale-105 hover:shadow-md border text-left w-full"
                                    style={{
                                        background: selFlag ? style.bg : isPast ? '#fafafa' : style.bg,
                                        borderColor: selFlag ? style.border : isPast ? '#f0f0f0' : style.border,
                                        opacity: isPast ? 0.65 : 1,
                                    }}
                                >
                                    {/* Número do dia */}
                                    <span
                                        className="text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg mb-1"
                                        style={{
                                            background: isTodayHighlight
                                                ? '#818cf8'
                                                : selFlag
                                                    ? 'rgba(255,255,255,0.2)'
                                                    : 'transparent',
                                            color: isTodayHighlight
                                                ? 'white'
                                                : selFlag
                                                    ? 'white'
                                                    : isPast
                                                        ? '#9ca3af'
                                                        : style.text,
                                        }}
                                    >
                                        {date.getDate()}
                                    </span>

                                    {/* Mini indicadores de salas */}
                                    {stats.ocupadas > 0 && (
                                        <div className="flex flex-wrap gap-0.5 justify-center w-full">
                                            {stats.horarios.slice(0, 6).map((h, i) => {
                                                const curso = cursos.find(c => c.id === h.cursoId)
                                                return (
                                                    <span key={i}
                                                        className="w-1.5 h-1.5 rounded-full"
                                                        style={{ background: selFlag ? 'rgba(255,255,255,0.7)' : (curso?.cor || '#6366f1') }}
                                                        title={h.disciplina}
                                                    />
                                                )
                                            })}
                                            {stats.horarios.length > 6 && (
                                                <span className="text-[9px] font-bold"
                                                    style={{ color: selFlag ? 'rgba(255,255,255,0.8)' : style.text }}>
                                                    +{stats.horarios.length - 6}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Contagem de salas ocupadas */}
                                    <span className="text-[9px] font-semibold mt-auto"
                                        style={{ color: selFlag ? 'rgba(255,255,255,0.75)' : style.text }}>
                                        {stats.total > 0
                                            ? `${stats.ocupadas}/${stats.total}`
                                            : '—'}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* ── Painel lateral do dia selecionado ── */}
                {selectedDate && selectedStats && (
                    <div className="w-80 border-l border-gray-100 flex flex-col"
                        style={{ animation: 'slideInRight 0.2s ease' }}>

                        {/* Header do painel */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                            <div>
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                                    {DIAS_SEMANA_PT[selectedDate.getDay()]}
                                </p>
                                <p className="text-xl font-black text-gray-900">
                                    {selectedDate.getDate()} de {MESES_PT[selectedDate.getMonth()]}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {onAddForDate && (
                                    <button onClick={() => onAddForDate(selectedDate)}
                                        className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-600 transition-colors" title="Adicionar alocação neste dia">
                                        <Plus size={14} />
                                    </button>
                                )}
                                <button onClick={() => setSelectedDate(null)}
                                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Resumo */}
                        <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-gray-100">
                            <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                                <p className="text-2xl font-black text-red-600">{selectedStats.ocupadas}</p>
                                <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide">Ocupada{selectedStats.ocupadas !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                                <p className="text-2xl font-black text-green-600">{selectedStats.total - selectedStats.ocupadas}</p>
                                <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wide">Disponíve{selectedStats.total - selectedStats.ocupadas !== 1 ? 'is' : 'l'}</p>
                            </div>
                        </div>

                        {/* Barra de ocupação */}
                        <div className="px-4 py-2 border-b border-gray-100">
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>Taxa de ocupação</span>
                                <span className="font-bold">{Math.round(selectedStats.taxa * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${selectedStats.taxa * 100}%`,
                                        background: selectedStats.taxa > 0.75
                                            ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                                            : selectedStats.taxa > 0.4
                                                ? 'linear-gradient(90deg, #ea580c, #f97316)'
                                                : 'linear-gradient(90deg, #16a34a, #22c55e)'
                                    }} />
                            </div>
                        </div>

                        {/* Lista de salas */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {salasSelecionadas.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-8">
                                    Nenhuma sala cadastrada
                                </p>
                            ) : salasSelecionadas.map(sala => (
                                <div key={sala.id}
                                    className="rounded-xl border overflow-hidden"
                                    style={{
                                        borderColor: sala.ocupada ? '#fee2e2' : '#dcfce7',
                                        background: sala.ocupada ? '#fff5f5' : '#f0fdf4',
                                    }}>

                                    {/* Header da sala */}
                                    <div className="flex items-center justify-between px-3 py-2"
                                        style={{ background: sala.ocupada ? '#fef2f2' : '#f0fdf4' }}>
                                        <div className="flex items-center gap-2">
                                            <Building2 size={13}
                                                style={{ color: sala.ocupada ? '#dc2626' : '#16a34a' }} />
                                            <span className="text-xs font-bold text-gray-700">{sala.nome || sala.nomeSala || sala.codigo_sala}</span>
                                            <span className="text-[9px] text-gray-400 capitalize">{sala.tipo || sala.tipoSala}</span>
                                        </div>
                                        {sala.ocupada
                                            ? <XCircle size={14} className="text-red-400 shrink-0" />
                                            : <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                                        }
                                    </div>

                                    {/* Horários da sala */}
                                    {sala.horarios.length > 0 && (
                                        <div className="px-3 pb-2 pt-1 space-y-1.5">
                                            {sala.horarios.map((h, i) => {
                                                const curso = cursos.find(c => c.id === h.cursoId)
                                                return (
                                                    <div key={i}
                                                        className="flex items-start gap-2 pl-2 border-l-2"
                                                        style={{ borderColor: curso?.cor || '#6366f1' }}>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-bold text-gray-800 truncate">
                                                                {h.disciplina || 'Sem disciplina'}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                                                                    <Clock size={9} />
                                                                    {h.horarioInicio}–{h.horarioFim}
                                                                </span>
                                                                {h.professor && (
                                                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 truncate">
                                                                        <User size={9} />
                                                                        {h.professor.split(' ')[0]}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            {curso && (
                                                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0"
                                                                    style={{ background: (curso.cor || '#6366f1') + '20', color: curso.cor || '#6366f1' }}>
                                                                    {curso.siglaCurso || curso.sigla}
                                                                </span>
                                                            )}
                                                            {isAdmin && removerHorario && !h.isGoogleOnly && (
                                                                <button onClick={(e) => { e.stopPropagation(); removerHorario(h.id); }} className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded p-1 transition-colors mt-auto" title="Excluir alocação">
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default MonthCalendar