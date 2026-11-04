import { useSyncExternalStore } from 'react'

// Perfil do usuário logado só em memória: nenhum dado de sessão fica no localStorage.
// Ao recarregar a página, o App restaura o perfil pelo cookie HttpOnly de refresh.
let currentUser = null
const listeners = new Set()

export const getUser = () => currentUser

export const setUser = (user) => {
  currentUser = user
    ? { id: user.id, nome: user.nome ?? '', email: user.email ?? '', papel: user.papel }
    : null
  listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSessionUser = () => useSyncExternalStore(subscribe, getUser)
