import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useSchedule } from '../Schedule/ScheduleContext'
import {
    Plus, LayoutGrid, ClipboardList, Calendar, Database,
    CheckCircle2, XCircle, Clock, Building2, User, Users,
    AlignLeft, ChevronDown, ChevronUp, GraduationCap, BookOpen,
    Bell, Filter, Search, FileSpreadsheet, AlertTriangle, Settings, Link
} from 'lucide-react'

// Componentes Internos
import ScheduleForm from '../Schedule/ScheduleForm'
import ScheduleViiew from '../Schedule/ScheduleViiew'
import DataManager from './DataManager'
import MonthCalendar from '../Calendar/MonthCalendar'
import ImportarPlanilha from './ImportarPlanilha'
import MapaOcupacao from '../MapaOcupacao/MapaOcupacao'
import UserManagement from './UserManagement'

const STATUS_STYLES = {
    pendente: { label: 'Pendente', bg: '#fef9c3', color: '#ca8a04', dot: '#eab308', border: '#fde68a' },
    aprovado: { label: 'Aprovado', bg: '#dcfce7', color: '#16a34a', dot: '#22c55e', border: '#bbf7d0' },
    recusado: { label: 'Recusado', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444', border: '#fecaca' },
}

const AdminPainel = () => {
    const [showImport, setShowImport] = useState(false)
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') || 'horarios';
    })

    const [isGoogleConnected, setIsGoogleConnected] = useState(false)
    const [loadingGoogle, setLoadingGoogle] = useState(false)

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
            const { connectGoogle } = await import('../../services/api')
            const result = await connectGoogle()
            if (typeof result === 'string') {
                window.location.href = result;
            } else if (result.auth_url) {
                window.location.href = result.auth_url;
            } else {
                alert("Não foi possível obter a URL de conexão.");
            }
        } catch (err) {
            setModalFeedback({
                show: true,
                title: 'Erro de Conexão',
                message: 'Não foi possível obter a URL de conexão com o Google.',
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
                matricula: s.matricula,
                papel: s.papel,
                motivo: s.motivo,
                descricao: s.descricao,
                sala: s.sala?.nomeSala || '',
                salaId: s.salaId,
                diaSemana: s.diaSemana,
                dataEvento: s.dataEvento || '',
                horario: `${s.horarioInicio} – ${s.horarioFim}`,
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
        await handleFinalizarAprovacao(solicitacao.id);
    }

    const handleFinalizarAprovacao = async (id, substituir = false) => {
        try {
            await api.patch(`/solicitations/${id}/status`, {
                status: 'aprovado'
            });
            carregarSolicitacoes();
            setConflito(null);
            setExpandedId(null);
        } catch (err) { alert('Erro ao finalizar aprovação.'); }
    }

    const handleRecusarSolicitacao = async (id) => {
        try {
            await api.patch(`/solicitations/${id}/status`, {
                status: 'recusado',
                motivoRecusa: motivoRecusa[id] || ''
            })
            carregarSolicitacoes()
            setExpandedId(null)
        } catch (err) { alert('Erro ao recusar solicitação.') }
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
        { key: 'horarios', label: 'Horários', Icon: LayoutGrid, badge: null },
        { key: 'solicitacoes', label: 'Solicitações', Icon: ClipboardList, badge: pendentesSols > 0 ? pendentesSols : null },
        { key: 'calendario', label: 'Calendário', Icon: Calendar, badge: null },
        { key: 'mapa', label: 'Grade', Icon: Calendar, badge: null },
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
                                    className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200">
                                    SUBSTITUIR E APROVAR
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
                                    className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-200 transition-all">
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
                {activeTab === 'mapa' && <MapaOcupacao />}

                {activeTab === 'usuarios' && (
                    <UserManagement
                        usuarios={usuarios}
                        onAprovar={handleAprovarUsuario}
                        onRecusar={handleRecusarUsuario}
                        onDeletar={handleDeletarUsuario}
                    />
                )}

                {activeTab === 'horarios' && <ScheduleViiew isAdmin={true} />}

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
                            {solicitacoesFiltradas.map(s => (
                                <div key={s.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-all">
                                    <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} className="w-full flex items-center gap-4 p-5 text-left">
                                        <div className="w-1.5 h-10 rounded-full" style={{ background: STATUS_STYLES[s.status].dot }} />
                                        <div className="flex-1">
                                            <p className="font-black text-gray-800 text-sm uppercase">{s.solicitante}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{s.sala} — {s.horario}</p>
                                        </div>
                                        {expandedId === s.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>

                                    {expandedId === s.id && (
                                        <div className="px-6 pb-6 pt-2 bg-gray-50/30">
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 mb-4">
                                                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Descrição do Evento</p>
                                                <p className="text-sm font-bold text-gray-700">{s.motivo}</p>
                                                <p className="text-sm text-gray-600 mt-1">{s.descricao}</p>
                                            </div>
                                            {s.status === 'pendente' && (
                                                <div className="flex gap-2">
                                                    <input value={motivoRecusa[s.id] || ''} onChange={e => setMotivoRecusa({ ...motivoRecusa, [s.id]: e.target.value })}
                                                        placeholder="Motivo da recusa (opcional)" className="flex-1 px-4 text-sm rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-100" />
                                                    <button onClick={() => handleRecusarSolicitacao(s.id)} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-sm border border-red-100">Recusar</button>
                                                    <button onClick={() => handleCheckAprovar(s)} className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-100">Aprovar</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'calendario' && <MonthCalendar />}
                {activeTab === 'cadastros' && <DataManager />}

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
                                        <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-black uppercase border border-green-500/30">Produção</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3">
                                        <span className="text-slate-400 text-xs font-bold uppercase">Campus</span>
                                        <span className="text-white text-sm font-bold italic">Ananindeua - XXII</span>
                                    </div>
                                </div>

                                <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                                        O SIGRE é um sistema focado na alta produtividade e gestão ágil de recursos acadêmicos.
                                        Para suporte, entre em contato com a equipe de TI local.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showImport && <ImportarPlanilha onClose={() => setShowImport(false)} />}
        </div>
    )
}

export default AdminPainel