import { useState, useEffect } from 'react'
import { useSchedule } from '../Schedule/ScheduleContext'
import { Edit2, Trash2, X, Plus, Check, BookOpen, Users, Building2, GraduationCap, Calendar, ArrowLeft, Layers } from 'lucide-react'
import api from '../../services/api'
import { getRoomTypes } from '../../services/RoomTypeService'
import { z } from 'zod'

const inp = "w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-800 focus:ring-2 focus:ring-indigo-400 focus:outline-none focus:border-indigo-400 transition-all text-sm"
const lbl = "block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5"

const CONFIG = {
    professores: {
        title: 'Professores', singular: 'Professor', endpoint: 'professors', labelKey: 'nomeProf',
        icon: Users, color: '#1d4ed8', colorBg: '#dbeafe',
        fields: [
            { front: 'nome',      back: 'nomeProf',      label: 'Nome completo', type: 'text',  ph: 'Ex: João Silva' },
            { front: 'email',     back: 'emailProf',     label: 'E-mail',        type: 'email', ph: 'joao@uepa.br' },
            { front: 'matricula', back: 'matriculaProf', label: 'Matrícula / SIAPE (opcional)', type: 'text', ph: 'Ex: 123456' },
        ],
        validationSchema: z.object({
            nomeProf: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
            emailProf: z.string().email('E-mail inválido'),
            matriculaProf: z.string().optional().or(z.literal('')),
        })
    },
    disciplinas: {
        title: 'Disciplinas', singular: 'Disciplina', endpoint: 'disciplines', labelKey: 'nomeDisciplina',
        icon: BookOpen, color: '#7c3aed', colorBg: '#ede9fe',
        fields: [
            { front: 'nome',        back: 'nomeDisciplina',      label: 'Nome da disciplina', type: 'text', ph: 'Ex: Cálculo I' },
            { front: 'matricula',   back: 'matriculaDisciplina', label: 'Código/Sigla',       type: 'text', ph: 'Ex: MAT001' },
            { front: 'cursoId',     back: 'cursoId',             label: 'Curso (opcional)',   type: 'dynamic-select', listName: 'cursos' },
        ],
        validationSchema: z.object({
            nomeDisciplina: z.string().min(2, 'O nome da disciplina é obrigatório'),
            matriculaDisciplina: z.string().min(2, 'O código/sigla é obrigatório'),
            cursoId: z.coerce.number().optional().nullable(),
        })
    },
    cursos: {
        title: 'Cursos', singular: 'Curso', endpoint: 'courses', labelKey: 'nomeCurso',
        icon: GraduationCap, color: '#0891b2', colorBg: '#cffafe',
        fields: [
            { front: 'nome',  back: 'nomeCurso',  label: 'Nome do curso', type: 'text',  ph: 'Ex: Engenharia de Software' },
            { front: 'sigla', back: 'siglaCurso', label: 'Sigla',         type: 'text',  ph: 'Ex: BES' },
            { front: 'cor',   back: 'corCurso',   label: 'Cor de identificação', type: 'color' },
        ],
        validationSchema: z.object({
            nomeCurso: z.string().min(3, 'O nome do curso é obrigatório'),
            siglaCurso: z.string().min(2, 'A sigla é obrigatória'),
            corCurso: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor inválida'),
        })
    },
    tiposSala: {
        title: 'Tipos de sala', singular: 'Tipo de sala', endpoint: 'room-types', labelKey: 'nome',
        icon: Layers, color: '#475569', colorBg: '#f1f5f9',
        fields: [
            { front: 'nome', back: 'nome', label: 'Nome do tipo', type: 'text', ph: 'Ex: Laboratório' },
        ],
        validationSchema: z.object({
            nome: z.string().min(2, 'O nome do tipo é obrigatório'),
        })
    },
    salas: {
        title: 'Salas', singular: 'Sala', endpoint: 'rooms', labelKey: 'nomeSala',
        icon: Building2, color: '#059669', colorBg: '#d1fae5',
        fields: [
            { front: 'nome', back: 'nomeSala', label: 'Nome da sala', type: 'text', ph: 'Ex: 101' },
            { front: 'tipo', back: 'tipoSalaId', label: 'Tipo de sala', type: 'dynamic-select',
              listName: 'tiposSala', listLabelKey: 'nome' },
            { front: 'capacidade', back: 'capacidade', label: 'Capacidade', type: 'number', ph: 'Ex: 40' }
        ],
        validationSchema: z.object({
            nomeSala: z.string().min(1, 'O nome da sala é obrigatório'),
            tipoSalaId: z.coerce.number().int().min(1, 'O tipo de sala é obrigatório'),
            capacidade: z.coerce.number().int().min(1, 'A capacidade deve ser maior que zero'),
        })
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
        validationSchema: z.object({
            semestre: z.string().min(4, 'O semestre é obrigatório'),
            descricao: z.string().optional(),
            dataInicio: z.string().min(1, 'Data de início é obrigatória'),
            dataFim: z.string().min(1, 'Data de fim é obrigatória'),
        })
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
        
        // Se for novo curso/sala e tipo color, define um padrão
        if (!item && f.type === 'color') val = '#3b82f6'

        if (tipo === 'disciplinas' && item?.matriculaDisciplina?.includes('| META:') && f.front === 'matricula') {
            val = item.matriculaDisciplina.split('| META:')[0].trim()
        }
        if (tipo === 'disciplinas' && f.front === 'cursoId') {
            val = item?.cursoId ?? item?.fk_curso ?? ''
            if (!val && item?.matriculaDisciplina?.includes('| META:')) {
                try {
                    val = JSON.parse(item.matriculaDisciplina.split('| META:')[1]).cId || ''
                } catch {
                    /* registro legado */
                }
            }
        }
        initial[f.front] = val
    })

    const [data, setData] = useState(initial)
    const [errors, setErrors] = useState({})
    
    const set = (k, v) => {
        setData(d => ({ ...d, [k]: v }))
        if (errors[k]) setErrors(prev => {
            const copy = { ...prev }
            delete copy[k]
            return copy
        })
    }

    const handleSubmit = () => {
        const payload = {}
        cfg.fields.forEach(f => {
            let val = data[f.front]
            // Fallback para cor se estiver vazio no estado
            if (f.type === 'color' && (!val || val === '')) val = '#3b82f6'
            
            if (val !== undefined && val !== '') payload[f.back] = val
        })

        if (cfg.validationSchema) {
            try {
                cfg.validationSchema.parse(payload)
                setErrors({})
            } catch (err) {
                console.warn("Validation failed for", tipo, err)
                if (err instanceof z.ZodError) {
                    const fieldErrors = {}
                    if (Array.isArray(err.errors)) {
                        err.errors.forEach(e => {
                            fieldErrors[e.path[0]] = e.message
                        })
                    }
                    setErrors(fieldErrors)
                    return
                }
            }
        }

        if (tipo === 'disciplinas') {
            if (payload.cursoId === '' || payload.cursoId === undefined) {
                delete payload.cursoId
            } else {
                payload.cursoId = Number(payload.cursoId)
            }
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
                    {cfg.fields.map(field => {
                        const error = errors[field.back]
                        return (
                            <div key={field.front}>
                                <label className={lbl}>{field.label}</label>
                                {field.type === 'select' ? (
                                    <select className={`${inp} ${error ? 'border-red-500 ring-red-100' : ''}`} value={data[field.front]} onChange={e => set(field.front, e.target.value)}>
                                        <option value="">Selecione...</option>
                                        {field.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                    </select>
                                ) : field.type === 'dynamic-select' ? (
                                    <select className={`${inp} ${error ? 'border-red-500 ring-red-100' : ''}`} value={data[field.front]} onChange={e => set(field.front, e.target.value)}>
                                        <option value="">Selecione...</option>
                                        {(lists[field.listName] || []).map(o => {
                                            const id = o.id || o.idCurso || o.idProfessor
                                            const lblKey = field.listLabelKey || 'nomeCurso'
                                            const label = o[lblKey] || o.nomeCurso || o.siglaCurso || o.nome || String(id)
                                            return <option key={id} value={String(id)}>{label}</option>
                                        })}
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
                                    <input type={field.type} className={`${inp} ${error ? 'border-red-500 ring-red-100' : ''}`} placeholder={field.ph || ''}
                                        value={data[field.front]} onChange={e => set(field.front, e.target.value)} />
                                )}
                                {error && <p className="text-[10px] text-red-500 font-bold mt-1 ml-1">{error}</p>}
                            </div>
                        )
                    })}
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
    const [tiposSala, setTiposSala] = useState([])

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

    useEffect(() => {
        getRoomTypes().then(setTiposSala).catch(() => setTiposSala([]))
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
            if (cfg.endpoint === 'room-types') {
                getRoomTypes().then(setTiposSala).catch(() => setTiposSala([]))
            }
            setModal(null)
            if (hasDraft) setShowResumeBanner(true)
        } catch (err) {
            console.error("Erro ao salvar:", err)
            const detail = err.response?.data?.detail
            const message = err.response?.data?.message
            
            let errorMsg = 'Erro ao salvar. Verifique os dados.'
            
            if (typeof detail === 'string') {
                errorMsg = detail
            } else if (Array.isArray(detail)) {
                // Formata erros de validação do FastAPI
                errorMsg = detail.map(d => {
                    const field = d.loc ? d.loc[d.loc.length - 1] : ''
                    return (field ? `${field}: ` : '') + d.msg
                }).join('\n')
            } else if (message) {
                errorMsg = message
            }
            
            alert(errorMsg)
        }
    }

    const handleDelete = async (id) => {
        const cfg = CONFIG[activeTab]
        if (!window.confirm('Tem certeza que deseja excluir?')) return
        try {
            await api.delete(`/${cfg.endpoint}/${id}`)
            recarregarDados()
            if (cfg.endpoint === 'room-types') {
                getRoomTypes().then(setTiposSala).catch(() => setTiposSala([]))
            }
        } catch (err) {
            console.error("Erro ao excluir:", err)
            const detail = err.response?.data?.detail
            const message = err.response?.data?.message
            
            let errorMsg = 'Erro ao excluir. Este item pode estar em uso.'
            if (typeof detail === 'string') errorMsg = detail
            else if (message) errorMsg = message
            
            alert(errorMsg)
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

    const lists = { professores, disciplinas, cursos, salas, periodos, tiposSala }
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
                                // Disciplinas: código limpo (sem sufixo legado embutido no campo)
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