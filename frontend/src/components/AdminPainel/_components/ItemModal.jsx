import { useState } from 'react'
import { X, Check, Plus } from 'lucide-react'
import { CONFIG } from '../_config/DataManagerConfig'

const inp = "w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-800 focus:ring-2 focus:ring-indigo-400 focus:outline-none focus:border-indigo-400 transition-all text-sm"
const lbl = "block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5"

const ItemModal = ({ tipo, item, lists, onSave, onClose, onAddSubItem }) => {
    const cfg = CONFIG[tipo]
    const isEdit = !!item
    const initial = {}

    // Preenche os dados do modal
    cfg.fields.forEach(f => {
        let val = item?.[f.front] || item?.[f.back] || ''

        if (f.type === 'color' && !val) val = '#00FFFF'

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
    
    // Estado para criação inline
    const [inlineAdd, setInlineAdd] = useState({ field: null, values: { nome: '', sigla: '' } })

    const set = (k, v) => {
        setData(d => ({ ...d, [k]: v }))
        if (errors[k]) setErrors(prev => {
            const copy = { ...prev }
            delete copy[k]
            return copy
        })
    }

    const handleInlineSave = async (field) => {
        if (!inlineAdd.values.nome.trim()) return
        if (field.listName === 'cursos' && !inlineAdd.values.sigla.trim()) return
        
        try {
            const dataToSave = field.listName === 'cursos' 
                ? { nome: inlineAdd.values.nome, sigla: inlineAdd.values.sigla }
                : inlineAdd.values.nome

            const newId = await onAddSubItem(field.listName, dataToSave)
            if (newId) {
                set(field.front, String(newId))
                setInlineAdd({ field: null, values: { nome: '', sigla: '' } })
            }
        } catch (err) {
            console.error("Erro ao criar item inline:", err)
        }
    }

    const handleSubmit = () => {
        const payload = {}
        cfg.fields.forEach(f => {
            payload[f.back] = data[f.front] ?? ''
        })

        if (cfg.validationSchema) {
            try {
                cfg.validationSchema.parse(payload)
                setErrors({})
            } catch (err) {
                const issues = err.issues || err.errors
                if (issues) {
                    const fieldErrors = {}
                    issues.forEach(e => {
                        fieldErrors[e.path[0]] = e.message
                    })
                    setErrors(fieldErrors)
                    return
                }
                console.error("Erro de validação desconhecido:", err)
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
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <select className={`${inp} ${error ? 'border-red-500 ring-red-100' : ''}`} value={data[field.front]} onChange={e => set(field.front, e.target.value)}>
                                                <option value="">Selecione...</option>
                                                {(lists[field.listName] || []).map(o => {
                                                    const id = o.id || o.idCurso || o.idProfessor
                                                    const lblKey = field.listLabelKey || 'nomeCurso'
                                                    const label = o[lblKey] || o.nomeCurso || o.siglaCurso || o.nome || String(id)
                                                    return <option key={id} value={String(id)}>{label}</option>
                                                })}
                                            </select>
                                            {(field.listName === 'tiposSala' || field.listName === 'cursos') && !inlineAdd.field && (
                                                <button 
                                                    type="button"
                                                    onClick={() => setInlineAdd({ field: field.front, values: { nome: '', sigla: '' } })}
                                                    className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-all"
                                                    title={`Criar novo(a) ${field.label.toLowerCase()}`}
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {inlineAdd.field === field.front && (
                                            <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <input 
                                                    autoFocus
                                                    className={`${inp} py-1.5`} 
                                                    placeholder={field.listName === 'cursos' ? 'Nome do curso...' : `Nome do novo ${field.label.toLowerCase()}...`}
                                                    value={inlineAdd.values.nome}
                                                    onChange={e => setInlineAdd(prev => ({ ...prev, values: { ...prev.values, nome: e.target.value } }))}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault()
                                                            if (field.listName !== 'cursos') handleInlineSave(field)
                                                        }
                                                        if (e.key === 'Escape') setInlineAdd({ field: null, values: { nome: '', sigla: '' } })
                                                    }}
                                                />
                                                {field.listName === 'cursos' && (
                                                    <input 
                                                        className={`${inp} py-1.5`} 
                                                        placeholder="Sigla (ex: BES)..."
                                                        value={inlineAdd.values.sigla}
                                                        onChange={e => setInlineAdd(prev => ({ ...prev, values: { ...prev.values, sigla: e.target.value } }))}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault()
                                                                handleInlineSave(field)
                                                            }
                                                            if (e.key === 'Escape') setInlineAdd({ field: null, values: { nome: '', sigla: '' } })
                                                        }}
                                                    />
                                                )}
                                                <div className="flex gap-2">
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleInlineSave(field)}
                                                        className="flex-1 h-9 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all font-bold text-[10px] uppercase tracking-wider gap-2"
                                                    >
                                                        <Check size={14} /> Salvar {field.listName === 'cursos' ? 'Curso' : 'Tipo'}
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => setInlineAdd({ field: null, values: { nome: '', sigla: '' } })}
                                                        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : field.type === 'color' ? (
                                    <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 bg-gray-50">
                                        <input type="color" className="h-9 w-14 cursor-pointer rounded-lg border-0 bg-transparent"
                                            value={data[field.front] || '#00FFFF'} onChange={e => set(field.front, e.target.value)} />
                                        <span className="text-sm text-gray-400 font-mono">{data[field.front] || '#00FFFF'}</span>
                                        <div className="w-6 h-6 rounded-lg ml-auto border border-gray-200 shadow-sm"
                                            style={{ background: data[field.front] || '#00FFFF' }} />
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
        </div>
    )
}

export default ItemModal
