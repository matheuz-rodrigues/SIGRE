import axios from "axios";
import { clearSession } from "./AuthService";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    headers: {'Content-Type': 'application/json'},
    withCredentials: true,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error)
        } else {
            resolve(token)
        }
    })
    failedQueue = []
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config

        if (error.response?.status !== 401) {
            return Promise.reject(error)
        }

        const url = originalRequest.url || ''
        if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/token')) {
            return Promise.reject(error)
        }

        if (originalRequest._retry) {
            return Promise.reject(error)
        }

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject })
            }).then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`
                return api(originalRequest)
            }).catch((err) => {
                return Promise.reject(err)
            })
        }

        originalRequest._retry = true
        isRefreshing = true

        try {
            const response = await axios.post(
                `${api.defaults.baseURL}/auth/refresh`,
                {},
                { withCredentials: true }
            )

            const { access_token } = response.data

            localStorage.setItem('access_token', access_token)

            processQueue(null, access_token)

            originalRequest.headers.Authorization = `Bearer ${access_token}`
            return api(originalRequest)
        } catch (refreshError) {
            processQueue(refreshError, null)
            clearSession()
            window.dispatchEvent(new CustomEvent('session-expired'))
            return Promise.reject(refreshError)
        } finally {
            isRefreshing = false
        }
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
