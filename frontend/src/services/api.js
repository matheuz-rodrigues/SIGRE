import axios from "axios";
import { clearSession } from "./AuthService";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    headers: {'Content-Type': 'application/json'},
    // Sessão em cookies HttpOnly definidos pelo back-end; o JS nunca lê o token
    withCredentials: true,
})

// Token CSRF (double-submit) só em memória: vem no corpo de login/refresh/MFA
let csrfToken = null
export const setCsrfToken = (token) => { csrfToken = token || null }

const UNSAFE_METHODS = ['post', 'put', 'patch', 'delete']

api.interceptors.request.use((config) => {
    if (csrfToken && UNSAFE_METHODS.includes((config.method || '').toLowerCase())) {
        config.headers['X-CSRF-Token'] = csrfToken
    }
    return config
})

/**
 * Renova a sessão (cookie de refresh) e devolve o perfil do usuário.
 * Usado no carregamento da página para recuperar o token CSRF.
 */
// Uma única renovação por vez: o refresh token é rotacionado, então chamadas
// paralelas usariam um token já revogado
let refreshPromise = null
export const refreshSession = () => {
    if (!refreshPromise) {
        refreshPromise = axios
            .post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true })
            .then((response) => {
                setCsrfToken(response.data.csrf_token)
                return response.data
            })
            .finally(() => { refreshPromise = null })
    }
    return refreshPromise
}

// Rotas de autenticação tratam os próprios erros (ex.: código MFA inválido não é sessão expirada)
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/token', '/auth/mfa', '/auth/register', '/auth/logout']

const isCsrfError = (error) =>
    error.response?.status === 403 && /csrf/i.test(error.response?.data?.detail || '')

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config

        // 401 = access token expirado; 403 CSRF = token CSRF desatualizado (ex.: refresh em outra aba)
        if (error.response?.status !== 401 && !isCsrfError(error)) {
            return Promise.reject(error)
        }

        const url = originalRequest.url || ''
        if (NO_REFRESH_PATHS.some((path) => url.includes(path))) {
            return Promise.reject(error)
        }

        if (originalRequest._retry) {
            return Promise.reject(error)
        }
        originalRequest._retry = true

        try {
            await refreshSession()
        } catch (refreshError) {
            clearSession()
            window.dispatchEvent(new CustomEvent('session-expired'))
            return Promise.reject(refreshError)
        }
        return api(originalRequest)
    }
)

export const getGoogleStatus = async () => {
    const res = await api.get('/google/status')
    return res.data.connected
}
export const connectGoogle = async () => {
    const res = await api.get('/google/connect')
    return res.data.auth_url || res.data
}

export const disconnectGoogle = async () => {
    await api.delete('/google/disconnect')
    return true
}

export default api
