import api from './api'

/**
 * Login — POST /auth/login
 * Envia: { username, senha }
 * Recebe: { id, nome, email, username, papel, access_token, token_type }
 */
export const login = async (username, senha) => {
  const res = await api.post('/auth/login', { username, senha })
  return res.data
}

/**
 * Cadastro — POST /auth/register
 * Campos comuns: nome, email, telefone, username, senha, papel
 * Aluno:     + matricula, cursoId (número inteiro)
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
  localStorage.setItem('userRole',     userData.papel)
  localStorage.setItem('userName',     userData.nome)
  localStorage.setItem('userEmail',    userData.email)
  localStorage.setItem('userId',       userData.id)
  
  if (userData.papel === 'admin') {
    localStorage.setItem('isAdminAuthenticated', 'true')
  }
}

/**
 * Remove todos os dados de sessão (logout)
 */
export const clearSession = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('userRole')
  localStorage.removeItem('userName')
  localStorage.removeItem('userEmail')
  localStorage.removeItem('userId')
}