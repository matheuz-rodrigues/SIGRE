import { Plus, ArrowLeft } from 'lucide-react'
import { useDataManager } from '../../hooks/useDataManager'
import { CONFIG } from './_config/DataManagerConfig'
import ItemModal from './_components/ItemModal'
import DataList from './_components/DataList'

// ─── Componente principal ─────────────────────────────────────────────────────
const DataManager = ({ onReturnToHorarios }) => {
    const {
        activeTab, setActiveTab,
        modal, setModal,
        lists,
        loading,
        showResumeBanner, setShowResumeBanner,
        handleModalClose,
        handleModalSave,
        handleDelete,
        handleAddSubItem
    } = useDataManager()

    const allTabs = Object.entries(CONFIG).map(([key, c]) => ({ key, ...c }))
    const currentTab = allTabs.find(t => t.key === activeTab)
    const list = currentTab ? lists[activeTab] : []

    const handleDismissDraft = () => {
        sessionStorage.removeItem('scheduleFormDraft')
        sessionStorage.removeItem('scheduleFormStep')
        setShowResumeBanner(false)
    }

    return (
        <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
            {/* ── Banner continuar horário ── */}
            {showResumeBanner && (
                <div className="mb-5 flex items-center justify-between gap-4 px-5 py-4 rounded-xl border"
                    style={{
                        background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                        borderColor: '#c7d2fe',
                        animation: 'fadeInDown 0.25s ease'
                    }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                            <ArrowLeft size={16} className="text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-indigo-900">Você tem um horário em andamento</p>
                            <p className="text-xs text-indigo-500 mt-0.5">
                                Quer voltar para onde você estava no cadastro de novo horário?
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={handleDismissDraft}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-indigo-500 hover:bg-indigo-100 transition-colors">
                            Descartar
                        </button>
                        <button onClick={onReturnToHorarios}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-all"
                            style={{ background: 'linear-gradient(135deg,#1c1aa3,#4f46e5)', boxShadow: '0 4px 12px rgba(28,26,163,0.3)' }}>
                            <ArrowLeft size={13} />
                            Continuar horário
                        </button>
                    </div>
                </div>
            )}

            <div className="rounded-2xl overflow-hidden border border-gray-200"
                style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>

                {/* Cabeçalho */}
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/80">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-base font-black text-gray-900">Gerenciar Cadastros</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Adicione, edite ou remova dados do sistema</p>
                        </div>
                        {activeTab !== 'professores' && (
                            <button
                                onClick={() => setModal({ tipo: activeTab, item: null })}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-all hover:-translate-y-0.5"
                                style={{
                                    background: `linear-gradient(135deg, ${currentTab?.color}, ${currentTab?.color}cc)`,
                                    boxShadow: `0 4px 12px ${currentTab?.color}35`
                                }}>
                                <Plus size={14} />
                                Novo(a) {currentTab?.singular}
                            </button>
                        )}
                    </div>

                    {/* Abas */}
                    <div className="flex gap-1 overflow-x-auto pb-0.5">
                        {allTabs.map(tab => {
                            const Icon = tab.icon
                            const active = activeTab === tab.key
                            const count = lists[tab.key]?.length
                            return (
                                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
                                    style={active ? { background: tab.colorBg, color: tab.color } : { color: '#9ca3af' }}>
                                    <Icon size={12} />
                                    {tab.title}
                                    {count !== undefined && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black"
                                            style={{ background: active ? tab.color + '25' : '#f3f4f6', color: active ? tab.color : '#9ca3af' }}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* ── Conteúdo da aba ── */}
                <div className="bg-white">
                    <DataList 
                        list={list}
                        cfg={currentTab}
                        activeTab={activeTab}
                        onEdit={(item) => setModal({ tipo: activeTab, item })}
                        onDelete={handleDelete}
                        onAdd={() => setModal({ tipo: activeTab, item: null })}
                    />
                </div>
            </div>

            {/* Modal genérico */}
            {modal && (
                <ItemModal
                    tipo={modal.tipo}
                    item={modal.item}
                    lists={lists}
                    onSave={handleModalSave}
                    onClose={handleModalClose}
                    onAddSubItem={handleAddSubItem}
                />
            )}
        </div>
    )
}

export default DataManager