import { useState, useEffect } from 'react'
import { useSchedule } from '../Schedule/ScheduleContext'
import ScheduleViiew from '../Schedule/ScheduleViiew'
import RoomRequestForm from './RoomRequestForm'
import axios from 'axios'
import { Building2, ClipboardList, Plus, GraduationCap, BookOpen, LogOut, Bell, Calendar, Clock } from 'lucide-react'
import logo from '../../assets/logouepa.png'

import api from '../../services/api'

const roleConfig = {
    aluno:     { label: 'Aluno',     Icon: GraduationCap, color: '#7c3aed' },
    professor: { label: 'Professor', Icon: BookOpen,      color: '#1d4ed8' },
}

const STATUS_STYLES = {
    pendente: { label: 'Pendente', bg: '#fef9c3', color: '#ca8a04', dot: '#eab308' },
    aprovado: { label: 'Aprovado', bg: '#dcfce7', color: '#16a34a', dot: '#22c55e' },
    recusado: { label: 'Recusado', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
}

const UserView = ({ userRole, onLogOut }) => {
    const { salas } = useSchedule()
    const [showForm, setShowForm]   = useState(false)
    const [activeTab, setActiveTab] = useState('grade')
    const [solicitacoes, setSolicitacoes] = useState([])
    const [loading, setLoading] = useState(false)

    const cfg = roleConfig[userRole] || roleConfig.aluno
    const RoleIcon = cfg.Icon
    const adminUser = localStorage.getItem('adminUser') || cfg.label
    // Email salvo no login (para buscar solicitações do usuário)
    const userEmail = localStorage.getItem('userEmail') || ''

    const pendentes = solicitacoes.filter(s => s.status === 'pendente').length

    const carregarSolicitacoes = async () => {
        if (!userEmail) return
        setLoading(true)
        try {
            const res = await api.get('/solicitations/mine', {
                params: { email: userEmail }
            })
            setSolicitacoes(res.data.map(formatSolicitacao))
        } catch (err) {
            console.error('Erro ao carregar solicitações:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        carregarSolicitacoes()
    }, [userEmail])

    const formatSolicitacao = (s) => ({
        id:       s.idSolicitacao,
        motivo:   s.motivo,
        descricao: s.descricao,
        observacoes: s.observacoes,
        sala:     s.sala?.nomeSala || '',
        diaSemana: s.diaSemana,
        data:     s.dataEvento || '',
        horario:  `${s.horarioInicio} – ${s.horarioFim}`,
        status:   s.status,
        criadoEm: s.criadoEm,
        motivoRecusa: s.motivoRecusa,
    })

    const handleNovaSolicitacao = (novaSol) => {
        setSolicitacoes(prev => [formatSolicitacao(novaSol), ...prev])
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">

            {/* Header */}
            <header style={{ background: 'linear-gradient(90deg, #1c1aa3 0%, #150355 100%)' }} className="shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center gap-4">
                            <img src={logo} alt="Logo UEPA" className="h-10 object-contain" />
                            <div className="hidden sm:block w-px h-8 bg-white/20" />
                            <div className="hidden sm:block">
                                <p className="text-xs font-bold text-blue-200 tracking-widest uppercase">SIGRE</p>
                                <p className="text-[10px] text-blue-300/60">Sistema Integrado de Gestão de Reservas Acadêmicas</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {pendentes > 0 && (
                                <div className="relative">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors"
                                        onClick={() => setActiveTab('solicitacoes')}>
                                        <Bell size={17} className="text-white" />
                                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 text-[10px] font-black text-gray-900 flex items-center justify-center">
                                            {pendentes}
                                        </span>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3 py-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: cfg.color }}>
                                    <RoleIcon size={14} className="text-white" />
                                </div>
                                <div className="hidden sm:block">
                                    <p className="text-white text-xs font-bold leading-none">{adminUser}</p>
                                    <p className="text-blue-300 text-[10px] mt-0.5">{cfg.label}</p>
                                </div>
                            </div>
                            <button onClick={onLogOut}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-red-500/60 text-white text-xs font-semibold transition-all">
                                <LogOut size={14} />
                                <span className="hidden sm:inline">Sair</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Sub-header */}
            <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex">
                            {[
                                { key: 'grade',        label: 'Grade de Horários',  Icon: Building2 },
                                { key: 'solicitacoes', label: 'Minhas Solicitações', Icon: ClipboardList },
                            ].map(({ key, label, Icon }) => (
                                <button key={key} onClick={() => setActiveTab(key)}
                                    className="relative flex items-center gap-2 px-5 py-4 text-sm font-semibold transition-colors"
                                    style={{ color: activeTab === key ? '#1c1aa3' : '#6b7280' }}>
                                    <Icon size={16} />
                                    {label}
                                    {key === 'solicitacoes' && pendentes > 0 && (
                                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-700">
                                            {pendentes}
                                        </span>
                                    )}
                                    {activeTab === key && (
                                        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                                            style={{ background: 'linear-gradient(90deg, #1c1aa3, #7c3aed)' }} />
                                    )}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowForm(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold hover:-translate-y-0.5 transition-all"
                            style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 4px 16px rgba(28,26,163,0.3)' }}>
                            <Plus size={16} />
                            <span className="hidden sm:inline">Solicitar Agendamento</span>
                            <span className="sm:hidden">Solicitar</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Conteúdo */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === 'grade' && <ScheduleViiew readOnly />}

                {activeTab === 'solicitacoes' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900">Minhas Solicitações</h2>
                                <p className="text-sm text-gray-500 mt-1">Acompanhe o status dos seus pedidos de agendamento</p>
                            </div>
                            <button onClick={() => setShowForm(true)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm hover:shadow-md transition-all"
                                style={{ borderColor: '#1c1aa3', color: '#1c1aa3', background: '#1c1aa308' }}>
                                <Plus size={15} /> Nova Solicitação
                            </button>
                        </div>

                        {loading ? (
                            <div className="text-center py-16 text-gray-400 text-sm">Carregando...</div>
                        ) : solicitacoes.length === 0 ? (
                            <EmptyState onNew={() => setShowForm(true)} />
                        ) : (
                            <div className="flex flex-col gap-3">
                                {solicitacoes.map(s => {
                                    const st = STATUS_STYLES[s.status]
                                    return (
                                        <div key={s.id}
                                            className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                        <span className="text-base font-black text-gray-800">{s.motivo}</span>
                                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                                                            style={{ background: st.bg, color: st.color }}>
                                                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                                                                style={{ background: st.dot }} />
                                                            {st.label}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-600 mb-3">{s.descricao}</p>
                                                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                                        <span className="flex items-center gap-1"><Building2 size={12} />{s.sala}</span>
                                                        <span className="flex items-center gap-1"><Calendar size={12} />{s.diaSemana}{s.data ? `, ${s.data}` : ''}</span>
                                                        <span className="flex items-center gap-1"><Clock size={12} />{s.horario}</span>
                                                    </div>
                                                    {/* Motivo de recusa */}
                                                    {s.status === 'recusado' && s.motivoRecusa && (
                                                        <p className="mt-3 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                                            <strong>Motivo:</strong> {s.motivoRecusa}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: st.dot }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {showForm && (
                <RoomRequestForm
                    userRole={userRole}
                    onClose={() => setShowForm(false)}
                    onSolicitacaoCriada={handleNovaSolicitacao}
                />
            )}
        </div>
    )
}

const EmptyState = ({ onNew }) => (
    <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1c1aa308, #7c3aed15)' }}>
            <ClipboardList size={28} style={{ color: '#1c1aa3' }} />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Nenhuma solicitação ainda</h3>
        <p className="text-sm text-gray-500 mb-6">Você ainda não fez nenhum pedido de agendamento de sala.</p>
        <button onClick={onNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 6px 20px rgba(28,26,163,0.3)' }}>
            <Plus size={16} /> Fazer Primeira Solicitação
        </button>
    </div>
)

export default UserView