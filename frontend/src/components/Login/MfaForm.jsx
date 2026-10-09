import { useState } from "react"
import { AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react'

/**
 * Formulário de verificação de segundo fator (MFA por app autenticador — TOTP).
 * Com `setup` (primeiro acesso), mostra o QR code para cadastrar o app antes do código.
 * O contrato com o backend (endpoints/campos) fica isolado em AuthService.js.
 */
const MfaForm = ({ setup, onVerify, onBack, accentColor }) => {
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleCodeChange = (e) => {
        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6)
        setCode(digitsOnly)
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (code.length !== 6) return
        setError('')
        setLoading(true)
        try {
            await onVerify(code)
        } catch (err) {
            if (err.response?.status === 429) {
                const seconds = Number(err.response.headers?.['retry-after'])
                setError(`Muitas tentativas. Tente novamente em ${Number.isFinite(seconds) && seconds > 0 ? seconds : 30}s.`)
            } else {
                const detail = err.response?.data?.detail || err.response?.data?.message
                setError(typeof detail === 'string' ? detail : 'Código inválido. Tente novamente.')
            }
            setCode('')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {setup ? (
                <div className="flex flex-col items-center gap-3 -mt-2">
                    <p className="text-sm text-gray-500">
                        Seu perfil exige verificação em duas etapas. Escaneie o QR code com um app
                        autenticador (Google Authenticator, Microsoft Authenticator, Aegis etc.) e
                        digite o código gerado.
                    </p>
                    <img src={setup.qr_code} alt="QR code para cadastrar o app autenticador"
                        width={180} height={180} className="rounded-lg border border-gray-200 bg-white p-2" />
                    <p className="text-xs text-gray-500 text-center">
                        Sem câmera? Digite a chave no app:{' '}
                        <code className="font-mono font-bold text-gray-700 break-all select-all">{setup.secret}</code>
                    </p>
                </div>
            ) : (
                <p className="text-sm text-gray-500 -mt-2">
                    Digite o código de 6 dígitos do seu app autenticador.
                </p>
            )}

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-sm">
                    <AlertCircle size={16} /><span>{error}</span>
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
                {loading ? 'Verificando...' : (setup ? 'Ativar e entrar' : 'Confirmar código')}
            </button>

            <div className="flex items-center text-xs text-gray-500">
                <button type="button" onClick={onBack}
                    className="cursor-pointer flex items-center gap-1 hover:text-gray-700 transition-colors">
                    <ArrowLeft size={13} /> Voltar
                </button>
            </div>
        </form>
    )
}

export default MfaForm
