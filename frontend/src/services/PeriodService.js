import api from "./api";

/**
 * Lista todos os períodos — GET /periods/
 * Retorna: [{ id, semestre, descricao, data_inicio, data_fim }]
 */

export const getPeriods = async () => {
    const res = await api.get('/periods/')
    return res.data
}