import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

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