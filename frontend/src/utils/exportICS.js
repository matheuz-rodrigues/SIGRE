// ─────────────────────────────────────────────────────────────────
// Utilitário de exportação .ics (iCalendar RFC 5545)
// Gera eventos recorrentes semanais para cada alocação
// ─────────────────────────────────────────────────────────────────

const DIA_SEMANA_BYDAY = {
    'Domingo':  'SU',
    'Segunda':  'MO',
    'Terça':    'TU',
    'Quarta':   'WE',
    'Quinta':   'TH',
    'Sexta':    'FR',
    'Sábado':   'SA',
}

// Índice JS do dia (0=Dom, 1=Seg...)
const DIA_SEMANA_IDX = {
    'Domingo':  0,
    'Segunda':  1,
    'Terça':    2,
    'Quarta':   3,
    'Quinta':   4,
    'Sexta':    5,
    'Sábado':   6,
}

/**
 * Formata uma data + hora no formato iCalendar: YYYYMMDDTHHMMSS
 * @param {string} dateStr  "YYYY-MM-DD"
 * @param {string} timeStr  "HH:MM"
 */
function toICSDateTime(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-')
    const [h, min]  = timeStr.split(':')
    return `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}T${h.padStart(2,'0')}${min.padStart(2,'0')}00`
}

/**
 * Formata apenas data: YYYYMMDD
 */
function toICSDate(dateStr) {
    const [y, m, d] = dateStr.split('-')
    return `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}`
}

/**
 * Encontra a primeira ocorrência de um dia da semana a partir de dataInicio
 * Ex: dataInicio = "2025-03-01" (sábado), quero "Segunda" → retorna "2025-03-03"
 */
function firstOccurrence(dataInicio, diaSemana) {
    const targetIdx = DIA_SEMANA_IDX[diaSemana]
    if (targetIdx === undefined) return dataInicio

    const date = new Date(dataInicio + 'T00:00:00')
    const currentIdx = date.getDay()
    const diff = (targetIdx - currentIdx + 7) % 7
    date.setDate(date.getDate() + diff)
    return date.toISOString().split('T')[0]
}

/**
 * Escapa texto para o formato iCalendar
 */
function escapeICS(str = '') {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        // \r\n, \r ou \n viram "\n" literal: uma quebra de linha real permitiria injetar propriedades no .ics
        .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Quebra linhas longas conforme RFC 5545 (máx 75 octetos, continuação com espaço)
 */
function foldLine(line) {
    if (line.length <= 75) return line
    const chunks = []
    chunks.push(line.slice(0, 75))
    let i = 75
    while (i < line.length) {
        chunks.push(' ' + line.slice(i, i + 74))
        i += 74
    }
    return chunks.join('\r\n')
}

/**
 * Gera um UID único para cada evento
 */
function generateUID(horario) {
    return `sca-uepa-${horario.id}-${Date.now()}@uepa.br`
}

/**
 * Gera o conteúdo .ics completo a partir de um array de horários filtrados
 *
 * @param {Array}  horarios   - array do contexto (filtrado externamente)
 * @param {Array}  salas      - array de salas para lookup
 * @param {Array}  cursos     - array de cursos para lookup
 * @param {string} calName    - nome do calendário
 */
export function generateICS(horarios, salas, cursos, calName = 'SCA UEPA — Horários') {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SCA UEPA//Sistema Cronos de Alocacao//PT',
        `X-WR-CALNAME:${escapeICS(calName)}`,
        'X-WR-TIMEZONE:America/Manaus',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
    ]

    for (const h of horarios) {
        if (!h.dataInicio || !h.dataFim || !h.horarioInicio || !h.horarioFim) continue

        const byDay   = DIA_SEMANA_BYDAY[h.diaSemana]
        if (!byDay) continue

        // Primeira ocorrência real do dia da semana dentro do período
        const firstDate = firstOccurrence(h.dataInicio, h.diaSemana)

        const dtStart  = toICSDateTime(firstDate, h.horarioInicio)
        const dtEnd    = toICSDateTime(firstDate, h.horarioFim)
        const until    = toICSDate(h.dataFim) + 'T235959Z'

        const sala   = salas.find(s => s.id === h.salaId)
        const curso  = cursos.find(c => c.id === h.cursoId)

        const summary  = escapeICS(h.disciplina || 'Aula')
        const location = escapeICS(sala?.nome || sala?.nomeSala || sala?.codigo_sala || '')
        const desc     = escapeICS([
            h.professor  ? `Professor: ${h.professor}`   : '',
            curso        ? `Curso: ${curso.nomeCurso || curso.nome} (${curso.siglaCurso || curso.sigla})` : '',
            sala         ? `Sala: ${sala.nome || sala.nomeSala || sala.codigo_sala} — ${sala.tipo || sala.tipoSala}`     : '',
            h.semestre   ? `Semestre: ${h.semestre}`     : '',
        ].filter(Boolean).join('\\n'))

        lines.push('BEGIN:VEVENT')
        lines.push(`UID:${generateUID(h)}`)
        lines.push(`DTSTAMP:${now}`)
        lines.push(`DTSTART:${dtStart}`)
        lines.push(`DTEND:${dtEnd}`)
        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`)
        lines.push(foldLine(`SUMMARY:${summary}`))
        if (location) lines.push(foldLine(`LOCATION:${location}`))
        if (desc)     lines.push(foldLine(`DESCRIPTION:${desc}`))
        const corCurso = curso?.corCurso || curso?.cor
        if (corCurso) lines.push(`COLOR:${corCurso}`)
        lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')

    return lines.join('\r\n')
}

/**
 * Dispara o download do arquivo .ics no navegador
 *
 * @param {string} icsContent  - resultado de generateICS()
 * @param {string} filename    - nome do arquivo sem extensão
 */
export function downloadICS(icsContent, filename = 'horarios-sca-uepa') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${filename}.ics`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
