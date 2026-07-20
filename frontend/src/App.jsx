import { useState, useEffect } from 'react'
import Header from './components/Header/Header'
import { ScheduleProvider } from './components/Schedule/ScheduleContext'
import ScheduleViiew from './components/Schedule/ScheduleViiew'
import Footer from './components/Footer/Footer'
import Login from './components/Login/Login'
import Protection from './components/Protection/Protection'
import UserView from './components/UserView/UserView'
import { clearSession, fetchCurrentUser, applyUserProfile } from './services/AuthService'

const getInitialRole  = () => localStorage.getItem('userRole') || null
const getInitialAdmin = () =>
  localStorage.getItem('userRole') === 'admin' ||
  localStorage.getItem('isAdminAuthenticated') === 'true'

function App() {
  const [userRole, setUserRole]   = useState(getInitialRole)
  const [isAdmin,  setIsAdmin]    = useState(getInitialAdmin)
  const [showLogin, setShowLogin] = useState(true)
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState(null)

  const isAuthenticated = userRole !== null

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    fetchCurrentUser()
      .then((me) => {
        applyUserProfile(me)
        const byTipo = { 1: 'aluno', 2: 'professor', 3: 'admin', 4: 'tecnico_adm' }
        const papel = me.papel || byTipo[me.tipo_usuario] || 'aluno'
        setUserRole(papel)
        if (papel === 'admin' || papel === 'tecnico_adm') setIsAdmin(true)
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          clearSession()
          setUserRole(null)
          setIsAdmin(false)
        }
      })
  }, [])

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession()
      localStorage.removeItem('isAdminAuthenticated')
      setUserRole(null)
      setIsAdmin(false)
      setShowLogin(true)
      setSessionExpiredMsg('Sua sessão expirou. Faça login novamente.')
      setTimeout(() => setSessionExpiredMsg(null), 5000)
    }

    window.addEventListener('session-expired', handleSessionExpired)
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired)
    }
  }, [])

  const handleSuccessLogin = (role) => {
    setUserRole(role)
    if (role === 'admin' || role === 'tecnico_adm') setIsAdmin(true)
    setShowLogin(false)
    setSessionExpiredMsg(null)
  }

  const handleLogOut = () => {
    clearSession()
    localStorage.removeItem('isAdminAuthenticated')
    
    setUserRole(null)
    setIsAdmin(false)
    setShowLogin(true)
  }

  const SessionExpiredToast = () => {
    if (!sessionExpiredMsg) return null
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-100 border border-amber-400 text-amber-800 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span>{sessionExpiredMsg}</span>
        <button onClick={() => setSessionExpiredMsg(null)} className="ml-2 text-amber-600 hover:text-amber-800 font-bold">&times;</button>
      </div>
    )
  }

  if (isAdmin && isAuthenticated) {
    return (
      <ScheduleProvider key={`auth-${userRole}`}>
        <SessionExpiredToast />
        <Protection onLogOut={handleLogOut} />
        <Footer />
      </ScheduleProvider>
    )
  }

  if (isAuthenticated && !isAdmin) {
    return (
      <ScheduleProvider key={`auth-${userRole}`}>
        <SessionExpiredToast />
        <UserView userRole={userRole} onLogOut={handleLogOut} />
      </ScheduleProvider>
    )
  }

  if (showLogin) {
    return (
      <>
        <SessionExpiredToast />
        <Header isAdmin={true} setIsAdmin={() => setShowLogin(false)} />
        <Login onLoginSuccess={handleSuccessLogin} />
      </>
    )
  }

  return (
    <ScheduleProvider key="public">
      <div className='min-h-screen bg-gray-50'>
        <SessionExpiredToast />
        <Header
          isAdmin={false}
          setIsAdmin={() => setShowLogin(true)}
        />
        <main className='max-w-7xl mx-auto px-4 sm:px-5 lg:px-8 py-8'>
          <ScheduleViiew/>
        </main>
        <Footer />
      </div>
    </ScheduleProvider>
  )
}

export default App
