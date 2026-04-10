import React from 'react';
import { Users, GraduationCap, BookOpen, XCircle } from 'lucide-react';

const PAPEL_STYLES = {
    aluno:     { label: 'Aluno',     bg: '#ede9fe', color: '#7c3aed' },
    professor: { label: 'Professor', bg: '#dbeafe', color: '#1d4ed8' },
};

const UsuarioCard = ({ u, onAprovar, onRecusar, onDeletar, showAprovar, showDesativar, showReativar }) => {
    const PapelIcon = u.papel === 'professor' ? BookOpen : GraduationCap;
    const papelCfg = PAPEL_STYLES[u.papel] || PAPEL_STYLES.aluno;

    return (
        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm transition-all group">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: papelCfg.bg }}>
                    <PapelIcon size={16} style={{ color: papelCfg.color }} />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-sm">{u.nome}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: papelCfg.bg, color: papelCfg.color }}>
                            {papelCfg.label}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500">@{u.username} · {u.email}</p>
                </div>
            </div>
            <div className="flex gap-2 ml-4">
                {showAprovar && (
                    <>
                        <button onClick={() => onRecusar(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-500 hover:bg-red-50">Recusar</button>
                        <button onClick={() => onAprovar(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700">Aprovar</button>
                    </>
                )}
                {showDesativar && (
                    <button onClick={() => onRecusar(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold border text-gray-400 hover:bg-gray-50">Desativar</button>
                )}
                {showReativar && (
                    <button onClick={() => onAprovar(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-green-200 text-green-600 hover:bg-green-50">Ativar</button>
                )}
                <button onClick={() => onDeletar(u.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                    <XCircle size={18} />
                </button>
            </div>
        </div>
    );
};

export default function UserManagement({ usuarios, onAprovar, onRecusar, onDeletar }) {
    const pendentes = usuarios.filter(u => u.status === 'pendente');
    const ativos = usuarios.filter(u => u.status === 'aprovado');
    const recusados = usuarios.filter(u => u.status === 'recusado');

    if (usuarios.length === 0) {
        return (
            <div className="text-center py-20 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
                <Users size={48} className="mx-auto mb-4 text-gray-200" />
                <p className="text-gray-400 font-medium text-lg italic">Nenhum usuário cadastrado ainda</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight italic">GERENCIAR USUÁRIOS</h3>
                <p className="text-sm text-gray-500">Controle de acesso e permissões do Campus.</p>
            </div>

            {pendentes.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> Aguardando Aprovação
                    </h4>
                    {pendentes.map(u => (
                        <UsuarioCard key={u.id} u={u} onAprovar={onAprovar} onRecusar={onRecusar} onDeletar={onDeletar} showAprovar />
                    ))}
                </div>
            )}

            {ativos.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" /> Usuários Ativos
                    </h4>
                    {ativos.map(u => (
                        <UsuarioCard key={u.id} u={u} onAprovar={onAprovar} onRecusar={onRecusar} onDeletar={onDeletar} showDesativar />
                    ))}
                </div>
            )}

            {recusados.length > 0 && (
                <div className="space-y-3 opacity-60">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400" /> Inativos/Recusados
                    </h4>
                    {recusados.map(u => (
                        <UsuarioCard key={u.id} u={u} onAprovar={onAprovar} onRecusar={onRecusar} onDeletar={onDeletar} showReativar />
                    ))}
                </div>
            )}
        </div>
    );
}