import React from 'react';
import { CheckCircle2, Link } from 'lucide-react';

const ConfiguracoesTab = ({
    isGoogleConnected,
    loadingGoogle,
    handleConnectGoogle,
    handleDisconnectGoogle
}) => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center mb-10">
                <h3 className="text-3xl font-black text-slate-900 mb-2">Configurações Gerais</h3>
                <p className="text-slate-500 font-medium">Gerencie integrações e preferências do sistema.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card Integração Google */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110 duration-500 opacity-50" />

                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-slate-50">
                                <svg className="w-8 h-8" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Google Calendar</h4>
                                <p className="text-xs font-bold text-blue-600/60 uppercase">Sincronização Ativa</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className={`p-6 rounded-3xl border transition-all duration-500 ${isGoogleConnected ? 'bg-green-50/50 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="flex items-center gap-4">
                                    {isGoogleConnected ? (
                                        <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-200 animate-pulse">
                                            <CheckCircle2 size={24} />
                                        </div>
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                                            <Link size={24} />
                                        </div>
                                    )}
                                    <div>
                                        <p className={`text-sm font-black uppercase ${isGoogleConnected ? 'text-green-800' : 'text-slate-600'}`}>
                                            {isGoogleConnected ? 'Sua conta está vinculada' : 'Nenhuma conta vinculada'}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                            {isGoogleConnected ? 'Reservas aprovadas aparecem na agenda Google' : 'Conecte para sincronizar as reservas automaticamente.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {!isGoogleConnected ? (
                                <button
                                    onClick={handleConnectGoogle}
                                    disabled={loadingGoogle}
                                    className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                >
                                    {loadingGoogle ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <><Link size={18} /> Conectar ao Google</>
                                    )}
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-center gap-2 py-4 px-6 bg-white border border-slate-200 rounded-3xl text-slate-400 text-xs font-bold uppercase tracking-widest">
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm" />
                                        Integração Operacional
                                    </div>
                                    <button
                                        onClick={handleDisconnectGoogle}
                                        disabled={loadingGoogle}
                                        className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all"
                                    >
                                        Desvincular Conta
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Card de Informações do Sistema */}
                <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all" />

                    <h4 className="text-white text-xl font-black uppercase tracking-tight mb-6">Informações</h4>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <span className="text-slate-400 text-xs font-bold uppercase">Versão do Sistema</span>
                            <span className="text-white text-sm font-mono">2.4.0-stable</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <span className="text-slate-400 text-xs font-bold uppercase">Ambiente</span>
                            <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-black uppercase border border-green-500/30">Produção</span>
                        </div>
                        <div className="flex justify-between items-center py-3">
                            <span className="text-slate-400 text-xs font-bold uppercase">Campus</span>
                            <span className="text-white text-sm font-bold italic">Ananindeua - XXII</span>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                            O SIGRE é um sistema focado na alta produtividade e gestão ágil de recursos acadêmicos.
                            Para suporte, entre em contato com a equipe de TI local.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfiguracoesTab;
