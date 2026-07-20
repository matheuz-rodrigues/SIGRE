import api from './api'

const ROLE_BY_TIPO = { 1: 'aluno', 2: 'professor', 3: 'admin' }

/**
 * Perfil do usuário autenticado — GET /users/me
 */
export const fetchCurrentUser = async () => {
  const res = await api.get('/users/me')
  return res.data
}

/**
 * Atualiza dados do usuário autenticado via endpoint administrativo existente.
 * Requer permissão de administrador para edição arbitrária.
 */
export const updateUserById = async (userId, payload) => {
  const res = await api.put(`/users/${userId}`, payload)
  return res.data
}

/**
 * Sincroniza localStorage com o retorno de /users/me (fonte de verdade pós-login).
 */
export const applyUserProfile = (me) => {
  if (!me) return
  localStorage.setItem('userName', me.nome ?? '')
  localStorage.setItem('userEmail', me.email ?? '')
  localStorage.setItem('userId', String(me.id ?? ''))
  const papel = me.papel ?? ROLE_BY_TIPO[me.tipo_usuario] ?? 'aluno'
  localStorage.setItem('userRole', papel)
  if (papel === 'admin') {
    localStorage.setItem('isAdminAuthenticated', 'true')
  }
  localStorage.setItem('adminUser', me.nome ?? 'Admin')


}

/**
 * Login — POST /auth/login
 * Envia: { username, senha }
 * Recebe: { id, nome, email, username, papel, access_token, token_type }
 */
export const login = async (username, senha) => {
  const res = await api.post('/auth/login', { username, password: senha })
  return res.data
}

/**
 * Cadastro — POST /auth/register
 * Campos comuns: nome, email, telefone, username, senha, papel
 * Aluno:     + cursoId (número inteiro)
 * Professor: + cursoId (número inteiro), departamento
 */
export const register = async (dados) => {
  const res = await api.post('/auth/register', dados)
  return res.data
}

/**
 * Salva os dados do usuário no localStorage após login bem-sucedido
 */
export const saveSession = (userData) => {
  localStorage.setItem('access_token', userData.access_token)
  localStorage.setItem('userRole', userData.papel)
  localStorage.setItem('userName', userData.nome)
  localStorage.setItem('userEmail', userData.email)
  localStorage.setItem('userId', userData.id)

  if (userData.refresh_token) {
    localStorage.setItem('refresh_token', userData.refresh_token)
  }

  if (userData.papel === 'admin') {
    localStorage.setItem('isAdminAuthenticated', 'true')
  }
}

/**
 * Remove todos os dados de sessão (logout)
 */
export const clearSession = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('userRole')
  localStorage.removeItem('userName')
  localStorage.removeItem('userEmail')
  localStorage.removeItem('userId')
  localStorage.removeItem('isAdminAuthenticated')
  localStorage.removeItem('adminUser')
}

/**
 * Retorna o refresh token armazenado no localStorage
 */
export const getRefreshToken = () => {
  return localStorage.getItem('refresh_token')
}