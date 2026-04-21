import api from './api'
import { setCookie, getCookie, deleteCookie } from '../utils/cookieUtils'

const ROLE_BY_TIPO = { 1: 'aluno', 2: 'professor', 3: 'admin' }

/**
 * Perfil do usuário autenticado — GET /users/me
 */
export const fetchCurrentUser = async () => {
  const res = await api.get('/users/me')
  return res.data
}

/**
 * Sincroniza localStorage com o retorno de /users/me (fonte de verdade pós-login).
 */
export const applyUserProfile = (me) => {
  if (!me) return
  setCookie('userName', me.nome ?? '')
  setCookie('userEmail', me.email ?? '')
  setCookie('userId', String(me.id ?? ''))
  const papel = me.papel ?? ROLE_BY_TIPO[me.tipo_usuario] ?? 'aluno'
  setCookie('userRole', papel)
  if (papel === 'admin') {
    setCookie('isAdminAuthenticated', 'true')
  }
  setCookie('adminUser', me.nome ?? 'Admin')

  const mat = me.matricula != null && String(me.matricula).trim() !== '' ? String(me.matricula).trim() : ''
  if (mat) setCookie('userMatricula', mat)
  else deleteCookie('userMatricula')

  const sia = me.siape != null && String(me.siape).trim() !== '' ? String(me.siape).trim() : ''
  if (sia) setCookie('userSiape', sia)
  else deleteCookie('userSiape')
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
  setCookie('access_token', userData.access_token)
  setCookie('userRole',     userData.papel)
  setCookie('userName',     userData.nome)
  setCookie('userEmail',    userData.email)
  setCookie('userId',       userData.id)
  
  if (userData.papel === 'admin') {
    setCookie('isAdminAuthenticated', 'true')
  }
}

/**
 * Remove todos os dados de sessão (logout)
 */
export const clearSession = () => {
  deleteCookie('access_token')
  deleteCookie('userRole')
  deleteCookie('userName')
  deleteCookie('userEmail')
  deleteCookie('userId')
  deleteCookie('isAdminAuthenticated')
  deleteCookie('adminUser')
  deleteCookie('userMatricula')
  deleteCookie('userSiape')
}

export const getSessionToken = () => getCookie('access_token')
export const getSessionRole = () => getCookie('userRole')
export const getSessionId = () => getCookie('userId')
export const getSessionName = () => getCookie('userName')
export const getSessionEmail = () => getCookie('userEmail')
export const isAdminAuth = () => getCookie('isAdminAuthenticated') === 'true'