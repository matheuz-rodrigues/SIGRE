import api from './api'

/**
 * Lista todos os cursos disponíveis — GET /curso/all
 * Retorna: [{ id, nome }, ...]
 */
export const getCursos = async () => {
  const res = await api.get('/courses/')
  return res.data
}