import { useState, useEffect } from 'react'
import Header from './components/Header/Header'
import { getCookie } from "./utils/cookieUtils";
import { ScheduleProvider } from './components/Schedule/ScheduleContext'
import ScheduleViiew from './components/Schedule/ScheduleViiew'
import Footer from './components/Footer/Footer'
import Login from './components/Login/Login'
import Protection from './components/Protection/Protection'
import UserView from './components/UserView/UserView'
import { clearSession, fetchCurrentUser, applyUserProfile } from './services/AuthService'

const getInitialRole  = () => getCookie('userRole') || null
const getInitialAdmin = () =>
  getCookie('userRole') === 'admin' ||
  getCookie('isAdminAuthenticated') === 'true'

function App() {
  const [userRole, setUserRole]   = useState(getInitialRole)
  const [isAdmin,  setIsAdmin]    = useState(getInitialAdmin)
  const [showLogin, setShowLogin] = useState(true)

  const isAuthenticated = userRole !== null

  useEffect(() => {
    const token = getCookie('access_token')
    if (!token) return
    fetchCurrentUser()
      .then((me) => {
        applyUserProfile(me)
        const byTipo = { 1: 'aluno', 2: 'professor', 3: 'admin' }
        const papel = me.papel || byTipo[me.tipo_usuario] || 'aluno'
        setUserRole(papel)
        if (papel === 'admin') setIsAdmin(true)
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          clearSession()
          setUserRole(null)
          setIsAdmin(false)
        }
      })
  }, [])

  const handleSuccessLogin = (role) => {
    setUserRole(role)
    if (role === 'admin') setIsAdmin(true)
    setShowLogin(false)
  }

  const handleLogOut = () => {
    clearSession()
    localStorage.removeItem('isAdminAuthenticated')
    
    setUserRole(null)
    setIsAdmin(false)
    setShowLogin(true)
  }

  if (isAdmin && isAuthenticated) {
    return (
      <ScheduleProvider key={`auth-${userRole}`}>
        <Protection onLogOut={handleLogOut} />
        <Footer />
      </ScheduleProvider>
    )
  }

  if (isAuthenticated && !isAdmin) {
    return (
      <ScheduleProvider key={`auth-${userRole}`}>
        <UserView userRole={userRole} onLogOut={handleLogOut} />
      </ScheduleProvider>
    )
  }

  if (showLogin) {
    return (
      <>
        <Header isAdmin={true} setIsAdmin={() => setShowLogin(false)} />
        <Login onLoginSuccess={handleSuccessLogin} />
      </>
    )
  }

  return (
    <ScheduleProvider key="public">
      <div className='min-h-screen bg-gray-50'>
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
