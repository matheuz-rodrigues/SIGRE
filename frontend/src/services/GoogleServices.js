import api from "./api"

export const getGoogleConnectUrl = () => {
    return `${api.defaults.baseURL}/google/connect`
}

/**
 * Lista eventos do Google Calendar — GET /calendar/google/events
 * Parâmetros: start (datetime), end (datetime), calendar_id (opcional)
 */

export const getGoogleEvents = async (start, end, calendarId = null) => {
    const params = {start, end}
    if(calendarId) params.calendar_id = calendarId
    const res = await api.get('/calendar/google/events', {params})
    return res.data
}

/**
 * Lista eventos unificados (local + Google) — GET /calendar/events
 * Parâmetros: view (day|week|month|semester), anchor (datetime), room_id, user_id
 */

export const getCalendarEvents = async (params = {}) => {
    const res = await api.get('/calendar/events', {params})
    return res.data
}