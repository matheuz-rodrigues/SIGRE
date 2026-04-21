import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useSchedule } from '../Schedule/ScheduleContext'
import { getDashboardMetrics } from '../../services/DashboardService'
import { startGoogleCalendarConnect } from '../../services/GoogleServices'
import {
    LayoutGrid, ClipboardList, Calendar, Database,
    Users, Settings
} from 'lucide-react'

// Hooks
import { useGoogleAuth } from '../../hooks/useGoogleAuth'
import { useAdminUsers } from '../../hooks/useAdminUsers'
import { useAdminSolicitacoes } from '../../hooks/useAdminSolicitacoes'

// Componentes Internos
import ScheduleForm from '../Schedule/ScheduleForm'
import ScheduleViiew from '../Schedule/ScheduleViiew'
import DataManager from './DataManager'
import MonthCalendar from '../Calendar/MonthCalendar'
import ImportarPlanilha from './ImportarPlanilha'
import MapaOcupacao from '../MapaOcupacao/MapaOcupacao'
import UserManagement from './UserManagement'
import SolicitacoesTab from './SolicitacoesTab'
import AdminHeader from './AdminHeader'
import HorariosTab from './HorariosTab'
import ConfiguracoesTab from './ConfiguracoesTab'
import AdminModals from './AdminModals'

const STATUS_STYLES = {
    pendente: { label: 'Pendente', bg: '#fef9c3', color: '#ca8a04', dot: '#eab308', border: '#fde68a' },
    aprovado: { label: 'Aprovado', bg: '#dcfce7', color: '#16a34a', dot: '#22c55e', border: '#bbf7d0' },
    recusado: { label: 'Recusado', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444', border: '#fecaca' },
}

const normalizeStatus = (status) => {
    if (!status) return 'pendente'
    const s = status.toLowerCase()
    if (s === 'pending') return 'pendente'
    if (s === 'approved') return 'aprovado'
    if (s === 'rejected' || s === 'recusado' || s === 'refused') return 'recusado'
    return s
}

const AdminPainel = () => {
    const { adicionarHorario, atualizarHorario, horarios, recarregarDados } = useSchedule()
    const [showImport, setShowImport] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [horarioEdit, setHorarioEdit] = useState(null)
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') || 'horarios';
    })

    const [modalFeedback, setModalFeedback] = useState({ show: false, title: '', message: '', type: 'info' })

    const {
        isGoogleConnected,
        loadingGoogle,
        modalConfirmDisconnect,
        setModalConfirmDisconnect,
        checkGoogleStatus,
        handleConnectGoogle,
        handleDisconnectGoogle,
        confirmDisconnect
    } = useGoogleAuth(setModalFeedback);

    const {
        usuarios,
        carregarUsuarios,
        handleAprovarUsuario,
        handleRecusarUsuario,
        handleDeletarUsuario
    } = useAdminUsers();

    const [metrics, setMetrics] = useState(null)
    const fetchMetrics = useCallback(() => {
        getDashboardMetrics()
            .then(setMetrics)
            .catch(() => setMetrics(null))
    }, []);

    const {
        solicitacoes,
        loadingSols,
        carregarSolicitacoes,
        handleCheckAprovar,
        handleRecusarSolicitacao
    } = useAdminSolicitacoes(recarregarDados, fetchMetrics, setModalFeedback);

    useEffect(() => {
        carregarSolicitacoes(horarios.filter(h => h.status === 'APPROVED' || h.status === 'aprovado'));
        carregarUsuarios();
        checkGoogleStatus();
        fetchMetrics();
    }, [carregarSolicitacoes, carregarUsuarios, checkGoogleStatus, fetchMetrics, horarios]);


    const pendentesSols = solicitacoes.filter(s => s.status === 'pendente').length
    const pendentesUser = usuarios.filter(u => u.status === 'pendente').length

    const TABS = [
        { key: 'horarios', label: 'Horários', Icon: LayoutGrid, badge: null },
        { key: 'calendario', label: 'Calendário', Icon: Calendar, badge: null },
        { key: 'solicitacoes', label: 'Solicitações', Icon: ClipboardList, badge: pendentesSols > 0 ? pendentesSols : null },
        { key: 'cadastros', label: 'Cadastros', Icon: Database, badge: null },
        { key: 'usuarios', label: 'Usuários', Icon: Users, badge: pendentesUser > 0 ? pendentesUser : null },
        { key: 'configuracoes', label: 'Configurações', Icon: Settings, badge: null },
    ]

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative min-h-screen">

            <AdminModals 
                modalConfirmDisconnect={modalConfirmDisconnect}
                setModalConfirmDisconnect={setModalConfirmDisconnect}
                confirmDisconnect={confirmDisconnect}
                modalFeedback={modalFeedback}
                setModalFeedback={setModalFeedback}
            />

            <AdminHeader 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                setShowImport={setShowImport} 
                TABS={TABS} 
            />

            {/* CONTEÚDO PRINCIPAL */}
            <div className="p-8">

                {activeTab === 'horarios' && (
                    <HorariosTab 
                        metrics={metrics}
                        isGoogleConnected={isGoogleConnected}
                        handleConnectGoogle={handleConnectGoogle}
                        setHorarioEdit={setHorarioEdit}
                        setShowForm={setShowForm}
                    />
                )}

                {activeTab === 'solicitacoes' && (
                    <SolicitacoesTab 
                        solicitacoes={solicitacoes}
                        handleCheckAprovar={handleCheckAprovar}
                        handleRecusarSolicitacao={handleRecusarSolicitacao}
                    />
                )}

                {activeTab === 'calendario' && (
                    <div className="space-y-4">
                        <MonthCalendar isConnected={isGoogleConnected} />
                    </div>
                )}
                {activeTab === 'cadastros' && <DataManager onReturnToHorarios={() => setActiveTab('horarios')} />}

                {activeTab === 'configuracoes' && (
                    <ConfiguracoesTab
                        isGoogleConnected={isGoogleConnected}
                        loadingGoogle={loadingGoogle}
                        handleConnectGoogle={handleConnectGoogle}
                        handleDisconnectGoogle={handleDisconnectGoogle}
                    />
                )}
            </div>

            {showImport && <ImportarPlanilha onClose={() => setShowImport(false)} />}

            {showForm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto"
                    style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-full max-w-2xl max-h-[95vh] overflow-y-auto">
                        <ScheduleForm
                            horarioEdit={horarioEdit}
                            restoreDraft={false}
                            onGoToCadastros={(tab) => {
                                sessionStorage.setItem('cadastrosTab', tab)
                                setActiveTab('cadastros')
                                setShowForm(false)
                            }}
                            onCancel={() => { setShowForm(false); setHorarioEdit(null) }}
                            onSave={async (data) => {
                                let res;
                                if (horarioEdit?.id) {
                                    res = await atualizarHorario(horarioEdit.id, data)
                                } else {
                                    res = await adicionarHorario(data)
                                }

                                if (res.success) {
                                    setShowForm(false)
                                    setHorarioEdit(null)

                                    const isPendingDueToGoogle = res.data?.google_required_for_approval

                                    setModalFeedback({
                                        show: true,
                                        title: isPendingDueToGoogle ? 'Salvo como Pendente' : 'Sucesso',
                                        message: isPendingDueToGoogle
                                            ? 'O horário foi salvo, mas ficou PENDENTE porque sua conta Google não está conectada. Conecte sua conta em "Configurações" para poder aprovar horários.'
                                            : (horarioEdit?.id ? 'Horário atualizado com sucesso!' : 'Horário cadastrado com sucesso!'),
                                        type: isPendingDueToGoogle ? 'info' : 'success'
                                    })
                                } else {
                                    setModalFeedback({
                                        show: true,
                                        title: 'Erro ao Salvar',
                                        message: res.error,
                                        type: 'error'
                                    })
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminPainel