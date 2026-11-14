// ─────────────────────────────────────────────────────────────────
// Utilitário de exportação .ics (iCalendar RFC 5545)
// Cada ocorrência vira um evento: aulas semanais, eventos avulsos e reservas de solicitação.
// Os horários vêm já expandidos da API (uma entrada por ocorrência, com as exclusões aplicadas).
// ─────────────────────────────────────────────────────────────────

import { APP_TIMEZONE } from './datetime'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

// Belém não tem horário de verão: UTC-3 o ano todo
const VTIMEZONE_BELEM = [
    'BEGIN:VTIMEZONE',
    `TZID:${APP_TIMEZONE}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'END:STANDARD',
    'END:VTIMEZONE',
]

const encoder = new TextEncoder()

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
 * Dia da semana ("Segunda", ...) de uma data "YYYY-MM-DD", sem passar por UTC
 */
export function diaSemanaDaData(dateStr) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-').map(Number)
    return DIAS_SEMANA[new Date(y, m - 1, d).getDay()]
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
 * Quebra linhas longas conforme RFC 5545: no máximo 75 octetos por linha,
 * continuação começando com espaço. Conta bytes UTF-8 (acentos ocupam 2) e não parte caracteres.
 */
function foldLine(line) {
    if (encoder.encode(line).length <= 75) return line
    const parts = []
    let current = ''
    let size = 0
    let limit = 75
    for (const ch of line) {
        const bytes = encoder.encode(ch).length
        if (size + bytes > limit) {
            parts.push(current)
            current = ''
            size = 0
            limit = 74 // o espaço da continuação conta
        }
        current += ch
        size += bytes
    }
    parts.push(current)
    return parts.join('\r\n ')
}

/**
 * UID estável por ocorrência: reimportar o arquivo atualiza os eventos em vez de duplicar
 */
function generateUID(horario, dtStart) {
    const baseId = String(horario.id).split(':')[0]
    return `sigra-${baseId}-${dtStart.slice(0, 13)}@uepa.br`
}

/**
 * Gera o conteúdo .ics completo a partir de um array de horários filtrados
 *
 * @param {Array}  horarios   - array do contexto (filtrado externamente), uma entrada por ocorrência
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
        `X-WR-TIMEZONE:${APP_TIMEZONE}`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...VTIMEZONE_BELEM,
    ]

    for (const h of horarios) {
        if (!h.dataInicio || !h.horarioInicio || !h.horarioFim) continue

        // Ocorrência que passa da meia-noite termina no dia seguinte
        const dtStart = toICSDateTime(h.dataInicio, h.horarioInicio)
        const dtEnd   = toICSDateTime(h.dataFim || h.dataInicio, h.horarioFim)

        const sala   = salas.find(s => s.id === h.salaId)
        const curso  = cursos.find(c => c.id === h.cursoId)

        const summary  = escapeICS(h.disciplina || 'Reserva')
        const location = escapeICS(sala?.nome || sala?.nomeSala || sala?.codigo_sala || '')
        const desc     = escapeICS([
            h.professor  ? `Professor: ${h.professor}`   : '',
            curso        ? `Curso: ${curso.nomeCurso || curso.nome} (${curso.siglaCurso || curso.sigla})` : '',
            sala         ? `Sala: ${[sala.nome || sala.nomeSala || sala.codigo_sala, sala.tipo || sala.tipoSala].filter(Boolean).join(' — ')}` : '',
            h.semestre   ? `Semestre: ${h.semestre}`     : '',
        ].filter(Boolean).join('\n'))

        lines.push('BEGIN:VEVENT')
        lines.push(`UID:${generateUID(h, dtStart)}`)
        lines.push(`DTSTAMP:${now}`)
        lines.push(`DTSTART;TZID=${APP_TIMEZONE}:${dtStart}`)
        lines.push(`DTEND;TZID=${APP_TIMEZONE}:${dtEnd}`)
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
