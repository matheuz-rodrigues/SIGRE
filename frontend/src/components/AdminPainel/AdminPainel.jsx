import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useSchedule } from '../Schedule/ScheduleContext'
import {
    Plus, LayoutGrid, ClipboardList, Calendar, Database,
    CheckCircle2, XCircle, Clock, Building2, User, Users,
    AlignLeft, ChevronDown, ChevronUp, GraduationCap, BookOpen,
    Bell, Filter, Search, FileSpreadsheet, AlertTriangle
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
    const { adicionarHorario, atualizarHorario } = useSchedule()

    const [activeTab, setActiveTab]     = useState('horarios')
    const [showForm, setShowForm]       = useState(false)
    const [horarioEdit, setHorarioEdit] = useState(null)
    const [showImport, setShowImport]   = useState(false)

    // ── Lógica de Conflitos (Substituição de Eventos) ──
    const [conflito, setConflito] = useState(null);

    // ── Estado de Solicitações ──
    const [solicitacoes, setSolicitacoes] = useState([])
    const [loadingSols, setLoadingSols]   = useState(true)
    const [filtroStatus, setFiltroStatus] = useState('todos')
    const [busca, setBusca]               = useState('')
    const [expandedId, setExpandedId]     = useState(null)
    const [motivoRecusa, setMotivoRecusa] = useState({})

    // ── Estado de Usuários ──
    const [usuarios, setUsuarios] = useState([])

    const carregarSolicitacoes = async () => {
        setLoadingSols(true)
        try {
            const res = await api.get('/solicitations/')
            setSolicitacoes(res.data.map(s => ({
                id:           s.idSolicitacao,
                solicitante:  s.solicitante,
                email:        s.email,
                matricula:    s.matricula,
                papel:        s.papel,
                motivo:       s.motivo,
                descricao:    s.descricao,
                sala:         s.sala?.nomeSala || '',
                salaId:       s.salaId,
                diaSemana:    s.diaSemana,
                dataEvento:   s.dataEvento || '',
                horario:      `${s.horarioInicio} – ${s.horarioFim}`,
                horarioInicio: s.horarioInicio,
                horarioFim:    s.horarioFim,
                participantes: s.participantes,
                observacoes:  s.observacoes || '',
                status:       s.status,
                motivoRecusa: s.motivoRecusa || '',
                criadoEm:     new Date(s.criadoEm).toLocaleString('pt-BR'),
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

    // ── Handlers de Solicitações com Resolução de Conflitos ──
    const handleCheckAprovar = async (solicitacao) => {
        // O backend novo não tem endpoint de check-conflito explícito para solicitações.
        // Vamos direto para a aprovação por enquanto ou implementar um check via /reservations.
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

    // ── Filtros e Navegação ──
    const solicitacoesFiltradas = solicitacoes.filter(s => {
        if (filtroStatus !== 'todos' && s.status !== filtroStatus) return false
        if (busca && !s.solicitante.toLowerCase().includes(busca.toLowerCase()) &&
            !s.descricao.toLowerCase().includes(busca.toLowerCase())) return false
        return true
    })

    const pendentesSols = solicitacoes.filter(s => s.status === 'pendente').length
    const pendentesUser = usuarios.filter(u => u.status === 'pendente').length

    const TABS = [
        { key: 'horarios',     label: 'Horários',     Icon: LayoutGrid,    badge: null },
        { key: 'solicitacoes', label: 'Solicitações',  Icon: ClipboardList, badge: pendentesSols > 0 ? pendentesSols : null },
        { key: 'calendario',   label: 'Calendário',   Icon: Calendar,      badge: null },
        { key: 'mapa',         label: 'Grade',          Icon: Calendar,      badge: null },
        { key: 'cadastros',    label: 'Cadastros',    Icon: Database,      badge: null },
        { key: 'usuarios',     label: 'Usuários',     Icon: Users,         badge: pendentesUser > 0 ? pendentesUser : null },
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
                                        {expandedId === s.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
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
                                                    <input value={motivoRecusa[s.id] || ''} onChange={e => setMotivoRecusa({...motivoRecusa, [s.id]: e.target.value})}
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
            </div>

            {showImport && <ImportarPlanilha onClose={() => setShowImport(false)} />}
        </div>
    )
}

export default AdminPainel