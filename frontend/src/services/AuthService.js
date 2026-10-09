import api, { setCsrfToken, refreshSession } from './api'

const ROLE_BY_TIPO = { 1: 'aluno', 2: 'professor', 3: 'admin', 4: 'tecnico_adm' }

// ── MFA (TOTP, app autenticador) ─────────────────────────────────────────────
// /auth/login devolve { mfa_required, mfa_token } ou, no primeiro acesso de
// admin/técnico, { mfa_setup_required, mfa_token }.
export const MFA_VERIFY_ENDPOINT = '/auth/mfa/verify'
export const MFA_SETUP_ENDPOINT = '/auth/mfa/setup'
export const MFA_REQUIRED_FIELD = 'mfa_required'
export const MFA_SETUP_REQUIRED_FIELD = 'mfa_setup_required'
export const MFA_TOKEN_FIELD = 'mfa_token'

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
 * Envia: { username, password }
 * Recebe: { id, nome, email, username, papel, csrf_token, token_type } (tokens em cookies HttpOnly)
 *         ou o desafio de MFA
 */
export const login = async (username, senha) => {
  const res = await api.post('/auth/login', { username, password: senha })
  return res.data
}

/**
 * Verificação do código de MFA — POST {MFA_VERIFY_ENDPOINT}
 * Envia: { mfa_token, code }
 * Recebe: mesmo formato de sucesso de login
 */
export const verifyMfaCode = async (mfaToken, code) => {
  const res = await api.post(MFA_VERIFY_ENDPOINT, { [MFA_TOKEN_FIELD]: mfaToken, code })
  return res.data
}

/**
 * Cadastro do MFA no primeiro acesso — POST {MFA_SETUP_ENDPOINT}
 * Envia: { mfa_token }
 * Recebe: { otpauth_uri, qr_code (data:image/svg+xml), secret }
 */
export const startMfaSetup = async (mfaToken) => {
  const res = await api.post(MFA_SETUP_ENDPOINT, { [MFA_TOKEN_FIELD]: mfaToken })
  return res.data
}

/**
 * Restaura a sessão a partir do cookie de refresh (recarga da página)
 */
export const restoreSession = async () => {
  const me = await refreshSession()
  applyUserProfile(me)
  return me
}

/**
 * Logout — revoga o refresh token no servidor e limpa os cookies
 */
export const logout = async () => {
  try {
    await api.post('/auth/logout')
  } finally {
    clearSession()
  }
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
  // Tokens ficam só em cookies HttpOnly; aqui guardamos apenas dados de exibição
  setCsrfToken(userData.csrf_token)
  localStorage.setItem('userRole', userData.papel)
  localStorage.setItem('userName', userData.nome)
  localStorage.setItem('userEmail', userData.email)
  localStorage.setItem('userId', userData.id)

  if (userData.papel === 'admin') {
    localStorage.setItem('isAdminAuthenticated', 'true')
  }
}

/**
 * Remove todos os dados de sessão (logout)
 */
export const clearSession = () => {
  setCsrfToken(null)
  localStorage.removeItem('access_token') // legado: versões anteriores guardavam o token aqui
  localStorage.removeItem('userRole')
  localStorage.removeItem('userName')
  localStorage.removeItem('userEmail')
  localStorage.removeItem('userId')
  localStorage.removeItem('isAdminAuthenticated')
  localStorage.removeItem('adminUser')
}