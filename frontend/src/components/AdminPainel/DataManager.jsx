import { useState, useEffect } from 'react'
import { useSchedule } from '../Schedule/ScheduleContext'
import { Edit2, Trash2, X, Plus, Check, BookOpen, Users, Building2, GraduationCap, Calendar, ArrowLeft, Layers } from 'lucide-react'
import api from '../../services/api'

const inp = "w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-800 focus:ring-2 focus:ring-indigo-400 focus:outline-none focus:border-indigo-400 transition-all text-sm"
const lbl = "block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5"

const CONFIG = {
    professores: {
        title: 'Professores', singular: 'Professor', endpoint: 'professors', labelKey: 'nomeProf',
        icon: Users, color: '#1d4ed8', colorBg: '#dbeafe',
        fields: [
            { front: 'nome',      back: 'nomeProf',      label: 'Nome completo', type: 'text',  ph: 'Ex: João Silva' },
            { front: 'email',     back: 'emailProf',     label: 'E-mail',        type: 'email', ph: 'joao@uepa.br' },
            { front: 'matricula', back: 'matriculaProf', label: 'Matrícula',     type: 'text',  ph: 'Ex: 123456' },
        ],
    },
    disciplinas: {
        title: 'Disciplinas', singular: 'Disciplina', endpoint: 'disciplines', labelKey: 'nomeDisciplina',
        icon: BookOpen, color: '#7c3aed', colorBg: '#ede9fe',
        fields: [
            { front: 'nome',        back: 'nomeDisciplina',      label: 'Nome da disciplina', type: 'text', ph: 'Ex: Cálculo I' },
            { front: 'matricula',   back: 'matriculaDisciplina', label: 'Código/Sigla',       type: 'text', ph: 'Ex: MAT001' },
            // NOVO CAMPO: Lista dinâmica de Cursos
            { front: 'cursoIdFake', back: 'cursoIdFake',         label: 'Curso da Disciplina', type: 'dynamic-select', listName: 'cursos' },
        ],
    },
    cursos: {
        title: 'Cursos', singular: 'Curso', endpoint: 'courses', labelKey: 'nomeCurso',
        icon: GraduationCap, color: '#0891b2', colorBg: '#cffafe',
        fields: [
            { front: 'nome',  back: 'nomeCurso',  label: 'Nome do curso', type: 'text',  ph: 'Ex: Engenharia de Software' },
            { front: 'sigla', back: 'siglaCurso', label: 'Sigla',         type: 'text',  ph: 'Ex: BES' },
            { front: 'cor',   back: 'corCurso',   label: 'Cor de identificação', type: 'color' },
        ],
    },
    salas: {
        title: 'Salas', singular: 'Sala', endpoint: 'rooms', labelKey: 'nomeSala',
        icon: Building2, color: '#059669', colorBg: '#d1fae5',
        fields: [
            { front: 'nome', back: 'nomeSala', label: 'Nome da sala', type: 'text', ph: 'Ex: 101' },
            { front: 'tipo', back: 'tipoSalaId', label: 'Tipo', type: 'select',
              options: [
                  { v: '1', l: 'Laboratório' },
                  { v: '2', l: 'Auditório' },
                  { v: '3', l: 'Sala de Aula' },
                  { v: '4', l: 'Sala de Estudos' }
              ] },
            { front: 'capacidade', back: 'capacidade', label: 'Capacidade', type: 'number', ph: 'Ex: 40' }
        ],
    },
    periodos: {
        title: 'Períodos', singular: 'Período', endpoint: 'periods', labelKey: 'semestre',
        icon: Calendar, color: '#d97706', colorBg: '#fef3c7',
        fields: [
            { front: 'semestre',   back: 'semestre',   label: 'Semestre',    type: 'text', ph: 'Ex: 2025.1' },
            { front: 'descricao',  back: 'descricao',  label: 'Descrição',   type: 'text', ph: 'Ex: Primeiro Semestre' },
            { front: 'dataInicio', back: 'dataInicio', label: 'Data início', type: 'date' },
            { front: 'dataFim',    back: 'dataFim',    label: 'Data fim',    type: 'date' },
        ],
    },
}

// ─── Modal criar/editar (genérico) ───────────────────────────────────────────
const ItemModal = ({ tipo, item, lists, onSave, onClose }) => {
    const cfg = CONFIG[tipo]
    const isEdit = !!item
    const initial = {}

    // Preenche os dados do modal
    cfg.fields.forEach(f => {
        let val = item?.[f.front] || item?.[f.back] || ''
        
        // TRUQUE: Desempacota o Curso escondido na Disciplina
        if (tipo === 'disciplinas' && item?.matriculaDisciplina?.includes('| META:')) {
            if (f.front === 'matricula') {
                val = item.matriculaDisciplina.split('| META:')[0].trim();
            }
            if (f.front === 'cursoIdFake') {
                try { val = JSON.parse(item.matriculaDisciplina.split('| META:')[1]).cId || ''; } catch(e){}
            }
        }
        initial[f.front] = val
    })

    const [data, setData] = useState(initial)
    const set = (k, v) => setData(d => ({ ...d, [k]: v }))

    const handleSubmit = () => {
        const payload = {}
        cfg.fields.forEach(f => {
            if (data[f.front] !== undefined && data[f.front] !== '') payload[f.back] = data[f.front]
        })

        // TRUQUE: Empacota o Curso na Disciplina antes de enviar para o backend
        if (tipo === 'disciplinas' && payload.cursoIdFake) {
            payload.matriculaDisciplina = `${payload.matriculaDisciplina || ''} | META:{"cId":"${payload.cursoIdFake}"}`
            delete payload.cursoIdFake;
        } else if (tipo === 'disciplinas') {
            delete payload.cursoIdFake;
        }

        const fallbackId = item?.id || item?.idProfessor || item?.idDisciplina || item?.idCurso || item?.idSala || item?.idPeriodo;
        if (isEdit) payload.id = fallbackId;
        onSave(payload)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                style={{ animation: 'fadeInUp 0.2s ease' }}>
                <div className="px-6 py-5 flex items-center justify-between"
                    style={{ background: `linear-gradient(135deg, ${cfg.color}12, ${cfg.color}06)`, borderBottom: `1px solid ${cfg.color}20` }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cfg.colorBg }}>
                            <cfg.icon size={16} style={{ color: cfg.color }} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900">{isEdit ? `Editar ${cfg.singular}` : `Novo(a) ${cfg.singular}`}</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">{isEdit ? 'Atualize os campos necessários' : 'Preencha os dados abaixo'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {cfg.fields.map(field => (
                        <div key={field.front}>
                            <label className={lbl}>{field.label}</label>
                            {field.type === 'select' ? (
                                <select className={inp} value={data[field.front]} onChange={e => set(field.front, e.target.value)}>
                                    <option value="">Selecione...</option>
                                    {field.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                </select>
                            ) : field.type === 'dynamic-select' ? (
                                <select className={inp} value={data[field.front]} onChange={e => set(field.front, e.target.value)}>
                                    <option value="">Selecione o curso (Opcional)</option>
                                    {(lists[field.listName] || []).map(o => (
                                        <option key={o.id || o.idCurso} value={String(o.id || o.idCurso)}>{o.nomeCurso || o.siglaCurso}</option>
                                    ))}
                                </select>
                            ) : field.type === 'color' ? (
                                <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 bg-gray-50">
                                    <input type="color" className="h-9 w-14 cursor-pointer rounded-lg border-0 bg-transparent"
                                        value={data[field.front] || '#3b82f6'} onChange={e => set(field.front, e.target.value)} />
                                    <span className="text-sm text-gray-400 font-mono">{data[field.front] || '#3b82f6'}</span>
                                    <div className="w-6 h-6 rounded-lg ml-auto border border-gray-200 shadow-sm"
                                        style={{ background: data[field.front] || '#3b82f6' }} />
                                </div>
                            ) : (
                                <input type={field.type} className={inp} placeholder={field.ph || ''}
                                    value={data[field.front]} onChange={e => set(field.front, e.target.value)} />
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex gap-3 px-6 pb-6">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit}
                        className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                        style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`, boxShadow: `0 4px 14px ${cfg.color}35` }}>
                        <Check size={14} />{isEdit ? 'Atualizar' : 'Cadastrar'}
                    </button>
                </div>
            </div>
            <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
    )
}

// ─── Componente principal ─────────────────────────────────────────────────────
const DataManager = ({ onReturnToHorarios }) => {
    const { professores, disciplinas, cursos, salas, periodos, recarregarDados } = useSchedule()
    const [activeTab, setActiveTab] = useState('professores')
    const [modal, setModal] = useState(null)

    const hasDraft = !!sessionStorage.getItem('scheduleFormDraft')
    const [showResumeBanner, setShowResumeBanner] = useState(false)

    useEffect(() => {
        const tab = sessionStorage.getItem('cadastrosTab')
        if (tab && CONFIG[tab]) {
            setActiveTab(tab)
            sessionStorage.removeItem('cadastrosTab')
            setTimeout(() => setModal({ tipo: tab, item: null }), 100)
        }
    }, [])

    const handleModalClose = () => {
        setModal(null)
        if (hasDraft) setShowResumeBanner(true)
    }

    const handleModalSave = async (payload) => {
        const cfg = CONFIG[activeTab]
        try {
            if (payload.id) {
                await api.put(`/${cfg.endpoint}/${payload.id}`, payload)
            } else {
                await api.post(`/${cfg.endpoint}/`, payload)
            }
            recarregarDados()
            setModal(null)
            if (hasDraft) setShowResumeBanner(true)
        } catch (err) {
            alert(err.response?.data?.message || 'Erro ao salvar. Verifique os dados.')
        }
    }

    const handleDelete = async (id) => {
        const cfg = CONFIG[activeTab]
        if (!window.confirm('Tem certeza que deseja excluir?')) return
        try {
            await api.delete(`/${cfg.endpoint}/${id}`)
            recarregarDados()
        } catch {
            alert('Erro ao excluir. Este item pode estar sendo usado em um horário.')
        }
    }

    const handleResume = () => {
        setShowResumeBanner(false)
        onReturnToHorarios()
    }

    const handleDismissDraft = () => {
        sessionStorage.removeItem('scheduleFormDraft')
        sessionStorage.removeItem('scheduleFormStep')
        setShowResumeBanner(false)
    }

    const lists = { professores, disciplinas, cursos, salas, periodos }
    const allTabs = Object.entries(CONFIG).map(([key, c]) => ({ key, ...c }))
    const currentTab = allTabs.find(t => t.key === activeTab)
    const cfg = CONFIG[activeTab]
    const list = cfg ? lists[activeTab] : []

    return (
        <div>
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
                        <button onClick={handleResume}
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
                    {list.length === 0 ? (
                        <div className="text-center py-14 px-6">
                            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: cfg.colorBg }}>
                                <cfg.icon size={20} style={{ color: cfg.color }} />
                            </div>
                            <p className="text-sm font-bold text-gray-500">Nenhum(a) {cfg.singular.toLowerCase()} cadastrado(a)</p>
                            <p className="text-xs text-gray-400 mt-1 mb-5">Clique no botão abaixo para adicionar</p>
                            <button onClick={() => setModal({ tipo: activeTab, item: null })}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-all"
                                style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)` }}>
                                <Plus size={13} /> Adicionar {cfg.singular.toLowerCase()}
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                            {list.map(item => {
                                // Evita exibir o código secreto de disciplina no grid
                                let hiddenSigla = item.sigla || item.matriculaDisciplina || item.matricula || '';
                                if (typeof hiddenSigla === 'string' && hiddenSigla.includes('| META:')) {
                                    hiddenSigla = hiddenSigla.split('| META:')[0].trim();
                                }
                                const fallbackId = item.id || item.idProfessor || item.idDisciplina || item.idCurso || item.idSala || item.idPeriodo;

                                return (
                                    <div key={fallbackId}
                                        className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors group">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {item.cor ? (
                                                <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ background: item.cor }} />
                                            ) : (
                                                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.colorBg }}>
                                                    <cfg.icon size={13} style={{ color: cfg.color }} />
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate">
                                                    {item[cfg.labelKey] || item.semestre || 'Sem nome'}
                                                </p>
                                                {item.email    && <p className="text-xs text-gray-400 truncate">{item.email}</p>}
                                                {hiddenSigla   && <p className="text-xs text-gray-400">{hiddenSigla}</p>}
                                                {item.tipo     && <p className="text-xs text-gray-400 capitalize">{item.tipo}</p>}
                                                {item.descricao && activeTab === 'periodos' && <p className="text-xs text-gray-400 truncate">{item.descricao}</p>}
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4">
                                            <button onClick={() => setModal({ tipo: activeTab, item })}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110"
                                                style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                                                <Edit2 size={12} />
                                            </button>
                                            <button onClick={() => handleDelete(fallbackId)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110"
                                                style={{ background: '#fee2e2', color: '#dc2626' }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
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
                />
            )}

            <style>{`
                @keyframes fadeInDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
                @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
            `}</style>
        </div>
    )
}

export default DataManager