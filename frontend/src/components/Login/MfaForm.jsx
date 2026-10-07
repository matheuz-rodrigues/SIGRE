import { useState } from "react"
import { AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react'

/**
 * Formulário de verificação de segundo fator (MFA).
 * O contrato com o backend (endpoints/campos) fica isolado em AuthService.js,
 * facilmente ajustável quando o back end fechar o formato definitivo.
 */
const MfaForm = ({ onVerify, onResend, onBack, accentColor }) => {
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [resending, setResending] = useState(false)
    const [resendMessage, setResendMessage] = useState('')

    const handleCodeChange = (e) => {
        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6)
        setCode(digitsOnly)
        setError('')
        setResendMessage('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (code.length !== 6) return
        setError('')
        setLoading(true)
        try {
            await onVerify(code)
        } catch (err) {
            const detail = err.response?.data?.detail || err.response?.data?.message
            setError(typeof detail === 'string' ? detail : 'Código inválido. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        setError('')
        setResendMessage('')
        setResending(true)
        try {
            await onResend()
            setResendMessage('Código reenviado.')
        } catch {
            setError('Não foi possível reenviar o código. Tente novamente.')
        } finally {
            setResending(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-gray-500 -mt-2">
                Digite o código de 6 dígitos enviado para verificar sua identidade.
            </p>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-sm">
                    <AlertCircle size={16} /><span>{error}</span>
                </div>
            )}

            {resendMessage && !error && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-xl text-sm">
                    <ShieldCheck size={16} /><span>{resendMessage}</span>
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
                <button type="button" onClick={handleResend} disabled={resending}
                    className="cursor-pointer font-bold hover:underline disabled:opacity-60"
                    style={{ color: accentColor }}>
                    {resending ? 'Reenviando...' : 'Reenviar código'}
                </button>
            </div>
        </form>
    )
}

export default MfaForm
