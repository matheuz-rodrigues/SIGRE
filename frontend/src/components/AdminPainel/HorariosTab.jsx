import React from 'react';
import { Plus, Link, ArrowRight } from 'lucide-react';
import ScheduleViiew from '../Schedule/ScheduleViiew';

const normalizeStatus = (status) => {
    if (!status) return 'pendente'
    const s = status.toLowerCase()
    if (s === 'pending') return 'pendente'
    if (s === 'approved') return 'aprovado'
    if (s === 'rejected' || s === 'recusado' || s === 'refused') return 'recusado'
    return s
}

const HorariosTab = ({ metrics, isGoogleConnected, handleConnectGoogle, setHorarioEdit, setShowForm }) => {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* BANNER DE STATUS GOOGLE */}
            {!isGoogleConnected && (
                <div className="mb-8 p-6 rounded-[2rem] bg-amber-50 border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4 group slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-200/50 flex items-center justify-center shrink-0">
                            <Link size={20} className="text-amber-700" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-amber-900 uppercase italic">Sua conta do Google não está conectada</p>
                            <p className="text-xs text-amber-700/70 font-medium w-full max-w-sm">
                                As reservas não serão sincronizadas automaticamente com o Google Calendar.
                            </p>
                        </div>
                    </div>
                    <button onClick={handleConnectGoogle} className="px-6 py-3 bg-amber-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-800 transition-all shadow-lg shadow-amber-200 flex items-center gap-2 max-w-max">
                        Conectar Agora <ArrowRight size={14} />
                    </button>
                </div>
            )}

            {metrics && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Alocações</p>
                        <p className="text-2xl font-black text-gray-900">{metrics.total ?? 0}</p>
                    </div>
                    {Object.entries(metrics.status || {}).map(([k, v]) => (
                        <div key={k} className="rounded-xl border border-gray-100 bg-white p-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{normalizeStatus(k)}</p>
                            <p className="text-2xl font-black text-indigo-900">{v}</p>
                        </div>
                    ))}
                </div>
            )}
            
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950 space-y-2">
                <p className="font-bold text-indigo-900">Registrar aulas e ocupação de salas</p>
                <ul className="list-disc pl-5 text-xs text-indigo-900/85 leading-relaxed space-y-1">
                    <li>
                        <strong>Novo horário</strong> abre o assistente completo (sala, disciplina, professor e curso).
                    </li>
                    <li>
                        Pedidos de espaço feitos por alunos ou professores aparecem em <strong>Solicitações</strong> para aprovação.
                    </li>
                </ul>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" onClick={() => { setHorarioEdit(null); setShowForm(true) }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-md hover:opacity-95 transition-opacity"
                    style={{ background: 'linear-gradient(135deg,#1c1aa3,#4f46e5)' }}>
                    <Plus size={16} /> Novo horário
                </button>
            </div>
            <ScheduleViiew isAdmin={true} />
        </div>
    );
};

export default HorariosTab;
