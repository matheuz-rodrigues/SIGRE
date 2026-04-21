import React, { useState } from 'react';
import { History, AlertTriangle, ChevronDown, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_STYLES = {
    pendente: { label: 'Pendente', bg: '#fef9c3', color: '#ca8a04', dot: '#eab308', border: '#fde68a' },
    aprovado: { label: 'Aprovado', bg: '#dcfce7', color: '#16a34a', dot: '#22c55e', border: '#bbf7d0' },
    recusado: { label: 'Recusado', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444', border: '#fecaca' },
}

const SolicitacoesTab = ({ 
    solicitacoes, 
    handleCheckAprovar, 
    handleRecusarSolicitacao 
}) => {
    const [filtroStatus, setFiltroStatus] = useState('todos');
    const [currentPage, setCurrentPage] = useState(1);
    const [busca, setBusca] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({});
    const solsPerPage = 10;

    const solicitacoesFilter = solicitacoes.filter(s => {
        if (filtroStatus !== 'todos' && s.status !== filtroStatus) return false;
        if (busca) return s.solicitante.toLowerCase().includes(busca.toLowerCase()) || 
                          s.motivo.toLowerCase().includes(busca.toLowerCase());
        return true;
    });

    const solicitacoesPaginadas = solicitacoesFilter.slice((currentPage - 1) * solsPerPage, currentPage * solsPerPage);

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-gray-900 italic uppercase">Solicitações de Espaço</h3>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                        {['todos', 'pendente', 'aprovado', 'recusado'].map(s => (
                            <button key={s} onClick={() => { setFiltroStatus(s); setCurrentPage(1); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${filtroStatus === s ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-400'}`}>
                                {s === 'todos' ? 'Ver Tudo' : STATUS_STYLES[s].label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 border-l border-gray-100 pl-3">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                            className="p-2 rounded-lg hover:bg-gray-50 disabled:opacity-20 transition-all">
                            <ChevronDown size={18} className="rotate-90" />
                        </button>
                        <span className="text-[10px] font-black text-gray-400 uppercase">Pág. {currentPage}</span>
                        <button disabled={solicitacoesPaginadas.length < solsPerPage || solicitacoesFilter.length <= currentPage * solsPerPage}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="p-2 rounded-lg hover:bg-gray-50 disabled:opacity-20 transition-all">
                            <ChevronDown size={18} className="-rotate-90" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {solicitacoesPaginadas.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 border border-gray-100">
                            <History size={24} className="text-gray-300" />
                        </div>
                        <p className="text-gray-400 font-medium">Nenhuma solicitação encontrada</p>
                    </div>
                ) : solicitacoesPaginadas.map((sol) => (
                    <div key={`${sol.type}-${sol.id}`} className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                        <div className="p-5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-1.5 h-12 rounded-full" style={{ background: sol.type === 'internal' ? '#fbbf24' : '#6366f1' }} />
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-black text-gray-900 uppercase tracking-tight">{sol.solicitante}</h4>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${sol.type === 'internal' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                            {sol.type === 'internal' ? 'Série Interna' : 'Solicitação'}
                                        </span>
                                        {sol.temConflito && (
                                            <span className="flex items-center gap-1 bg-red-50 text-red-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase border border-red-100 animate-pulse">
                                                <AlertTriangle size={10} /> Conflito Detectado
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 font-medium leading-none">
                                        {sol.salaNome} — {sol.horario} — {sol.type === 'internal' ? `${sol.series?.length || 0} datas` : sol.dataEvento || sol.diaSemana}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="text-right mr-4 hidden sm:block">
                                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{sol.type === 'internal' ? 'Reserva Direta' : 'Pedido de Espaço'}</p>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${sol.status === 'pendente' ? 'bg-amber-50 text-amber-600' :
                                            sol.status === 'aprovado' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                                        }`}>
                                        {sol.status.toUpperCase()}
                                    </span>
                                </div>

                                {sol.type === 'internal' && (
                                    <button onClick={() => setExpandedGroups(prev => ({ ...prev, [sol.id]: !prev[sol.id] }))}
                                        className="p-2 rounded-xl hover:bg-gray-50 text-gray-400 transition-all">
                                        <ChevronDown size={18} className={`transition-transform duration-300 ${expandedGroups[sol.id] ? 'rotate-180' : ''}`} />
                                    </button>
                                )}

                                {sol.status === 'pendente' && !expandedGroups[sol.id] && (
                                    <div className="flex gap-2">
                                        <button onClick={() => handleRecusarSolicitacao(sol)}
                                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all">
                                            <XCircle size={18} />
                                        </button>
                                        <button onClick={() => handleCheckAprovar(sol)}
                                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-all">
                                            <CheckCircle2 size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* VISÃO EXPANDIDA (SÉRIE) */}
                        {expandedGroups[sol.id] && sol.series && (
                            <div className="px-5 pb-5 border-t border-gray-50 bg-gray-50/30">
                                <div className="flex items-center justify-between py-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Datas da Série</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {sol.series.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-gray-100 shadow-sm animate-in fade-in slide-in-from-top-1">
                                            <div>
                                                <p className="text-xs font-bold text-gray-700">{item.data}</p>
                                                <p className="text-[10px] text-gray-400 uppercase">{item.diaSemana}</p>
                                            </div>
                                            <span className={`text-[9px] font-bold uppercase ${item.status === 'aprovado' ? 'text-green-500' : (item.status === 'recusado' ? 'text-red-500' : 'text-orange-500')}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SolicitacoesTab;
