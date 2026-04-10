import { useState } from 'react'
import Header from './components/Header/Header'
import { ScheduleProvider } from './components/Schedule/ScheduleContext'
import ScheduleViiew from './components/Schedule/ScheduleViiew'
import Footer from './components/Footer/Footer'
import Login from './components/Login/Login'
import Protection from './components/Protection/Protection'
import UserView from './components/UserView/UserView'

const getInitialRole  = () => localStorage.getItem('userRole') || null
const getInitialAdmin = () =>
  localStorage.getItem('isAdminAuthenticated') === 'true' &&
  localStorage.getItem('userRole') === 'admin'

function App() {
  const [userRole, setUserRole]   = useState(getInitialRole)
  const [isAdmin,  setIsAdmin]    = useState(getInitialAdmin)
  const [showLogin, setShowLogin] = useState(true)

  const isAuthenticated = userRole !== null

  const handleSuccessLogin = (role) => {
    setUserRole(role)
    if (role === 'admin') setIsAdmin(true)
    setShowLogin(false)
  }

  const handleLogOut = () => {
    localStorage.removeItem('isAdminAuthenticated')
    localStorage.removeItem('adminUser')
    localStorage.removeItem('userRole')
    setUserRole(null)
    setIsAdmin(false)
    setShowLogin(true)
  }

  if (isAdmin && isAuthenticated) {
    return (
      <ScheduleProvider>
        <Protection onLogOut={handleLogOut} />
        <Footer />
      </ScheduleProvider>
    )
  }

  if (isAuthenticated && !isAdmin) {
    return (
      <ScheduleProvider>
        <UserView userRole={userRole} onLogOut={handleLogOut} />
      </ScheduleProvider>
    )
  }

  if (showLogin) {
    return (
      <ScheduleProvider>
        <Header isAdmin={true} setIsAdmin={() => setShowLogin(false)} />
        <Login onLoginSuccess={handleSuccessLogin} />
      </ScheduleProvider>
    )
  }

  return (
    <ScheduleProvider>
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
