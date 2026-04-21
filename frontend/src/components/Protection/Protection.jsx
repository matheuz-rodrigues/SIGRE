import { LogOut, User, Bell, ChevronDown, Shield } from 'lucide-react'
import { getCookie } from '../../utils/cookieUtils'
import AdminPainel from '../AdminPainel/AdminPainel'
import logo from '../../assets/logouepa.png'

const Protection = ({ onLogOut }) => {
    const adminUser = getCookie('adminUser') || 'Admin'

    return (
        <div className="min-h-screen bg-gray-50">

            {/* ── Header ── */}
            <header style={{ background: 'linear-gradient(90deg, #1c1aa3 0%, #150355 100%)' }}
                className="shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">

                        <div className="flex items-center gap-4">
                            <img src={logo} alt="Logo UEPA" className="h-10 object-contain" />
                            <div className="hidden sm:block w-px h-8 bg-white/20" />
                            <div className="hidden sm:block">
                                <p className="text-xs font-bold text-blue-200 tracking-widest uppercase">SIGRE</p>
                                <p className="text-[10px] text-blue-300/60">Sistema Integrado de Gestão de Reservas Acadêmicas</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Avatar + nome */}
                            <div className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3 py-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #1c1aa3)' }}>
                                    <Shield size={14} className="text-white" />
                                </div>
                                <div className="hidden sm:block">
                                    <p className="text-white text-xs font-bold leading-none">{adminUser}</p>
                                    <p className="text-blue-300 text-[10px] mt-0.5">Administrador</p>
                                </div>
                            </div>

                            <button onClick={onLogOut}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-red-500/60 text-white text-xs font-semibold transition-all duration-200">
                                <LogOut size={14} />
                                <span className="hidden sm:inline">Sair</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* ── Conteúdo ── */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <AdminPainel />
            </main>
        </div>
    )
}

export default Protection
