import api from "./api";

/**
 * Lista reservas com filtros opcionais — GET /reservations/
 * Parâmetros aceitos pelo backend:
 *   room_id, user_id, date_from, date_to, status
 *
 * Retorna: { items: [ { id, start, end, summary, extendedProperties, ... } ] }
 */

export const getReservations = async(filtros = {}) => {
    const res = await api.get('/reservations/', {params: filtros})
    return res.data
}

/**
 * Cria uma nova reserva — POST /reservations/
 */

export const createReservation = async(payload) =>{
    const res = await api.post('/reservations/', payload)
    return res.data
}

/**
 * Aprova uma reserva — PATCH /reservations/approve/{id}
 */

export const approveReservation = async(id) => {
    const res = await api.patch(`/reservations/approve/${id}`)
    return res.data
}

/**
 * Recusa uma reserva — PATCH /reservations/refuse/{id}
 */

export const refuseReservation = async(id) => {
    const res = await api.patch(`/reservations/refuse/${id}`)
    return res.data
}


/**
 * Deleta uma reserva — DELETE /reservations/{id}
 */

export const deleteReservation = async(id, deleteSeries = false) => {
    const res = await api.delete(`/reservations/${id}`, {params: {delete_series: deleteSeries}})
    return res.data
}