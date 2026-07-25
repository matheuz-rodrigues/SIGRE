import { useState } from 'react'
import { X, CalendarDays, Check, Building2, Tag, AlignLeft } from 'lucide-react'
import { useSchedule } from '../Schedule/ScheduleContext'
import api from '../../services/api'

const inp = "w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:ring-2 focus:ring-purple-400 focus:outline-none focus:border-purple-400 transition-all text-sm placeholder-gray-400"
const lbl = "block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2"

const TIPOS_EVENTO = [
    'Seminário',
    'Workshop',
    'Aula',
    'Palestra',
    'Defesa de TCC',
    'Reunião',
    'Treinamento',
    'Evento Cultural',
    'Evento Esportivo',
    'Outro',
]

const ErrorHint = ({ error }) =>
    error ? <p className="text-red-500 text-xs mt-1 font-medium">{error}</p> : null

const EventoModal = ({ onClose, onSaved }) => {
    const { salas, recarregarDados } = useSchedule()

    const [form, setForm] = useState({
        tipo: '',
        nome: '',
        data: '',
        horarioInicio: '',
        horarioFim: '',
        salaId: '',
    })
    const [errors, setErrors] = useState({})
    const [isSaving, setIsSaving] = useState(false)

    const set = (k, v) => {
        setForm(f => ({ ...f, [k]: v }))
        setErrors(prev => {
            if (!prev[k]) return prev
            const next = { ...prev }
            delete next[k]
            return next
        })
    }

    const validate = () => {
        const e = {}
        if (!form.tipo) e.tipo = 'Selecione o tipo do evento'
        if (!form.nome.trim()) e.nome = 'Informe o nome do evento'
        if (!form.data) e.data = 'Informe a data do evento'
        if (!form.horarioInicio) e.horarioInicio = 'Obrigatório'
        if (!form.horarioFim) e.horarioFim = 'Obrigatório'
        if (form.horarioInicio && form.horarioFim && form.horarioInicio >= form.horarioFim)
            e.horarioFim = 'Deve ser após o início'
        if (!form.salaId) e.salaId = 'Selecione uma sala'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    const handleSubmit = async () => {
        if (!validate()) return
        setIsSaving(true)
        try {
            const userId = localStorage.getItem('userId')
            const sala = salas.find(s => String(s.id) === String(form.salaId))
            const dataHoraInicio = new Date(`${form.data}T${form.horarioInicio}:00`).toISOString()
            const dataHoraFim = new Date(`${form.data}T${form.horarioFim}:00`).toISOString()

            const payload = {
                fk_usuario: userId ? parseInt(userId) : null,
                salaId: parseInt(form.salaId),
                tipo: form.tipo,
                uso: form.nome,
                dia_horario_inicio: dataHoraInicio,
                dia_horario_saida: dataHoraFim,
                diaSemana: null,
                dataInicio: dataHoraInicio,
                dataFim: dataHoraFim,
                recurrency: null,
                justificativa: `Evento: ${form.tipo} — ${form.nome}`,
                professorId: null,
                disciplinaId: null,
                cursoId: null,
                periodoId: null,
                status: 'APPROVED', 
            }

            if (!payload.fk_usuario) {
                alert('Sessão inválida: faça login novamente.')
                return
            }

            console.log('Payload enviado:', JSON.stringify(payload, null, 2))
            await api.post('/reservations/', payload)
            await recarregarDados()
            onSaved?.()
            onClose()
            alert('Evento salvo com sucesso!')
        } catch (err) {
            console.error(err)
            console.log('Response data:', err.response?.data) 
            const msg = err.response?.data?.detail || 'Erro ao salvar evento.'
            alert(typeof msg === 'string' ? msg : 'Erro ao salvar evento. Verifique os dados.')
        } finally {
            setIsSaving(false)
        }
    }

    const getSala = () => salas.find(s => String(s.id) === String(form.salaId))

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto"
            style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl"
                style={{ border: '1px solid #e5e7eb' }}>

                {/* Header */}
                <div className="px-8 py-6 flex items-center justify-between"
                    style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)' }}>
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                            <CalendarDays size={18} className="text-white" />
                        </div>
                        <div>
                            <p className="text-purple-300/80 text-[10px] font-bold uppercase tracking-widest">
                                Alocação sem Repetição
                            </p>
                            <h3 className="text-white text-xl font-black leading-tight mt-0.5">Novo Evento</h3>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all">
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="bg-white px-8 py-8 space-y-5">

                    {/* Tipo */}
                    <div>
                        <label className={lbl}>
                            <Tag size={10} className="inline mr-1" /> Tipo do Evento
                        </label>
                        <select className={inp + (errors.tipo ? ' border-red-500 ring-red-100' : '')}
                            value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                            <option value="">Selecione o tipo...</option>
                            {TIPOS_EVENTO.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ErrorHint error={errors.tipo} />
                    </div>

                    {/* Nome */}
                    <div>
                        <label className={lbl}>
                            <AlignLeft size={10} className="inline mr-1" /> Nome do Evento
                        </label>
                        <input
                            type="text"
                            className={inp + (errors.nome ? ' border-red-500 ring-red-100' : '')}
                            placeholder="Ex: Defesa de Dissertação — João Silva"
                            value={form.nome}
                            onChange={e => set('nome', e.target.value)}
                        />
                        <ErrorHint error={errors.nome} />
                    </div>

                    {/* Data */}
                    <div>
                        <label className={lbl}>
                            <CalendarDays size={10} className="inline mr-1" /> Data do Evento
                        </label>
                        <input
                            type="date"
                            className={inp + (errors.data ? ' border-red-500 ring-red-100' : '')}
                            value={form.data}
                            onChange={e => set('data', e.target.value)}
                        />
                        <ErrorHint error={errors.data} />
                    </div>

                    {/* Horário */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={lbl}>Início</label>
                            <input
                                type="time"
                                className={inp + (errors.horarioInicio ? ' border-red-500 ring-red-100' : '')}
                                value={form.horarioInicio}
                                onChange={e => set('horarioInicio', e.target.value)}
                            />
                            <ErrorHint error={errors.horarioInicio} />
                        </div>
                        <div>
                            <label className={lbl}>Fim</label>
                            <input
                                type="time"
                                className={inp + (errors.horarioFim ? ' border-red-500 ring-red-100' : '')}
                                value={form.horarioFim}
                                onChange={e => set('horarioFim', e.target.value)}
                            />
                            <ErrorHint error={errors.horarioFim} />
                        </div>
                    </div>

                    {/* Sala */}
                    <div>
                        <label className={lbl}>
                            <Building2 size={10} className="inline mr-1" /> Sala
                        </label>
                        <select className={inp + (errors.salaId ? ' border-red-500 ring-red-100' : '')}
                            value={form.salaId} onChange={e => set('salaId', e.target.value)}>
                            <option value="">Selecione a sala...</option>
                            {salas.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.nomeSala || s.nome} — {s.tipoSala || s.tipo}
                                </option>
                            ))}
                        </select>
                        <ErrorHint error={errors.salaId} />
                    </div>

                    {/* Preview sala selecionada */}
                    {form.salaId && getSala() && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                                <Building2 size={14} className="text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-purple-900">{getSala().nomeSala || getSala().nome}</p>
                                <p className="text-xs text-purple-600">{getSala().tipoSala || getSala().tipo}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-gray-100 bg-gray-50/70 flex justify-between items-center">
                    <button type="button" onClick={onClose}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-500 text-sm font-semibold hover:bg-gray-200 transition-colors">
                        <X size={15} /> Cancelar
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={isSaving}
                        className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-all shadow-lg active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#6d28d9,#7c3aed)', boxShadow: isSaving ? 'none' : '0 4px 16px rgba(109,40,217,0.28)' }}>
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Check size={15} /> Salvar Evento
                            </>
                        )}
                    </button>
                </div>
            </div>
            </div>
        </div>
    )
}

export default EventoModal
