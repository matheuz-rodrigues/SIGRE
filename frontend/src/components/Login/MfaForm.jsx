import { useState, useEffect } from "react"
import { AlertCircle, ShieldCheck, ArrowLeft, Mail, RotateCw } from 'lucide-react'

// Mesmo intervalo mínimo entre envios do back-end (MFA_RESEND_COOLDOWN_SECONDS)
const RESEND_COOLDOWN_SECONDS = 60

const retryAfterSeconds = (err, fallback) => {
    const seconds = Number(err.response?.headers?.['retry-after'])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback
}

/**
 * Verificação em duas etapas por código enviado ao e-mail da conta.
 * O contrato com o backend (endpoints/campos) fica isolado em AuthService.js.
 */
const MfaForm = ({ emailHint, onVerify, onResend, onBack, accentColor }) => {
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setInterval(() => setCooldown(prev => (prev <= 1 ? 0 : prev - 1)), 1000)
        return () => clearInterval(timer)
    }, [cooldown])

    const handleCodeChange = (e) => {
        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6)
        setCode(digitsOnly)
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (code.length !== 6) return
        setError('')
        setInfo('')
        setLoading(true)
        try {
            await onVerify(code)
        } catch (err) {
            if (err.response?.status === 429) {
                setError(`Muitas tentativas. Tente novamente em ${retryAfterSeconds(err, 30)}s.`)
            } else {
                const detail = err.response?.data?.detail || err.response?.data?.message
                setError(typeof detail === 'string' && detail !== 'Código inválido'
                    ? detail
                    : 'Código inválido ou expirado. Confira o e-mail ou peça um novo código.')
            }
            setCode('')
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        setError('')
        setInfo('')
        setResending(true)
        try {
            await onResend()
            setInfo('Enviamos um novo código. Use sempre o e-mail mais recente.')
            setCode('')
            setCooldown(RESEND_COOLDOWN_SECONDS)
        } catch (err) {
            if (err.response?.status === 429) {
                setCooldown(retryAfterSeconds(err, RESEND_COOLDOWN_SECONDS))
            } else {
                const detail = err.response?.data?.detail
                setError(typeof detail === 'string' ? detail : 'Não foi possível reenviar o código.')
            }
        } finally {
            setResending(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-start gap-3 -mt-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <Mail size={18} className="mt-0.5 shrink-0" style={{ color: accentColor }} />
                <p className="text-sm text-gray-600">
                    Enviamos um código de 6 números para o e-mail{' '}
                    <strong className="text-gray-800">{emailHint || 'cadastrado na sua conta'}</strong>.
                    Abra seu e-mail e digite o código abaixo. Ele vale por 10 minutos.
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-sm">
                    <AlertCircle size={16} /><span>{error}</span>
                </div>
            )}
            {info && !error && (
                <div className="text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-xl text-sm">
                    {info}
                </div>
            )}

            <div className="relative">
                <ShieldCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    name="mfaCode"
                    value={code}
                    onChange={handleCodeChange}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    required
                    aria-label="Código recebido por e-mail"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm bg-gray-50 focus:outline-none transition-all tracking-[0.4em] text-center font-bold"
                    onFocus={e => e.target.style.borderColor = accentColor}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
            </div>

            <button type="submit" disabled={loading || code.length !== 6}
                className="cursor-pointer w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${accentColor}, #7c3aed)`, boxShadow: `0 8px 24px ${accentColor}50` }}>
                {loading ? 'Verificando...' : 'Confirmar código'}
            </button>

            <div className="flex items-center justify-between text-xs text-gray-500">
                <button type="button" onClick={onBack}
                    className="cursor-pointer flex items-center gap-1 hover:text-gray-700 transition-colors">
                    <ArrowLeft size={13} /> Voltar
                </button>
                <button type="button" onClick={handleResend} disabled={resending || cooldown > 0}
                    className="cursor-pointer flex items-center gap-1 font-semibold hover:underline disabled:no-underline disabled:cursor-default disabled:text-gray-400"
                    style={cooldown > 0 || resending ? undefined : { color: accentColor }}>
                    <RotateCw size={13} />
                    {resending ? 'Enviando...' : cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Não recebi, reenviar código'}
                </button>
            </div>
        </form>
    )
}

export default MfaForm
