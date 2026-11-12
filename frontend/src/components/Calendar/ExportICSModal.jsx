import { useState, useMemo, useEffect } from 'react'
import { useSchedule } from '../Schedule/ScheduleContext'
import { generateICS, downloadICS } from '../../utils/exportICS'
import {
    X, Download, Calendar, Building2,
    GraduationCap, CheckCircle2, Filter, FileDown, Info
} from 'lucide-react'
import { diasSemana } from '../../data/data'

const siglaCurso = (c) => c?.siglaCurso || c?.sigla || ''
const nomeCurso = (c) => c?.nomeCurso || c?.nome || ''
const nomeSala = (s) => s?.nome || s?.nomeSala || s?.codigo_sala || ''
const tipoSala = (s) => s?.tipo || s?.tipoSala || ''
const slug = (str) => String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    .toLowerCase()

const ExportICSModal = ({ onClose }) => {
    const { horarios, salas, cursos, periodos, periodoAtivo } = useSchedule()

    const [filters, setFilters] = useState({
        periodoId: periodoAtivo || '',
        salaId: '',
        cursoId: '',
        diaSemana: '',
    })
    const [step, setStep] = useState('config') // 'config' | 'done'

    const set = (field, value) => setFilters(prev => ({ ...prev, [field]: value }))

    // Horários filtrados com base nas seleções
    const horariosFiltrados = useMemo(() => {
        return horarios.filter(h => {
            if (filters.periodoId && h.periodoId !== parseInt(filters.periodoId)) return false
            if (filters.salaId && String(h.salaId) !== String(filters.salaId)) return false
            if (filters.cursoId && h.cursoId !== parseInt(filters.cursoId)) return false
            if (filters.diaSemana && h.diaSemana !== filters.diaSemana) return false
            return true
        })
    }, [horarios, filters])

    // Salas únicas nos resultados filtrados
    const salasNoFiltro = useMemo(() => {
        const ids = new Set(horariosFiltrados.map(h => h.salaId))
        return salas.filter(s => ids.has(s.id))
    }, [horariosFiltrados, salas])

    const handleExport = () => {
        if (horariosFiltrados.length === 0) return

        const periodo = periodos.find(p => p.id === parseInt(filters.periodoId))
        const curso = cursos.find(c => c.id === parseInt(filters.cursoId))
        const sala = salas.find(s => s.id === parseInt(filters.salaId))
        const calName = [
            'SCA UEPA',
            periodo ? periodo.semestre : '',
            siglaCurso(curso),
            nomeSala(sala),
        ].filter(Boolean).join(' — ')

        const filename = [
            'sca-uepa',
            slug(periodo?.semestre),
            slug(siglaCurso(curso)),
            slug(nomeSala(sala)),
            slug(filters.diaSemana),
        ].filter(Boolean).join('_')

        const ics = generateICS(horariosFiltrados, salas, cursos, calName)
        downloadICS(ics, filename)
        setStep('done')
    }

    const inputClass = `
        w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50
        text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40
        focus:border-blue-400 transition-all duration-150 appearance-none cursor-pointer
    `

    // ── Tela de sucesso ──
    if (step === 'done') {
        return (
            <Overlay onClose={onClose}>
                <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                        style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)' }}>
                        <CheckCircle2 size={32} className="text-white" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">Arquivo gerado!</h3>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                        O arquivo <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-700">.ics</code> foi baixado.<br />
                        Importe-o no Google Calendar, Apple Calendar ou Outlook.
                    </p>

                    {/* Instruções rápidas */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-left mb-6 space-y-3">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Como importar:</p>
                        {[
                            { app: 'Google Calendar', passos: 'Configurações → Importar e exportar → Importar' },
                            { app: 'Apple Calendar', passos: 'Arquivo → Importar → selecione o .ics' },
                            { app: 'Outlook', passos: 'Adicionar calendário → Carregar do arquivo' },
                        ].map(({ app, passos }) => (
                            <div key={app} className="flex items-start gap-2.5">
                                <div>
                                    <p className="text-xs font-bold text-gray-700">{app}</p>
                                    <p className="text-xs text-gray-400">{passos}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setStep('config')}
                            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors">
                            Exportar outro
                        </button>
                        <button onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:-translate-y-0.5"
                            style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 6px 20px rgba(28,26,163,0.3)' }}>
                            Concluir
                        </button>
                    </div>
                </div>
            </Overlay>
        )
    }

    // ── Tela de configuração ──
    return (
        <Overlay onClose={onClose}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)' }}>
                        <FileDown size={18} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 leading-none">Exportar para .ics</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Google Calendar · Apple · Outlook</p>
                    </div>
                </div>
                <button onClick={onClose}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
                    <X size={15} />
                </button>
            </div>

            {/* Filtros */}
            <div className="space-y-4 mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Filter size={11} /> Selecione o que exportar
                </p>

                {/* Período */}
                <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                        <Calendar size={12} className="text-blue-500" /> Período letivo
                    </label>
                    <select className={inputClass} value={filters.periodoId} onChange={e => set('periodoId', e.target.value)}>
                        <option value="">Todos os períodos</option>
                        {periodos.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.semestre} — {p.descricao}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {/* Curso */}
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                            <GraduationCap size={12} className="text-violet-500" /> Curso
                        </label>
                        <select className={inputClass} value={filters.cursoId} onChange={e => set('cursoId', e.target.value)}>
                            <option value="">Todos</option>
                            {cursos.map(c => (
                                <option key={c.id} value={c.id}>{[siglaCurso(c), nomeCurso(c)].filter(Boolean).join(' — ')}</option>
                            ))}
                        </select>
                    </div>

                    {/* Dia da semana */}
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                            <Calendar size={12} className="text-indigo-500" /> Dia da semana
                        </label>
                        <select className={inputClass} value={filters.diaSemana} onChange={e => set('diaSemana', e.target.value)}>
                            <option value="">Todos os dias</option>
                            {diasSemana.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </div>

                {/* Sala */}
                <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                        <Building2 size={12} className="text-emerald-500" /> Sala / Laboratório
                    </label>
                    <select className={inputClass} value={filters.salaId} onChange={e => set('salaId', e.target.value)}>
                        <option value="">Todas as salas</option>
                        {salas.map(s => (
                            <option key={s.id} value={s.id}>{[nomeSala(s), tipoSala(s)].filter(Boolean).join(' — ')}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Preview da contagem */}
            <div className={`rounded-2xl p-4 mb-6 border transition-all duration-200 ${horariosFiltrados.length > 0
                    ? 'bg-blue-50 border-blue-100'
                    : 'bg-amber-50 border-amber-100'
                }`}>
                <div className="flex items-start gap-3">
                    <Info size={15} className={horariosFiltrados.length > 0 ? 'text-blue-500 mt-0.5' : 'text-amber-500 mt-0.5'} />
                    <div>
                        {horariosFiltrados.length > 0 ? (
                            <>
                                <p className="text-sm font-bold text-blue-800">
                                    {horariosFiltrados.length} alocaç{horariosFiltrados.length !== 1 ? 'ões' : 'ão'} encontrada{horariosFiltrados.length !== 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-blue-500 mt-0.5">
                                    {salasNoFiltro.length} sala{salasNoFiltro.length !== 1 ? 's' : ''} · cada aula vira um evento recorrente semanal no calendário
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-bold text-amber-700">Nenhuma alocação encontrada</p>
                                <p className="text-xs text-amber-500 mt-0.5">Ajuste os filtros para encontrar horários.</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Botão exportar */}
            <button
                onClick={handleExport}
                disabled={horariosFiltrados.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 6px 20px rgba(28,26,163,0.3)' }}
            >
                <Download size={16} />
                Baixar arquivo .ics
            </button>
        </Overlay>
    )
}

// Wrapper do overlay
const Overlay = ({ children, onClose }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.15s ease' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-7"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'fadeInUp16 0.2s ease' }}>
                {children}
            </div>
        </div>
    )
}

export default ExportICSModal
