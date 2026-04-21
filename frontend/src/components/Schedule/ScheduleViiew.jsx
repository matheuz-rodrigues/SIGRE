import { useState } from 'react'
import { useSchedule } from './ScheduleContext'
import MonthCalendar from '../Calendar/MonthCalendar'
import ExportICSModal from '../Calendar/ExportICSModal'
import MapaOcupacao from '../MapaOcupacao/MapaOcupacao'
import { Calendar, Download, FileText, X } from 'lucide-react'

const ScheduleViiew = ({ isAdmin = false }) => {
    const { cursos, periodos, periodoAtivo } = useSchedule()
    const [showExport, setShowExport] = useState(false)
    const [showMapa, setShowMapa]     = useState(false)

    const periodoAtual = periodos.find(p => p.id === periodoAtivo)

    const formatarData = (dataISO) => {
        if (!dataISO) return ''
        const [, mes, dia] = dataISO.split('-')
        return `${dia}/${mes}`
    }

    return (
        <div className='bg-white rounded-lg shadow-sm p-8'>

            {/* ── Cabeçalho ── */}
            <div className='flex justify-between items-start mb-6 pb-6 border-b-2 border-gray-200'>
                <div>
                    <h2 className='text-3xl font-bold text-gray-900 mb-2'>Grade de Horários</h2>
                    <p className='text-gray-600'>
                        Visualize os horários das aulas e ocupação do campus
                    </p>
                    {periodoAtual && (
                        <div className='flex items-center gap-2 mt-3 text-sm'>
                            <Calendar size={16} className='text-blue-600' />
                            <span className='font-semibold text-gray-600'>
                                Período Ativo: {formatarData(periodoAtual.dataInicio)} a {formatarData(periodoAtual.dataFim)}
                            </span>
                            <span className='text-gray-400'>•</span>
                            <span className='text-gray-600'>{periodoAtual.descricao}</span>
                        </div>
                    )}
                </div>

                <div className='flex flex-col sm:flex-row items-end gap-3'>
                    {/* Botão exportar .ics */}
                   {isAdmin && (
                    <button
                        onClick={() => setShowExport(true)}
                        className='flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md'
                        style={{ borderColor: '#1c1aa3', color: '#1c1aa3', background: '#1c1aa308' }}
                    >
                        <Download size={15} />
                        Exportar .ics
                    </button>
                   )}
                </div>
            </div>

            <div className='mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200'>
                <h3 className='text-sm font-semibold text-gray-700 mb-3'>Legenda de Cursos:</h3>
                <div className='flex flex-wrap gap-3'>
                    {cursos.map(curso => (
                        <div key={curso.id} className='flex items-center gap-2'>
                            <div className='w-4 h-4 rounded' style={{ backgroundColor: curso.cor }} />
                            <span className='text-sm text-gray-700'>{curso.siglaCurso || curso.sigla} — {curso.nomeCurso || curso.nome}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── View: Mapa de Ocupação ── */}
            <MapaOcupacao />

            {/* ── Modal de exportação .ics ── */}
            {showExport && (
                <ExportICSModal onClose={() => setShowExport(false)} />
            )}
        </div>
    )
}

export default ScheduleViiew

