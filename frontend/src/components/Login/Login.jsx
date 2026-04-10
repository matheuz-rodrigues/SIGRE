import { useState, useEffect } from "react"
import {
    Shield, AlertCircle, User, Lock, Eye, EyeOff,
    GraduationCap, BookOpen, Mail, UserPlus, ArrowLeft, CheckCircle2, Phone, ChevronDown
} from 'lucide-react'
import logo from '../../assets/logouepa.png'

// ── Services ──────────────────────────────────────────────────────────────────
import { login, register, saveSession } from '../../services/AuthService'
import { getCursos } from '../../services/CouserService'

// ── Constantes ────────────────────────────────────────────────────────────────
// Admin usa credenciais locais (não passa pelo backend)
const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin456' }

const roleConfig = {
    admin:     { label: 'Administrador', icon: Shield,        color: '#1c1aa3' },
    aluno:     { label: 'Aluno',          icon: GraduationCap, color: '#7c3aed' },
    professor: { label: 'Professor',      icon: BookOpen,      color: '#1d4ed8' },
}

// ── Componente ────────────────────────────────────────────────────────────────
const Login = ({ onLoginSuccess }) => {
    const [formData, setFormData]     = useState({ username: '', password: '' })
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError]           = useState('')
    const [loading, setLoading]       = useState(false)
    const [activeRole, setActiveRole] = useState('admin')
    const [mode, setMode]             = useState('login') // 'login' | 'register'
    const [success, setSuccess]       = useState('')
    const [showRegisterPassword, setShowRegisterPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword]   = useState(false)

    const [cursosDisponiveis, setCursosDisponiveis] = useState([])

    const [registerData, setRegisterData] = useState({
        nome: '', email: '', telefone: '', username: '', password: '', confirmPassword: '',
        matricula: '', cursoId: '', siape: '', departamento: '',
    })

    // Carrega cursos ao entrar no modo registro
    useEffect(() => {
        if (mode === 'register') {
            const carregarCursos = async () => {
                try {
                    const data = await getCursos()
                    setCursosDisponiveis(data)
                } catch (err) {
                    console.error('Erro ao carregar cursos:', err)
                }
            }
            carregarCursos()
        }
    }, [mode])

    // ── Login ──────────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            // Admin: validação local (sem chamada ao backend)
            if (activeRole === 'admin') {
                if (
                    formData.username === ADMIN_CREDENTIALS.username &&
                    formData.password === ADMIN_CREDENTIALS.password
                ) {
                    localStorage.setItem('userRole',  'admin')
                    localStorage.setItem('userName',  formData.username)
                    localStorage.setItem('userEmail', formData.username)
                    onLoginSuccess('admin')
                } else {
                    setError('Usuário ou senha incorretos')
                }
                return
            }

            // Aluno / Professor: chama o backend
            const userData = await login(formData.username, formData.password)

            // Verifica se o papel bate com o selecionado
            if (userData.papel !== activeRole) {
                setError(
                    `Esta conta é do tipo ${roleConfig[userData.papel]?.label || userData.papel}, ` +
                    `não ${roleConfig[activeRole].label}`
                )
                return
            }

            // Salva sessão (token JWT + dados do usuário)
            saveSession(userData)
            onLoginSuccess(userData.papel)

        } catch (err) {
            // Trata mensagens de erro vindas do backend
            const msg = err.response?.data?.detail || err.response?.data?.message
            if (err.response?.status === 403) {
                setError('Sua conta ainda aguarda aprovação do administrador.')
            } else {
                setError(msg || 'Erro ao conectar. Verifique se o servidor está rodando.')
            }
        } finally {
            setLoading(false)
        }
    }

    // ── Cadastro ───────────────────────────────────────────────────────────────
    const formatTelefone = (value) => {
        const digits = value.replace(/\D/g, '').slice(0, 11)
        if (digits.length <= 2)  return `(${digits}`
        if (digits.length <= 6)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`
        if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
        return `(${digits.slice(0,2)}) ${digits.slice(2,3)} ${digits.slice(3,7)}-${digits.slice(7)}`
    }

    const handleRegisterChange = (e) => {
        const { name, value } = e.target
        const formatted = name === 'telefone' ? formatTelefone(value) : value
        setRegisterData({ ...registerData, [name]: formatted })
        setError('')
    }

    const validateRegister = () => {
        const { nome, email, username, password, confirmPassword, matricula, cursoId, departamento } = registerData

        if (!nome.trim())     return 'Informe seu nome completo'
        if (!username.trim()) return 'Informe seu nome de usuário'
        if (!email.trim())    return 'Informe seu e-mail'

        if (activeRole === 'aluno') {
            if (!email.toLowerCase().endsWith('@aluno.uepa.br'))
                return 'O e-mail deve ser do domínio @aluno.uepa.br'
            if (!matricula.trim()) return 'Informe sua matrícula'
            if (!cursoId)          return 'Selecione seu curso'
        }

        if (activeRole === 'professor') {
            if (!cursoId)              return 'Selecione o curso'
            if (!departamento.trim())  return 'Informe seu departamento'
        }

        if (password.length < 6)         return 'A senha deve ter no mínimo 6 caracteres'
        if (password !== confirmPassword) return 'As senhas não são iguais'

        return null
    }

    const handleRegisterSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const validationError = validateRegister()
        if (validationError) { setError(validationError); return }

        setLoading(true)
        try {
            // Monta payload conforme o que o backend espera
            // cursoId deve ser número inteiro — o backend salva em fk_curso
            const payload = {
                nome:         registerData.nome,
                email:        registerData.email,
                telefone:     registerData.telefone,
                username:     registerData.username,
                senha:        registerData.password,
                papel:        activeRole,
                cursoId:      registerData.cursoId ? Number(registerData.cursoId) : undefined,
                matricula:    registerData.matricula    || undefined,
                departamento: registerData.departamento || undefined,
            }

            await register(payload)

            setSuccess(
                `Cadastro de ${roleConfig[activeRole].label} realizado com sucesso! ` +
                `Aguarde a aprovação do administrador para acessar o sistema.`
            )
        } catch (err) {
            const msg = err.response?.data?.detail || err.response?.data?.message
            setError(msg || 'Erro ao cadastrar. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    const switchMode = (newMode) => {
        setMode(newMode); setError(''); setSuccess('')
        setFormData({ username: '', password: '' })
        setRegisterData({
            nome: '', email: '', telefone: '', username: '',
            password: '', confirmPassword: '', matricula: '',
            cursoId: '', siape: '', departamento: '',
        })
    }

    const switchRole = (role) => {
        setActiveRole(role); setError(''); setSuccess('')
        setFormData({ username: '', password: '' })
        setRegisterData({
            nome: '', email: '', telefone: '', username: '',
            password: '', confirmPassword: '', matricula: '',
            cursoId: '', siape: '', departamento: '',
        })
    }

    const cfg = roleConfig[activeRole]
    const CurrentIcon = cfg.icon
    const accentColor = cfg.color

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
            style={{ background: 'linear-gradient(135deg,#0f0c29 0%,#1c1aa3 50%,#150355 100%)' }}>

            {/* Orbs decorativos */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-20"
                    style={{ background: 'radial-gradient(circle, #7c3aed, transparent)', filter: 'blur(60px)' }} />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-20"
                    style={{ background: 'radial-gradient(circle, #1c1aa3, transparent)', filter: 'blur(60px)' }} />
            </div>

            <div className="relative z-10 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex"
                style={{ minHeight: '520px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

                {/* ── Painel esquerdo (formulário) ── */}
                <div className="flex-1 bg-white flex flex-col justify-center px-10 py-10 overflow-y-auto">

                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-6">
                        <img src={logo} alt="Logo UEPA" className="h-10 object-contain" />
                        <div>
                            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: '#1c1aa3' }}>SIGRE</p>
                            <p className="text-[10px] text-gray-400">Sistema Integrado de Gestão de Reservas Acadêmicas</p>
                        </div>
                    </div>

                    <h1 className="text-3xl font-black text-gray-900 mb-1">
                        {mode === 'register' ? 'Criar Conta' : 'Bem-vindo'}
                    </h1>
                    <p className="text-sm text-gray-500 mb-5">
                        {mode === 'register'
                            ? 'Preencha os dados abaixo para se cadastrar'
                            : 'Selecione seu perfil e faça login'}
                    </p>

                    {/* Seletor de papel */}
                    <div className="flex gap-2 mb-5">
                        {Object.entries(roleConfig).map(([key, c]) => {
                            const Icon = c.icon
                            const isActive = activeRole === key
                            if (mode === 'register' && key === 'admin') return null
                            return (
                                <button key={key} type="button" onClick={() => switchRole(key)}
                                    className="cursor-pointer flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-center"
                                    style={{
                                        borderColor:     isActive ? c.color : '#e5e7eb',
                                        backgroundColor: isActive ? c.color + '12' : 'transparent',
                                        color:           isActive ? c.color : '#6b7280',
                                        transform:       isActive ? 'translateY(-2px)' : 'none',
                                        boxShadow:       isActive ? `0 4px 16px ${c.color}30` : 'none',
                                    }}>
                                    <Icon size={18} />
                                    <span className="text-[11px] font-bold">{c.label}</span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Alerta de erro */}
                    {error && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl mb-4 text-sm">
                            <AlertCircle size={16} /><span>{error}</span>
                        </div>
                    )}

                    {/* Sucesso no cadastro */}
                    {success && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg,#1c1aa3,#7c3aed)' }}>
                                <CheckCircle2 size={32} className="text-white" />
                            </div>
                            <p className="text-sm text-gray-600 text-center leading-relaxed">{success}</p>
                            <button type="button" onClick={() => switchMode('login')}
                                className="flex items-center gap-2 text-sm font-semibold hover:underline"
                                style={{ color: accentColor }}>
                                <ArrowLeft size={15} /> Ir para o login
                            </button>
                        </div>
                    )}

                    {/* ── FORM LOGIN ── */}
                    {mode === 'login' && !success && (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="relative">
                                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="text" name="username" value={formData.username}
                                    onChange={e => { setFormData({...formData, username: e.target.value}); setError('') }}
                                    placeholder="Usuário" required autoComplete="username"
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                            </div>

                            <div className="relative">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type={showPassword ? 'text' : 'password'} name="password"
                                    value={formData.password}
                                    onChange={e => { setFormData({...formData, password: e.target.value}); setError('') }}
                                    placeholder="Senha" required autoComplete="current-password"
                                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                                <button type="button" onClick={() => setShowPassword(p => !p)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            <button type="submit" disabled={loading}
                                className="cursor-pointer w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all disabled:opacity-60"
                                style={{ background: `linear-gradient(135deg, ${accentColor}, #7c3aed)`, boxShadow: `0 8px 24px ${accentColor}50` }}>
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                        </svg>
                                        Entrando...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <CurrentIcon size={16} />
                                        Entrar como {cfg.label}
                                    </span>
                                )}
                            </button>

                            {activeRole !== 'admin' && (
                                <p className="text-xs text-center text-gray-500">
                                    Não tem conta?{' '}
                                    <button type="button" onClick={() => switchMode('register')}
                                        className="font-bold hover:underline" style={{ color: accentColor }}>
                                        Cadastre-se
                                    </button>
                                </p>
                            )}

                            {activeRole === 'admin' && (
                                <p className="mt-2 text-[11px] text-gray-400 text-center">
                                    Teste — admin: <span className="font-mono text-gray-500">admin</span>{' '}
                                    / <span className="font-mono text-gray-500">admin456</span>
                                </p>
                            )}
                        </form>
                    )}

                    {/* ── FORM CADASTRO ── */}
                    {mode === 'register' && !success && (
                        <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">

                            {/* Nome */}
                            <div className="relative">
                                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="text" name="nome" value={registerData.nome}
                                    onChange={handleRegisterChange} placeholder="Nome completo" required
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                            </div>

                            {/* Email */}
                            <div className="relative">
                                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="email" name="email" value={registerData.email}
                                    onChange={handleRegisterChange}
                                    placeholder={activeRole === 'aluno' ? 'seunome@aluno.uepa.br' : 'seunome@uepa.br'}
                                    required
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                            </div>

                            {/* Aviso de domínio */}
                            <p className="text-[11px] text-purple-600 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 -mt-1">
                                {activeRole === 'aluno'
                                    ? <>⚠️ Apenas e-mails <strong>@aluno.uepa.br</strong> são aceitos para alunos.</>
                                    : <>⚠️ Apenas e-mails <strong>@uepa.br</strong> são aceitos para professores.</>}
                            </p>

                            {/* Telefone */}
                            <div className="relative">
                                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="tel" name="telefone" value={registerData.telefone}
                                    onChange={handleRegisterChange} placeholder="(91) 9 XXXX-XXXX" required
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                            </div>

                            {/* Campos específicos — Aluno */}
                            {activeRole === 'aluno' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" name="matricula" value={registerData.matricula}
                                        onChange={handleRegisterChange} placeholder="Matrícula" required
                                        className="px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                        onFocus={e => e.target.style.borderColor = accentColor}
                                        onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />

                                    {/* cursoId — value é o ID numérico do curso */}
                                    <div className="relative">
                                        <select name="cursoId" value={registerData.cursoId}
                                            onChange={handleRegisterChange} required
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all appearance-none">
                                            <option value="">Selecione o Curso</option>
                                            {cursosDisponiveis.map(c => (
                                                <option key={c.id || c.idCurso} value={c.id || c.idCurso}>
                                                    {c.nome}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                    </div>
                                </div>
                            )}

                            {/* Campos específicos — Professor */}
                            {activeRole === 'professor' && (
                                <div className="grid grid-cols-2 gap-3">
                                    {/* cursoId — value é o ID numérico do curso */}
                                    <div className="relative">
                                        <select name="cursoId" value={registerData.cursoId}
                                            onChange={handleRegisterChange} required
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all appearance-none"
                                            onFocus={e => e.target.style.borderColor = accentColor}
                                            onBlur={e  => e.target.style.borderColor = '#e5e7eb'}>
                                            <option value="">Selecione o Curso</option>
                                            {cursosDisponiveis.map(c => (
                                                <option key={c.id || c.idCurso} value={c.id || c.idCurso}>
                                                    {c.nome}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                    </div>

                                    <input type="text" name="departamento" value={registerData.departamento}
                                        onChange={handleRegisterChange} placeholder="Departamento" required
                                        className="px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                        onFocus={e => e.target.style.borderColor = accentColor}
                                        onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                                </div>
                            )}

                            {/* Username */}
                            <div className="relative">
                                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="text" name="username" value={registerData.username}
                                    onChange={handleRegisterChange} placeholder="Nome de usuário" required
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                            </div>

                            {/* Senha */}
                            <div className="relative">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type={showRegisterPassword ? 'text' : 'password'} name="password"
                                    value={registerData.password} onChange={handleRegisterChange}
                                    placeholder="Senha (mín. 6 caracteres)" required
                                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                                <button type="button" onClick={() => setShowRegisterPassword(p => !p)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    {showRegisterPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {/* Confirmar senha */}
                            <div className="relative">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword"
                                    value={registerData.confirmPassword} onChange={handleRegisterChange}
                                    placeholder="Confirmar senha" required
                                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all"
                                    onFocus={e => e.target.style.borderColor = accentColor}
                                    onBlur={e  => e.target.style.borderColor = '#e5e7eb'} />
                                <button type="button" onClick={() => setShowConfirmPassword(p => !p)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            <button type="submit" disabled={loading}
                                className="cursor-pointer w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all mt-1 disabled:opacity-60"
                                style={{ background: `linear-gradient(135deg, ${accentColor}, #7c3aed)`, boxShadow: `0 8px 24px ${accentColor}50` }}>
                                {loading ? 'Cadastrando...' : `Cadastrar como ${cfg.label}`}
                            </button>

                            <button type="button" onClick={() => switchMode('login')}
                                className="cursor-pointer flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mt-1">
                                <ArrowLeft size={13} /> Voltar ao login
                            </button>
                        </form>
                    )}
                </div>

                {/* ── Painel direito (decorativo) ── */}
                <div className="hidden md:flex w-80 flex-col items-center justify-center px-10 py-10 relative overflow-hidden"
                    style={{ background: 'linear-gradient(160deg, #1c1aa3 0%, #150355 60%, #7c3aed 100%)' }}>
                    <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
                        style={{ background: 'white', transform: 'translate(30%,-30%)' }} />
                    <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10"
                        style={{ background: 'white', transform: 'translate(-30%,30%)' }} />

                    <div className="relative z-10 text-center">
                        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                            {mode === 'register' ? <UserPlus size={36} className="text-white" /> : <CurrentIcon size={36} className="text-white" />}
                        </div>

                        <h2 className="text-2xl font-black text-white mb-3 leading-tight">
                            {mode === 'register'
                                ? `Novo ${cfg.label}`
                                : activeRole === 'admin' ? 'Painel Admin' : `Olá, ${cfg.label}!`}
                        </h2>

                        <p className="text-sm text-blue-200 leading-relaxed mb-8">
                            Sistema Integrado de Gestão de Reservas Acadêmicas — Campus XXII.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Login