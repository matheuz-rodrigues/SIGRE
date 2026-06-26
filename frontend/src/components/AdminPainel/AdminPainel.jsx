import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useSchedule } from '../Schedule/ScheduleContext'
import { getDashboardMetrics } from '../../services/DashboardService'
import { startGoogleCalendarConnect } from '../../services/GoogleServices'
import {
    Plus, LayoutGrid, ClipboardList, Calendar, Database, Map,
    CheckCircle2, XCircle, Clock, Building2, User, Users,
    AlignLeft, ChevronDown, ChevronUp, GraduationCap, BookOpen,
    Bell, Filter, Search, FileSpreadsheet, AlertTriangle, Settings, Link, ArrowRight
} from 'lucide-react'

// Componentes Internos
import ScheduleForm from '../Schedule/ScheduleForm'
import ScheduleViiew from '../Schedule/ScheduleViiew'
import DataManager from './DataManager'
import MonthCalendar from '../Calendar/MonthCalendar'
import ImportarPlanilha from './ImportarPlanilha'

import UserManagement from './UserManagement'
import EventoModal from './EventoModal'

const STATUS_STYLES = {
    pendente: { label: 'Pendente', bg: '#fef9c3', color: '#ca8a04', dot: '#eab308', border: '#fde68a' },
    aprovado: { label: 'Aprovado', bg: '#dcfce7', color: '#16a34a', dot: '#22c55e', border: '#bbf7d0' },
    recusado: { label: 'Recusado', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444', border: '#fecaca' },
}

const InfoRow = ({ label, value }) => (
    <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-gray-400 font-semibold shrink-0">{label}</span>
        <span className="text-gray-700 font-medium text-right">{value}</span>
    </div>
)

const AdminPainel = () => {
    const { adicionarHorario, atualizarHorario } = useSchedule()
    const detectedEnvironment = (import.meta.env.MODE)
    const isProductionEnvironment = detectedEnvironment === 'production'
    const environmentLabel = isProductionEnvironment ? 'Produção' : 'Desenvolvimento'
    const environmentBadgeClass = isProductionEnvironment
        ? 'px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-black uppercase border border-green-500/30'
        : 'px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[10px] font-black uppercase border border-blue-400/30'
    const [showImport, setShowImport] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [showEventoModal, setShowEventoModal] = useState(false)
    const [horarioEdit, setHorarioEdit] = useState(null)
    const [restoreDraft, setRestoreDraft] = useState(false)
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') || 'calendario';
    })

    const [isGoogleConnected, setIsGoogleConnected] = useState(false)
    const [loadingGoogle, setLoadingGoogle] = useState(false)
    const [loadingAprovar, setLoadingAprovar] = useState(null)
    const [loadingRecusar, setLoadingRecusar] = useState(null)
    const [loadingDisconnect, setLoadingDisconnect] = useState(false)

    const checkGoogleStatus = async () => {
        try {
            const { getGoogleStatus } = await import('../../services/api')
            const connected = await getGoogleStatus()
            setIsGoogleConnected(connected)
        } catch (err) {
            console.error('Erro status Google:', err)
        }
    }

    const handleConnectGoogle = async () => {
        setLoadingGoogle(true)
        try {
            await startGoogleCalendarConnect()
        } catch (err) {
            setModalFeedback({
                show: true,
                title: 'Erro de Conexão',
                message: err?.message || 'Não foi possível obter a URL de conexão com o Google.',
                type: 'error'
            })
        } finally {
            setLoadingGoogle(false)
        }
    }

    const handleDisconnectGoogle = async () => {
        setModalConfirmDisconnect(true)
    }

    const confirmDisconnect = async () => {
        setModalConfirmDisconnect(false)
        setLoadingGoogle(true)
        try {
            const { disconnectGoogle } = await import('../../services/api')
            await disconnectGoogle()
            setIsGoogleConnected(false)
            setModalFeedback({
                show: true,
                title: 'Desconectado',
                message: 'Sua conta do Google Calendar foi desvinculada com sucesso.',
                type: 'success'
            })
        } catch (err) {
            setModalFeedback({
                show: true,
                title: 'Erro ao Desconectar',
                message: err.message,
                type: 'error'
            })
        } finally {
            setLoadingGoogle(false)
        }
    }

    const [conflito, setConflito] = useState(null);

    const [solicitacoes, setSolicitacoes] = useState([])
    const [loadingSols, setLoadingSols] = useState(true)
    const [filtroStatus, setFiltroStatus] = useState('todos')
    const [busca, setBusca] = useState('')
    const [expandedId, setExpandedId] = useState(null)
    const [motivoRecusa, setMotivoRecusa] = useState({})

    const [usuarios, setUsuarios] = useState([])
    const [metrics, setMetrics] = useState(null)

    const [modalConfirmDisconnect, setModalConfirmDisconnect] = useState(false)
    const [modalFeedback, setModalFeedback] = useState({ show: false, title: '', message: '', type: 'info' })

    const carregarSolicitacoes = async () => {
        setLoadingSols(true)
        try {
            const res = await api.get('/solicitations/')
            setSolicitacoes(res.data.map(s => ({
                id: s.idSolicitacao,
                solicitante: s.solicitante,
                email: s.email,
                papel: s.papel,
                motivo: s.motivo,
                descricao: s.descricao,
                sala: s.sala?.nome || s.sala?.nomeSala || s.sala?.codigo_sala || '',
                salaId: s.salaId,
                diaSemana: s.diaSemana,
                dataEvento: s.dataEvento || '',
                horario: `${s.horarioInicio?.slice(0, 5)} – ${s.horarioFim?.slice(0, 5)}`,
                horarioInicio: s.horarioInicio,
                horarioFim: s.horarioFim,
                participantes: s.participantes,
                observacoes: s.observacoes || '',
                status: s.status,
                motivoRecusa: s.motivoRecusa || '',
                criadoEm: new Date(s.criadoEm).toLocaleString('pt-BR'),
            })))
        } catch (err) {
            console.error('Erro ao carregar solicitações:', err)
        } finally {
            setLoadingSols(false)
        }
    }

    const carregarUsuarios = async () => {
        try {
            const res = await api.get('/users/')
            setUsuarios(res.data)
        } catch (err) {
            console.error('Erro ao carregar usuários:', err)
        }
    }

    useEffect(() => {
        carregarSolicitacoes()
        carregarUsuarios()
        checkGoogleStatus()
    }, [])

    useEffect(() => {
        getDashboardMetrics()
            .then(setMetrics)
            .catch(() => setMetrics(null))
    }, [])

    // ── Handlers de Usuários (Passados para UserManagement) ──
    const handleAprovarUsuario = async (id) => {
        try {
            await api.patch(`/users/approve/${id}`)
            carregarUsuarios()
        } catch (err) { alert('Erro ao aprovar usuário.') }
    }

    const handleRecusarUsuario = async (id) => {
        try {
            await api.patch(`/users/refuse/${id}`)
            carregarUsuarios()
        } catch (err) { alert('Erro ao processar alteração.') }
    }

    const handleDeletarUsuario = async (id) => {
        if (!window.confirm('Excluir este usuário permanentemente?')) return
        try {
            await api.delete(`/users/${id}`)
            carregarUsuarios()
        } catch (err) { alert('Erro ao excluir.') }
    }

    const handleCheckAprovar = async (solicitacao) => {
        if (loadingAprovar) return
        await handleFinalizarAprovacao(solicitacao.id);
    }

    const handleFinalizarAprovacao = async (id, substituir = false) => {
        if (loadingAprovar) return
        setLoadingAprovar(id)
        try {
            await api.patch(`/solicitations/${id}/status`, {
                status: 'aprovado'
            });
            carregarSolicitacoes();
            setConflito(null);
            setExpandedId(null);
        } catch (err) { alert('Erro ao finalizar aprovação.'); }
        finally { setLoadingAprovar(null) }
    }

    const handleRecusarSolicitacao = async (id) => {
        if (loadingRecusar === id) return
        setLoadingRecusar(id)
        try {
            await api.patch(`/solicitations/${id}/status`, {
                status: 'recusado',
                motivoRecusa: motivoRecusa[id] || ''
            })
            carregarSolicitacoes()
            setExpandedId(null)
        } catch (err) { alert('Erro ao recusar solicitação.') }
        finally { setLoadingRecusar(null) }
    }

    const solicitacoesFiltradas = solicitacoes.filter(s => {
        if (filtroStatus !== 'todos' && s.status !== filtroStatus) return false
        if (busca && !s.solicitante.toLowerCase().includes(busca.toLowerCase()) &&
            !s.descricao.toLowerCase().includes(busca.toLowerCase())) return false
        return true
    })

    const pendentesSols = solicitacoes.filter(s => s.status === 'pendente').length
    const pendentesUser = usuarios.filter(u => u.status === 'pendente').length

    const TABS = [
        { key: 'calendario', label: 'Calendário', Icon: Calendar, badge: null },
        { key: 'solicitacoes', label: 'Solicitações', Icon: ClipboardList, badge: pendentesSols > 0 ? pendentesSols : null },
        { key: 'cadastros', label: 'Cadastros', Icon: Database, badge: null },
        { key: 'usuarios', label: 'Usuários', Icon: Users, badge: pendentesUser > 0 ? pendentesUser : null },
        { key: 'configuracoes', label: 'Configurações', Icon: Settings, badge: null },
    ]

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative min-h-screen">

            {/* MODAL DE CONFLITO */}
            {conflito && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-100 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="p-6 bg-red-50 border-b border-red-100 flex items-center gap-3">
                            <AlertTriangle className="text-red-600" size={24} />
                            <h3 className="text-lg font-black text-red-900 uppercase">Conflito Detectado</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Evento Atual:</p>
                                <p className="text-sm font-bold text-gray-800">{conflito.antiga.motivo}</p>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed text-center">
                                Deseja substituir este evento pela solicitação de <strong>{conflito.nova.solicitante}</strong>?
                                O usuário anterior será notificado do cancelamento.
                            </p>
                            <div className="flex flex-col gap-2 pt-2">
                                <button onClick={() => handleFinalizarAprovacao(conflito.nova.id, true)}
                                    disabled={loadingAprovar === conflito.nova.id}
                                    className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50 shadow-lg shadow-red-200">
                                    {loadingAprovar === conflito.nova.id ? 'Aprovando...' : 'SUBSTITUIR E APROVAR'}
                                </button>
                                <button onClick={() => setConflito(null)}
                                    className="w-full py-3 bg-white text-slate-500 rounded-xl font-bold text-sm border border-slate-200">
                                    CANCELAR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CONFIRMAÇÃO DE DESCONEXÃO GOOGLE */}
            {modalConfirmDisconnect && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <AlertTriangle className="text-red-600" size={32} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase italic">Desvincular Conta?</h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Você deixará de sincronizar suas reservas automaticamente com o Google Calendar.
                            </p>
                            <div className="flex flex-col gap-3 mt-8">
                                <button onClick={confirmDisconnect}
                                    disabled={loadingGoogle}
                                    className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 disabled:opacity-50 shadow-xl shadow-red-200 transition-all">
                                    Sim, Desvincular
                                </button>
                                <button onClick={() => setModalConfirmDisconnect(false)}
                                    className="w-full py-4 bg-white text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-100 hover:bg-slate-50 transition-all">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE FEEDBACK (SUCESSO/ERRO) */}
            {modalFeedback.show && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[210] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-8 text-center">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${modalFeedback.type === 'success' ? 'bg-green-50 text-green-600' :
                                modalFeedback.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                }`}>
                                {modalFeedback.type === 'success' ? <CheckCircle2 size={32} /> :
                                    modalFeedback.type === 'error' ? <XCircle size={32} /> : <Bell size={32} />}
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase italic">{modalFeedback.title}</h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                {modalFeedback.message}
                            </p>
                            <button onClick={() => setModalFeedback({ ...modalFeedback, show: false })}
                                className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER ESTILIZADO */}
            <div className="px-8 py-6 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white">Painel Administrativo</h2>
                        <p className="text-blue-200 text-sm mt-0.5 italic">Campus XXII — Ananindeua</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white/90 bg-white/10 border border-white/20 hover:bg-white/20 transition-all">
                            <FileSpreadsheet size={16} /> Relatórios
                        </button>
                    </div>
                </div>

                <div className="flex gap-1 mt-6 overflow-x-auto">
                    {TABS.map(({ key, label, Icon, badge }) => (
                        <button key={key} onClick={() => setActiveTab(key)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeTab === key ? 'bg-white/20 text-white shadow-inner' : 'text-white/50 hover:bg-white/5'}`}>
                            <Icon size={15} />
                            {label}
                            {badge && <span className="ml-1 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-black flex items-center justify-center">{badge}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTEÚDO PRINCIPAL */}
            <div className="p-8">

                {activeTab === 'usuarios' && (
                    <UserManagement
                        usuarios={usuarios}
                        onAprovar={handleAprovarUsuario}
                        onRecusar={handleRecusarUsuario}
                        onDeletar={handleDeletarUsuario}
                        onUsuarioCriado={carregarUsuarios}
                    />
                )}



                {activeTab === 'solicitacoes' && (
                    <div className="animate-in fade-in duration-500">
                        <div className="flex justify-between items-end mb-6">
                            <h3 className="text-xl font-black text-gray-900 italic uppercase">Solicitações de Espaço</h3>
                            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                                {['todos', 'pendente', 'aprovado', 'recusado'].map(s => (
                                    <button key={s} onClick={() => setFiltroStatus(s)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${filtroStatus === s ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-400'}`}>
                                        {s === 'todos' ? 'Ver Tudo' : STATUS_STYLES[s].label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {solicitacoesFiltradas.map(s => {
                                const st = STATUS_STYLES[s.status] || STATUS_STYLES.pendente
                                const isExpanded = expandedId === s.id
                                const PAPEL_LABELS = { professor: 'Professor', aluno: 'Aluno', tecnico_adm: 'Técnico Adm.', admin: 'Admin' }
                                const PAPEL_COLORS = {
                                    professor:   { bg: '#dbeafe', color: '#1d4ed8' },
                                    aluno:       { bg: '#ede9fe', color: '#7c3aed' },
                                    tecnico_adm: { bg: '#dcfce7', color: '#15803d' },
                                    admin:       { bg: '#fee2e2', color: '#dc2626' },
                                }
                                const papelLabel = PAPEL_LABELS[s.papel] || s.papel || 'Aluno'
                                const papelColor = PAPEL_COLORS[s.papel] || PAPEL_COLORS.aluno
                                return (
                                    <div key={s.id} className="bg-white border rounded-2xl overflow-hidden hover:shadow-md transition-all"
                                        style={{ borderColor: isExpanded ? st.border : '#f3f4f6' }}>

                                        {/* ── Cabeçalho sempre visível ── */}
                                        <button onClick={() => setExpandedId(isExpanded ? null : s.id)}
                                            className="w-full text-left">
                                            <div className="flex items-stretch">
                                                {/* Barra colorida de status */}
                                                <div className="w-1.5 shrink-0 rounded-l-2xl" style={{ background: st.dot }} />

                                                <div className="flex-1 px-5 py-4 min-w-0">
                                                    {/* Linha 1: nome + badges + data */}
                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                            <span className="font-black text-gray-800 text-sm uppercase truncate">{s.solicitante}</span>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: papelColor.bg, color: papelColor.color }}>{papelLabel}</span>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                                                        </div>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap shrink-0">{s.criadoEm}</span>
                                                    </div>

                                                    {/* Linha 2: motivo em destaque */}
                                                    <p className="text-xs font-semibold text-gray-600 mt-1">{s.motivo}</p>

                                                    {/* Linha 3: chips de info */}
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                                        {s.sala && (
                                                            <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 21V7a2 2 0 012-2h14a2 2 0 012 2v14" /><path d="M9 21V12h6v9" /></svg>
                                                                {s.sala}
                                                            </span>
                                                        )}
                                                        {s.diaSemana && (
                                                            <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                                {s.diaSemana}{s.dataEvento ? ` · ${s.dataEvento.split('-').reverse().join('/')}` : ''}
                                                            </span>
                                                        )}
                                                        {s.horario && (
                                                            <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                                                                {s.horario}
                                                            </span>
                                                        )}
                                                        {s.participantes && (
                                                            <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                                                                {s.participantes} participantes
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Ações rápidas + Seta */}
                                                <div className="flex items-center gap-2 pr-4 pl-2 shrink-0">
                                                    {s.status === 'pendente' && (
                                                        <>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); handleRecusarSolicitacao(s.id) }}
                                                                disabled={loadingRecusar === s.id || loadingAprovar === s.id}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                                                            >{loadingRecusar === s.id ? '...' : 'Recusar'}</button>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); handleCheckAprovar(s) }}
                                                                disabled={loadingAprovar === s.id || loadingRecusar === s.id}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm"
                                                            >{loadingAprovar === s.id ? '...' : 'Aprovar'}</button>
                                                        </>
                                                    )}
                                                    <span className="text-gray-300">
                                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>

                                        {/* ── Área expandida ── */}
                                        {isExpanded && (
                                            <div className="px-6 pb-6 pt-3 border-t" style={{ borderColor: st.border, background: `${st.bg}20` }}>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                                    {/* Identificação */}
                                                    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Identificação</p>
                                                        <InfoRow label="E-mail" value={s.email} />
                                                        <InfoRow label="Papel" value={papelLabel} />
                                                    </div>

                                                    {/* Local e horário */}
                                                    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Local e Horário</p>
                                                        <InfoRow label="Sala" value={s.sala || '—'} />
                                                        <InfoRow label="Dia" value={`${s.diaSemana}${s.dataEvento ? ` (${s.dataEvento.split('-').reverse().join('/')})` : ''}`} />
                                                        <InfoRow label="Horário" value={s.horario} />
                                                        {s.participantes && <InfoRow label="Participantes" value={s.participantes} />}
                                                    </div>

                                                    {/* Descrição */}
                                                    <div className="bg-white rounded-xl border border-gray-100 p-4 sm:col-span-2">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Descrição do Evento</p>
                                                        <p className="text-xs font-bold text-gray-700">{s.motivo}</p>
                                                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.descricao}</p>
                                                        {s.observacoes && (
                                                            <>
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-3 mb-1">Observações</p>
                                                                <p className="text-sm text-gray-500 italic">{s.observacoes}</p>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Motivo de recusa (se aplicável) */}
                                                    {s.status === 'recusado' && s.motivoRecusa && (
                                                        <div className="bg-red-50 rounded-xl border border-red-100 p-4 sm:col-span-2">
                                                            <p className="text-[10px] font-black text-red-400 uppercase tracking-wider mb-1">Motivo da Recusa</p>
                                                            <p className="text-sm text-red-700">{s.motivoRecusa}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {s.status === 'pendente' && (
                                                    <div className="flex gap-2">
                                                        <input value={motivoRecusa[s.id] || ''} onChange={e => setMotivoRecusa({ ...motivoRecusa, [s.id]: e.target.value })}
                                                            placeholder="Motivo da recusa (opcional)" className="flex-1 px-4 text-sm rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-100" />
                                                        <button onClick={() => handleRecusarSolicitacao(s.id)} disabled={loadingRecusar === s.id || loadingAprovar === s.id} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-sm border border-red-100 disabled:opacity-50">{loadingRecusar === s.id ? 'Recusando...' : 'Recusar'}</button>
                                                        <button onClick={() => handleCheckAprovar(s)} disabled={loadingAprovar === s.id || loadingRecusar === s.id} className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-100 disabled:opacity-50">{loadingAprovar === s.id ? 'Aprovando...' : 'Aprovar'}</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {activeTab === 'calendario' && (
                    <div className="space-y-6">
                        {metrics && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Alocações</p>
                                    <p className="text-2xl font-black text-gray-900">{metrics.total ?? 0}</p>
                                </div>
                                {Object.entries(metrics.status || {}).slice(0, 3).map(([k, v]) => (
                                    <div key={k} className="rounded-xl border border-gray-100 bg-white p-4">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{k || '—'}</p>
                                        <p className="text-2xl font-black text-indigo-900">{v}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950 space-y-2">
                            <p className="font-bold text-indigo-900">Registrar aulas e horários de salas</p>
                            <ul className="list-disc pl-5 text-xs text-indigo-900/85 leading-relaxed space-y-1">
                                <li>
                                    <strong>Nova aula</strong> abre o assistente completo (sala, disciplina, professor e curso).
                                </li>
                                <li>
                                    <strong>Novo evento</strong> registra uma alocação pontual sem repetição (tipo, data, nome e sala).
                                </li>
                                <li>
                                    Pedidos de espaço feitos por alunos ou professores aparecem em <strong>Solicitações</strong> para aprovação ou recusa.
                                </li>
                            </ul>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                            {isGoogleConnected && (
                                <a href="https://calendar.google.com/calendar/r/week" target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-md hover:opacity-95 transition-opacity"
                                    style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                                    <Map size={16} /> Mapa de ocupação
                                </a>
                            )}
                            <button type="button" onClick={() => setShowEventoModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-md hover:opacity-95 transition-opacity"
                                style={{ background: 'linear-gradient(135deg,#6d28d9,#7c3aed)' }}>
                                <Plus size={16} /> Novo evento
                            </button>
                            <button type="button" onClick={() => { setHorarioEdit(null); setRestoreDraft(false); setShowForm(true) }}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-md hover:opacity-95 transition-opacity"
                                style={{ background: 'linear-gradient(135deg,#1c1aa3,#4f46e5)' }}>
                                <Plus size={16} /> Nova aula
                            </button>
                        </div>

                        {!isGoogleConnected ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                        <Link size={18} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-blue-900 font-bold">Conectar Google Calendar</p>
                                        <p className="text-xs text-blue-700/70">Sincronize as reservas aprovadas automaticamente com sua agenda.</p>
                                    </div>
                                </div>
                                <button type="button"
                                    onClick={handleConnectGoogle}
                                    className="shrink-0 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center gap-2">
                                    Conectar Agora <ArrowRight size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-100 bg-green-50/60 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                        <CheckCircle2 size={18} className="text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-green-900 font-bold">Google Calendar Conectado</p>
                                        <p className="text-xs text-green-700/70">As reservas aprovadas estão sendo sincronizadas automaticamente.</p>
                                    </div>
                                </div>
                                <button type="button"
                                    onClick={handleDisconnectGoogle}
                                    className="shrink-0 px-4 py-2 rounded-xl border border-green-200 text-green-700 text-xs font-bold hover:bg-green-100 transition-all">
                                    Desconectar Agenda
                                </button>
                            </div>
                        )}
                        <ScheduleViiew isAdmin={true} onAddForDate={(date) => {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const localIsoDate = `${year}-${month}-${day}`;
                            const diasMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                            setHorarioEdit({
                                dataInicio: localIsoDate,
                                dataFim: localIsoDate,
                                diaSemana: diasMap[date.getDay()],
                            });
                            setShowForm(true);
                        }} />
                    </div>
                )}
                {activeTab === 'cadastros' && <DataManager onReturnToHorarios={() => { setActiveTab('calendario'); setRestoreDraft(true); setShowForm(true) }} />}

                {activeTab === 'configuracoes' && (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="text-center mb-10">
                            <h3 className="text-3xl font-black text-slate-900 mb-2">Configurações Gerais</h3>
                            <p className="text-slate-500 font-medium">Gerencie integrações e preferências do sistema.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Card Integração Google */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110 duration-500 opacity-50" />

                                <div className="relative z-10">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-14 h-14 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-slate-50">
                                            <svg className="w-8 h-8" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Google Calendar</h4>
                                            <p className="text-xs font-bold text-blue-600/60 uppercase">Sincronização Ativa</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className={`p-6 rounded-3xl border transition-all duration-500 ${isGoogleConnected ? 'bg-green-50/50 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex items-center gap-4">
                                                {isGoogleConnected ? (
                                                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-200 animate-pulse">
                                                        <CheckCircle2 size={24} />
                                                    </div>
                                                ) : (
                                                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                                                        <Link size={24} />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className={`text-sm font-black uppercase ${isGoogleConnected ? 'text-green-800' : 'text-slate-600'}`}>
                                                        {isGoogleConnected ? 'Sua conta está vinculada' : 'Nenhuma conta vinculada'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                                        {isGoogleConnected ? 'Reservas aprovadas aparecem na agenda Google' : 'Conecte para sincronizar as reservas automaticamente.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {!isGoogleConnected ? (
                                            <button
                                                onClick={handleConnectGoogle}
                                                disabled={loadingGoogle}
                                                className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                            >
                                                {loadingGoogle ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <><Link size={18} /> Conectar ao Google</>
                                                )}
                                            </button>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-center gap-2 py-4 px-6 bg-white border border-slate-200 rounded-3xl text-slate-400 text-xs font-bold uppercase tracking-widest">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm" />
                                                    Integração Operacional
                                                </div>
                                                <button
                                                    onClick={handleDisconnectGoogle}
                                                    disabled={loadingGoogle}
                                                    className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all"
                                                >
                                                    Desvincular Conta
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Card de Informações do Sistema */}
                            <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
                                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all" />

                                <h4 className="text-white text-xl font-black uppercase tracking-tight mb-6">Informações</h4>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center py-3 border-b border-white/5">
                                        <span className="text-slate-400 text-xs font-bold uppercase">Versão do Sistema</span>
                                        <span className="text-white text-sm font-mono">2.4.0-stable</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-white/5">
                                        <span className="text-slate-400 text-xs font-bold uppercase">Ambiente</span>
                                        <span className={environmentBadgeClass}>{environmentLabel}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3">
                                        <span className="text-slate-400 text-xs font-bold uppercase">Campus</span>
                                        <span className="text-white text-sm font-bold italic">Ananindeua - XXII</span>
                                    </div>
                                </div>

                                <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                                        O SIGRA é um sistema focado na alta produtividade e gestão ágil de recursos acadêmicos.
                                        Para suporte, entre em contato com a equipe de TI local.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showImport && <ImportarPlanilha onClose={() => setShowImport(false)} />}

            {
                showForm && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto"
                        style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
                        <div className="w-full max-w-2xl max-h-[95vh] overflow-y-auto">
                            <ScheduleForm
                                horarioEdit={horarioEdit}
                                restoreDraft={restoreDraft}
                                onGoToCadastros={(tab) => {
                                    sessionStorage.setItem('cadastrosTab', tab)
                                    setActiveTab('cadastros')
                                    setShowForm(false)
                                }}
                                onCancel={() => { setShowForm(false); setHorarioEdit(null) }}
                                onSave={async (data) => {
                                    if (horarioEdit?.id) {
                                        await atualizarHorario(horarioEdit.id, data)
                                    } else {
                                        await adicionarHorario(data)
                                    }
                                    setShowForm(false)
                                    setHorarioEdit(null)
                                }}
                            />
                        </div>
                    </div>
                )
            }

            {showEventoModal && (
                <EventoModal
                    onClose={() => setShowEventoModal(false)}
                    onSaved={() => {/* recarrega dados se necessário */}}
                />
            )}
        </div >
    )
}

export default AdminPainel
