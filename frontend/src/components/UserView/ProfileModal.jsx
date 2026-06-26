import { useState, useEffect } from 'react'
import {
    X, User, Phone, BookOpen, GraduationCap, Lock,
    Eye, EyeOff, CheckCircle2, Loader2, AlertCircle,
    Pencil, ShieldCheck,
} from 'lucide-react'
import api from '../../services/api'
import { fetchCurrentUser, applyUserProfile } from '../../services/AuthService'

const cls = {
    input: `w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 text-sm
            placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30
            focus:border-blue-400 transition-all duration-200`,
    readonly: `w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-100/80
               text-gray-600 text-sm select-none cursor-default`,
    label: 'block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5',
}

const PAPEL_CFG = {
    aluno: { label: 'Aluno', Icon: GraduationCap, color: '#7c3aed', bg: '#ede9fe' },
    professor: { label: 'Professor', Icon: BookOpen, color: '#1d4ed8', bg: '#dbeafe' },
    tecnico_adm: { label: 'Técnico Adm.', Icon: BookOpen, color: '#15803d', bg: '#dcfce7' },
    admin: { label: 'Admin', Icon: ShieldCheck, color: '#065f46', bg: '#d1fae5' },
}

const SENHA_FIELDS = [
    { field: 'senhaAtual', label: 'Senha atual *', key: 'atual' },
    { field: 'novaSenha', label: 'Nova senha *', key: 'nova' },
    { field: 'confirmar', label: 'Confirmar nova senha *', key: 'conf' },
]

// Componente principal 
const ProfileModal = ({ userRole, onClose }) => {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [tab, setTab] = useState('info')
    const [success, setSuccess] = useState('')
    const [error, setError] = useState('')
    const [showPwd, setShowPwd] = useState({ atual: false, nova: false, conf: false })
    const [perfil, setPerfil] = useState(null)

    const [form, setForm] = useState({ nome: '', telefone: '' })
    const [senhaForm, setSenhaForm] = useState({ senhaAtual: '', novaSenha: '', confirmar: '' })

    // Carrega perfil via token
    useEffect(() => {
        let active = true
            ; (async () => {
                try {
                    const me = await fetchCurrentUser()
                    if (!active) return
                    applyUserProfile(me)
                    setPerfil(me)
                    setForm({ nome: me.nome || '', telefone: me.telefone || '' })
                } catch {
                    if (active) setError('Não foi possível carregar seu perfil.')
                } finally {
                    if (active) setLoading(false)
                }
            })()
        return () => { active = false }
    }, [])

    const clearFeedback = () => { setError(''); setSuccess('') }
    const updateField = (f, v) => { setForm(p => ({ ...p, [f]: v })); clearFeedback() }
    const updateSenha = (f, v) => { setSenhaForm(p => ({ ...p, [f]: v })); clearFeedback() }
    const switchTab = (t) => { setTab(t); clearFeedback() }
    const togglePwd = (k) => setShowPwd(p => ({ ...p, [k]: !p[k] }))

    // Salva nome / telefone 
    const handleSaveInfo = async (e) => {
        e.preventDefault()
        const nome = form.nome.trim()
        if (!nome) { setError('Nome não pode ficar em branco.'); return }
        if (!perfil?.id) { setError('Sessão inválida. Faça login novamente.'); return }

        setSaving(true)
        try {
            await api.patch(`/users/${perfil.id}`, {
                nome,
                telefone: form.telefone.trim() || null,
            })
            localStorage.setItem('userName', nome)
            setPerfil(p => ({ ...p, nome, telefone: form.telefone.trim() }))
            setSuccess('Perfil atualizado com sucesso!')
        } catch (err) {
            const d = err.response?.data?.detail
            if (Array.isArray(d)) {
                setError(d[0].msg.replace('Value error, ', ''))
            } else if (typeof d === 'string') {
                setError(d)
            } else {
                setError('Erro ao salvar as alterações.')
            }
        } finally {
            setSaving(false)
        }
    }

    // Altera senha 
    const handleSaveSenha = async (e) => {
        e.preventDefault()
        const { senhaAtual, novaSenha, confirmar } = senhaForm

        if (!senhaAtual) { setError('Informe a senha atual.'); return }

        // 1. Validação de Complexidade
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/
        if (!passwordRegex.test(novaSenha)) {
            setError('A nova senha deve ter mín. 12 caracteres, com maiúsculas, minúsculas, números e símbolos.')
            return
        }

        // 2. Validação de Termos Proibidos
        const proibidos = ["senha", "password", "12345", "qwerty", "admin", "teste", "sigra", "uepa", "aluno", "prof"]
        if (proibidos.some(termo => novaSenha.toLowerCase().includes(termo))) {
            setError('A nova senha contém termos fáceis de adivinhar.')
            return
        }

        if (novaSenha !== confirmar) { setError('As senhas não coincidem.'); return }
        if (!perfil?.id) { setError('Sessão inválida. Faça login novamente.'); return }

        setSaving(true)
        try {
            await api.patch(`/users/${perfil.id}`, { senha_atual: senhaAtual, senha: novaSenha })
            setSenhaForm({ senhaAtual: '', novaSenha: '', confirmar: '' })
            setSuccess('Senha alterada com sucesso!')
        } catch (err) {
            const d = err.response?.data?.detail
            if (Array.isArray(d)) {
                setError(d[0].msg.replace('Value error, ', ''))
            } else if (typeof d === 'string') {
                setError(d)
            } else {
                setError('Senha atual incorreta ou erro ao alterar.')
            }
        } finally {
            setSaving(false)
        }
    }

    // Derivados
    const papel = perfil?.papel || userRole || 'aluno'
    const cfg = PAPEL_CFG[papel] ?? PAPEL_CFG.aluno
    const PapelIcon = cfg.Icon

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
                style={{ animation: 'fadeInUp 0.25s ease' }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-8 py-5 shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                            <User size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white leading-none">Meu Perfil</h2>
                            <p className="text-blue-200 text-xs mt-0.5">Visualize e edite suas informações</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Avatar */}
                {!loading && perfil && (
                    <div className="flex items-center gap-4 px-8 pt-6 pb-4 shrink-0 border-b border-gray-100">
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                            style={{ background: cfg.bg }}
                        >
                            <PapelIcon size={26} style={{ color: cfg.color }} />
                        </div>
                        <div>
                            <p className="font-black text-gray-900 text-base leading-tight">{perfil.nome}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{perfil.email}</p>
                            <span
                                className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: cfg.bg, color: cfg.color }}
                            >
                                {cfg.label}
                            </span>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex shrink-0 border-b border-gray-100 px-8">
                    {[
                        { key: 'info', label: 'Informações', Icon: User },
                        { key: 'senha', label: 'Alterar Senha', Icon: Lock },
                    ].map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            onClick={() => switchTab(key)}
                            className="flex items-center gap-2 px-4 py-3.5 text-sm font-semibold relative transition-colors"
                            style={{ color: tab === key ? '#1c1aa3' : '#9ca3af' }}
                        >
                            <Icon size={14} />
                            {label}
                            {tab === key && (
                                <span
                                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                                    style={{ background: 'linear-gradient(90deg, #1c1aa3, #7c3aed)' }}
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Corpo */}
                <div className="overflow-y-auto flex-1 px-8 py-6">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
                            <Loader2 size={18} className="animate-spin" /> Carregando perfil…
                        </div>
                    ) : (
                        <>
                            {/* Tab: Informações */}
                            {tab === 'info' && (
                                <form id="profile-info-form" onSubmit={handleSaveInfo} className="space-y-5">
                                    <div className="space-y-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                            Dados institucionais (somente leitura)
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {perfil?.username && (
                                                <div className="sm:col-span-2">
                                                    <label className={cls.label}>Username</label>
                                                    <div className={cls.readonly}>@{perfil.username}</div>
                                                </div>
                                            )}
                                            <div className="sm:col-span-2">
                                                <label className={cls.label}>E-mail</label>
                                                <div className={cls.readonly}>{perfil?.email || '—'}</div>
                                            </div>
                                            {perfil?.curso && (
                                                <div>
                                                    <label className={cls.label}>Curso</label>
                                                    <div className={cls.readonly}>{perfil.curso}</div>
                                                </div>
                                            )}
                                            {perfil?.departamento && (
                                                <div>
                                                    <label className={cls.label}>Departamento</label>
                                                    <div className={cls.readonly}>{perfil.departamento}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Pencil size={11} /> Dados editáveis
                                        </p>
                                        <div>
                                            <label className={cls.label}>Nome completo *</label>
                                            <div className="relative">
                                                <User size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    className={`${cls.input} pl-10`}
                                                    type="text"
                                                    required
                                                    maxLength={150}
                                                    placeholder="Seu nome completo"
                                                    value={form.nome}
                                                    onChange={e => updateField('nome', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={cls.label}>Telefone</label>
                                            <div className="relative">
                                                <Phone size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    className={`${cls.input} pl-10`}
                                                    type="tel"
                                                    maxLength={20}
                                                    placeholder="(91) 99999-9999"
                                                    value={form.telefone}
                                                    onChange={e => updateField('telefone', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {/* Tab: Senha */}
                            {tab === 'senha' && (
                                <form id="profile-senha-form" onSubmit={handleSaveSenha} className="space-y-4">
                                    <p className="text-xs text-gray-500">
                                        A nova senha deve ter no mínimo 12 caracteres, com maiúsculas, minúsculas, números e símbolos.
                                    </p>
                                    {SENHA_FIELDS.map(({ field, label, key }) => (
                                        <div key={field}>
                                            <label className={cls.label}>{label}</label>
                                            <div className="relative">
                                                <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    className={`${cls.input} pl-10 pr-10`}
                                                    type={showPwd[key] ? 'text' : 'password'}
                                                    required
                                                    maxLength={128}
                                                    autoComplete={field === 'senhaAtual' ? 'current-password' : 'new-password'}
                                                    value={senhaForm[field]}
                                                    onChange={e => updateSenha(field, e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => togglePwd(key)}
                                                    aria-label={showPwd[key] ? 'Ocultar senha' : 'Mostrar senha'}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                >
                                                    {showPwd[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </form>
                            )}

                            {/* Feedback */}
                            {error && (
                                <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                                    <AlertCircle size={15} className="shrink-0" /> {error}
                                </div>
                            )}
                            {success && (
                                <div className="mt-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                                    <CheckCircle2 size={15} className="shrink-0" /> {success}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!loading && (
                    <div className="px-8 py-4 border-t border-gray-100 bg-gray-50/80 flex justify-between items-center gap-4 shrink-0">
                        <p className="text-xs text-gray-400">* Campos obrigatórios</p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-100 transition-colors"
                            >
                                Fechar
                            </button>
                            <button
                                type="submit"
                                form={tab === 'info' ? 'profile-info-form' : 'profile-senha-form'}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                                style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 6px 20px rgba(28,26,163,0.35)' }}
                            >
                                {saving
                                    ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                                    : <><CheckCircle2 size={15} /> Salvar alterações</>
                                }
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
    )
}

export default ProfileModal