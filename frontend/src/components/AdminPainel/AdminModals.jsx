import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Bell } from 'lucide-react';

const AdminModals = ({
    conflito,
    setConflito,
    handleFinalizarAprovacao,
    modalConfirmDisconnect,
    setModalConfirmDisconnect,
    confirmDisconnect,
    modalFeedback,
    setModalFeedback
}) => {
    return (
        <>
            {/* MODAL DE CONFLITO */}
            {conflito && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-100 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="p-6 bg-red-50 border-b border-red-100 flex items-center gap-3">
                            <AlertTriangle className="text-red-600" size={24} />
                            <h3 className="text-lg font-black text-red-900 uppercase">Conflito Detectado</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Evento Atual:</p>
                                <p className="text-sm font-bold text-gray-800">{conflito.antiga.motivo}</p>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed text-center">
                                Deseja substituir este evento pela solicitação de <strong>{conflito.nova.solicitante}</strong>?
                                O usuário anterior será notificado do cancelamento.
                            </p>
                            <div className="flex flex-col gap-2 pt-2">
                                <button onClick={() => handleFinalizarAprovacao(conflito.nova.id, true)}
                                    className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200">
                                    SUBSTITUIR E APROVAR
                                </button>
                                <button onClick={() => setConflito(null)}
                                    className="w-full py-3 bg-white text-slate-500 rounded-xl font-bold text-sm border border-slate-200">
                                    CANCELAR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CONFIRMAÇÃO DE DESCONEXÃO GOOGLE */}
            {modalConfirmDisconnect && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <AlertTriangle className="text-red-600" size={32} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase italic">Desvincular Conta?</h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Você deixará de sincronizar suas reservas automaticamente com o Google Calendar.
                            </p>
                            <div className="flex flex-col gap-3 mt-8">
                                <button onClick={confirmDisconnect}
                                    className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-200 transition-all">
                                    Sim, Desvincular
                                </button>
                                <button onClick={() => setModalConfirmDisconnect(false)}
                                    className="w-full py-4 bg-white text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-100 hover:bg-slate-50 transition-all">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE FEEDBACK (SUCESSO/ERRO) */}
            {modalFeedback.show && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[210] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-8 text-center">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${modalFeedback.type === 'success' ? 'bg-green-50 text-green-600' :
                                modalFeedback.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                }`}>
                                {modalFeedback.type === 'success' ? <CheckCircle2 size={32} /> :
                                    modalFeedback.type === 'error' ? <XCircle size={32} /> : <Bell size={32} />}
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase italic">{modalFeedback.title}</h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                {modalFeedback.message}
                            </p>
                            <button onClick={() => setModalFeedback({ ...modalFeedback, show: false })}
                                className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AdminModals;
