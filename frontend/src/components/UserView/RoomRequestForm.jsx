import { useState, useEffect } from 'react'
import { useSchedule } from '../Schedule/ScheduleContext'
import { getCookie } from '../../utils/cookieUtils'
import api from '../../services/api'
import { fetchCurrentUser, applyUserProfile } from '../../services/AuthService'
import {
    X, Building2, Calendar, Clock, AlignLeft,
    Users, ChevronDown, CheckCircle2, Loader2, AlertCircle
} from 'lucide-react'
import { diasSemana } from '../../data/data'



const MOTIVOS = [
    { value: 'palestra',     label: 'Palestra' },
    { value: 'reuniao',      label: 'Reunião' },
    { value: 'evento',       label: 'Evento Acadêmico' },
    { value: 'defesa',       label: 'Defesa / Apresentação' },
    { value: 'aula_extra',   label: 'Aula Extra' },
    { value: 'workshop',     label: 'Workshop / Oficina' },
    { value: 'estudo_grupo', label: 'Estudo em Grupo' },
    { value: 'outro',        label: 'Outro' },
]

const inputClass = `
    w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50
    text-gray-800 text-sm placeholder-gray-400
    focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
    transition-all duration-200
`
const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5"

const readonlyBoxClass = `
    w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-100/90
    text-gray-700 text-sm select-none cursor-default
`

/** Valor enviado em `matricula` na solicitação: aluno usa matrícula; professor prioriza SIAPE. */
function matriculaParaSolicitacao(me, papel) {
    const p = papel || me?.papel || 'aluno'
    if (p === 'professor') {
        const siape = me?.siape != null && String(me.siape).trim() !== '' ? String(me.siape).trim() : ''
        if (siape) return siape
        const mat = me?.matricula != null && String(me.matricula).trim() !== '' ? String(me.matricula).trim() : ''
        return mat
    }
    return me?.matricula != null && String(me.matricula).trim() !== '' ? String(me.matricula).trim() : ''
}

const RoomRequestForm = ({ onClose, userRole, onSolicitacaoCriada }) => {
    const { salas, horarios } = useSchedule()
    const [step, setStep]           = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [conflito, setConflito]   = useState(null)
    const [error, setError]         = useState('')
    const [locked, setLocked]       = useState(null)
    const [loadingProfile, setLoadingProfile] = useState(true)

    const [form, setForm] = useState({
        motivo:        '',
        descricao:     '',
        observacoes:   '',
        salaId:        '',
        diaSemana:     '',
        dataEvento:    '',
        horarioInicio: '',
        horarioFim:    '',
        participantes: '',
    })

    useEffect(() => {
        let cancelled = false
        setLoadingProfile(true)
        ;(async () => {
            try {
                const me = await fetchCurrentUser()
                if (cancelled) return
                applyUserProfile(me)
                const papelEfetivo = userRole || me.papel || 'aluno'
                setLocked({
                    solicitante: me.nome || '',
                    email:       me.email || '',
                    matricula:   matriculaParaSolicitacao(me, papelEfetivo),
                })
            } catch {
                if (cancelled) return
                const nome = getCookie('userName') || ''
                const email = getCookie('userEmail') || ''
                const matAluno = getCookie('userMatricula') || ''
                const siape = getCookie('userSiape') || ''
                const idDoc =
                    userRole === 'professor' ? (siape || matAluno) : matAluno
                setLocked({ solicitante: nome, email, matricula: idDoc })
            } finally {
                if (!cancelled) setLoadingProfile(false)
            }
        })()
        return () => { cancelled = true }
    }, [userRole])

    const set = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
        setConflito(null)
        setError('')
    }

    const verificarConflito = () => {
        if (!form.salaId || !form.diaSemana || !form.horarioInicio || !form.horarioFim) return false
        const conflitante = horarios.find(h =>
            h.salaId === parseInt(form.salaId) &&
            h.diaSemana === form.diaSemana &&
            form.horarioInicio < h.horarioFim &&
            form.horarioFim > h.horarioInicio
        )
        if (conflitante) { setConflito(conflitante); return true }
        return false
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!locked || !String(locked.matricula || '').trim()) {
            alert('Matrícula ou SIAPE não consta no seu perfil. Solicite ao administrador que complete seu cadastro.')
            return
        }
        if (form.horarioInicio >= form.horarioFim) {
            alert('O horário de término deve ser maior que o de início.')
            return
        }
        if (verificarConflito()) return

        setSubmitting(true)
        setError('')
        try {
            const payload = {
                solicitante:   locked.solicitante,
                email:         locked.email,
                matricula:     locked.matricula,
                papel:         userRole || 'aluno',
                motivo:        MOTIVOS.find(m => m.value === form.motivo)?.label || form.motivo,
                descricao:     form.descricao,
                observacoes:   form.observacoes || null,
                participantes: form.participantes ? parseInt(form.participantes) : null,
                diaSemana:     form.diaSemana,
                dataEvento:    form.dataEvento || null,
                horarioInicio: form.horarioInicio,
                horarioFim:    form.horarioFim,
                salaId:        parseInt(form.salaId),
            }
            const res = await api.post('/solicitations/', payload)
            if (onSolicitacaoCriada) onSolicitacaoCriada(res.data)
            setStep(2)
        } catch (err) {
            setError(err.response?.data?.message || 'Erro ao enviar solicitação. Tente novamente.')
        } finally {
            setSubmitting(false)
        }
    }

    const salaSelecionada = salas.find(s => s.id === parseInt(form.salaId))

    // ── Step 2: Sucesso ──
    if (step === 2) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center"
                    style={{ animation: 'fadeInUp 0.3s ease' }}>
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                        style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)' }}>
                        <CheckCircle2 size={40} className="text-white" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Solicitação Enviada!</h2>
                    <p className="text-gray-500 text-sm mb-2">
                        Sua solicitação para a <strong className="text-gray-700">{salaSelecionada?.nome || 'sala'}</strong> foi registrada.
                    </p>
                    <p className="text-gray-400 text-xs mb-8">
                        A assessoria pedagógica analisará e entrará em contato pelo e-mail <strong>{locked?.email || ''}</strong>.
                    </p>
                    <div className="bg-gray-50 rounded-2xl p-4 mb-8 text-left space-y-2">
                        <Row label="Motivo"  value={MOTIVOS.find(m => m.value === form.motivo)?.label} />
                        <Row label="Sala"    value={salaSelecionada?.nome} />
                        <Row label="Dia"     value={`${form.diaSemana}${form.dataEvento ? ` (${form.dataEvento.split('-').reverse().join('/')})` : ''}`} />
                        <Row label="Horário" value={`${form.horarioInicio} – ${form.horarioFim}`} />
                    </div>
                    <button onClick={onClose}
                        className="w-full py-3 rounded-xl font-bold text-white text-sm hover:-translate-y-0.5 transition-all"
                        style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 8px 24px rgba(28,26,163,0.35)' }}>
                        Fechar
                    </button>
                </div>
                <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
            </div>
        )
    }

    // ── Step 1: Formulário ──
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
                style={{ animation: 'fadeInUp 0.25s ease' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100"
                    style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                            <Building2 size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white leading-none">Solicitar Agendamento</h2>
                            <p className="text-blue-200 text-xs mt-0.5">Preencha os dados da sua solicitação</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Corpo com scroll */}
                <div className="overflow-y-auto flex-1 px-8 py-6">
                    <form id="room-request-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* Seção 1: Identificação (somente leitura — perfil logado) */}
                        <Section title="Identificação" icon={<Users size={15} />}>
                            <p className="text-xs text-gray-500 mb-3">
                                Nome, e-mail e {userRole === 'professor' ? 'SIAPE' : 'matrícula'} vêm do seu cadastro e não podem ser alterados neste formulário.
                            </p>
                            {loadingProfile ? (
                                <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                                    <Loader2 size={18} className="animate-spin" /> Carregando seu perfil…
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="sm:col-span-2">
                                            <label className={labelClass}>Nome completo</label>
                                            <div className={readonlyBoxClass}>{locked?.solicitante || '—'}</div>
                                        </div>
                                        <div>
                                            <label className={labelClass}>E-mail</label>
                                            <div className={readonlyBoxClass}>{locked?.email || '—'}</div>
                                        </div>
                                        <div>
                                            <label className={labelClass}>
                                                {userRole === 'professor' ? 'SIAPE' : 'Matrícula'}
                                            </label>
                                            <div className={readonlyBoxClass}>
                                                {locked?.matricula?.trim() ? locked.matricula : '—'}
                                            </div>
                                        </div>
                                    </div>
                                    {locked && !String(locked.matricula || '').trim() && (
                                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                            <p>
                                                Sem matrícula ou SIAPE no perfil não é possível enviar a solicitação.
                                                Peça ao administrador para completar seus dados na aba <strong>Usuários</strong>.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </Section>

                        {/* Seção 2: Evento */}
                        <Section title="Sobre o Evento" icon={<AlignLeft size={15} />}>
                            <label className={labelClass}>Motivo *</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                {MOTIVOS.map(m => (
                                    <button key={m.value} type="button"
                                        onClick={() => set('motivo', m.value)}
                                        className="px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all text-center"
                                        style={form.motivo === m.value
                                            ? { background: 'linear-gradient(135deg,#1c1aa3,#4f46e5)', color: 'white', borderColor: 'transparent', boxShadow: '0 4px 12px rgba(28,26,163,0.3)' }
                                            : { borderColor: '#e5e7eb', color: '#6b7280', background: 'white' }}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <label className={labelClass}>Descrição do Evento *</label>
                                <textarea className={`${inputClass} resize-none`} rows={3} required
                                    placeholder="Descreva brevemente o evento, tema ou objetivo..."
                                    value={form.descricao} onChange={e => set('descricao', e.target.value)} />
                            </div>

                            <div className="mt-3">
                                <label className={labelClass}>Número de participantes</label>
                                <input className={inputClass} type="number" min="1"
                                    placeholder="Ex: 30"
                                    value={form.participantes} onChange={e => set('participantes', e.target.value)} />
                            </div>
                        </Section>

                        {/* Seção 3: Sala e Horário */}
                        <Section title="Sala e Horário" icon={<Calendar size={15} />}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className={labelClass}>Sala / Laboratório *</label>
                                    <div className="relative">
                                        <Building2 size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <select className={`${inputClass} pl-10 appearance-none`} required
                                            value={form.salaId} onChange={e => set('salaId', e.target.value)}>
                                            <option value="">Selecione a sala desejada...</option>
                                            {salas.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.nome} — {s.tipo === 'laboratorio' ? 'Laboratório' : 'Sala de Aula'}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Dia da Semana *</label>
                                    <div className="relative">
                                        <select className={`${inputClass} appearance-none`} required
                                            value={form.diaSemana} onChange={e => set('diaSemana', e.target.value)}>
                                            <option value="">Selecione...</option>
                                            {diasSemana.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Data do Evento</label>
                                    <input className={inputClass} type="date"
                                        value={form.dataEvento} onChange={e => set('dataEvento', e.target.value)} />
                                </div>

                                <div>
                                    <label className={labelClass}>Horário de Início *</label>
                                    <div className="relative">
                                        <Clock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input className={`${inputClass} pl-10`} type="time" required
                                            value={form.horarioInicio} onChange={e => set('horarioInicio', e.target.value)} />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Horário de Término *</label>
                                    <div className="relative">
                                        <Clock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input className={`${inputClass} pl-10`} type="time" required
                                            value={form.horarioFim} onChange={e => set('horarioFim', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Alerta de conflito */}
                            {conflito && (
                                <div className="mt-3 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-bold">Conflito de horário detectado</p>
                                        <p className="text-xs text-red-500 mt-0.5">
                                            A sala já está ocupada por <strong>{conflito.disciplina}</strong> ({conflito.professor})
                                            das {conflito.horarioInicio} às {conflito.horarioFim} na {conflito.diaSemana}.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </Section>

                        {/* Seção 4: Observações */}
                        <Section title="Observações Adicionais" icon={<AlignLeft size={15} />} optional>
                            <textarea className={`${inputClass} resize-none`} rows={3}
                                placeholder="Necessidade de projetor, configuração especial, acessibilidade, etc."
                                value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
                        </Section>

                        {/* Erro de API */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                                <AlertCircle size={15} className="shrink-0" />
                                {error}
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-gray-100 bg-gray-50/80 flex justify-between items-center gap-4">
                    <p className="text-xs text-gray-400">* Campos obrigatórios</p>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-100 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" form="room-request-form"
                            disabled={
                                submitting ||
                                !form.motivo ||
                                loadingProfile ||
                                !locked ||
                                !String(locked.matricula || '').trim()
                            }
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                            style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)', boxShadow: '0 6px 20px rgba(28,26,163,0.35)' }}>
                            {submitting
                                ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                                : <><CheckCircle2 size={15} /> Enviar Solicitação</>
                            }
                        </button>
                    </div>
                </div>
            </div>
            <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
    )
}

const Section = ({ title, icon, children, optional }) => (
    <div>
        <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1c1aa3, #7c3aed)' }}>
                <span className="text-white">{icon}</span>
            </div>
            <h3 className="text-sm font-bold text-gray-700">{title}</h3>
            {optional && <span className="text-xs text-gray-400 font-normal">(opcional)</span>}
        </div>
        {children}
    </div>
)

const Row = ({ label, value }) => (
    <div className="flex justify-between items-center text-sm">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">{label}</span>
        <span className="text-gray-700 font-medium">{value}</span>
    </div>
)

export default RoomRequestForm