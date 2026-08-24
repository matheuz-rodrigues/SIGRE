import logo from '../../assets/logouepa.png'
import { LogOut, GraduationCap, BookOpen, Shield } from 'lucide-react'

const roleLabels = {
  admin:        { label: 'Administrador',  Icon: Shield },
  aluno:        { label: 'Aluno',          Icon: GraduationCap },
  professor:    { label: 'Professor',      Icon: BookOpen },
  tecnico_adm:  { label: 'Técnico Adm.',  Icon: BookOpen },
}

const Header = ({ isAdmin, setIsAdmin, userRole, onLogOut }) => {
  const roleInfo = userRole ? roleLabels[userRole] : null
  const RoleIcon = roleInfo?.Icon

  return (
    <header className='bg-[linear-gradient(200deg,#0f0c29_2%,#1c1aa3_50%,#150355_100%)] shadow-md'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex justify-between items-center py-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-white rounded-lg px-3 py-2 shadow-sm'>
              <img src={logo} alt="Logo UEPA" className='h-16 object-contain' />
            </div>
          </div>

          <div className='flex items-center gap-3'>
            {/* Badge do usuário logado (aluno/professor) */}
            {userRole && !isAdmin && roleInfo && (
              <div className='hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm'>
                <RoleIcon size={15} />
                <span className='font-semibold'>{roleInfo.label}</span>
              </div>
            )}

            {/* Botão logout para aluno/professor */}
            {userRole && !isAdmin && onLogOut && (
              <button
                onClick={onLogOut}
                className='flex items-center gap-2 bg-white/10 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-500/70 hover:-translate-y-0.5 transition-all duration-200 shadow-sm text-sm'
              >
                <LogOut size={16} />
                Sair
              </button>
            )}


          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
