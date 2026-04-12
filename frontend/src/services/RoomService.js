import api from './api'

/**
 * Lista as salas - GET /rooms/
 * Retorna: [{id, nomeSala, tipoSala, descricao_sala, capacidade, idSala}]
 */

export const getRooms = async () => {
    const res = await api.get('/rooms/')
    return res.data
}