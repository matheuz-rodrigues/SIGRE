import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

const AdminHeader = ({ activeTab, setActiveTab, setShowImport, TABS }) => {
    return (
        <div className="px-8 py-6 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}>
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white">Painel Administrativo</h2>
                    <p className="text-blue-200 text-sm mt-0.5 italic">Campus XXII — Ananindeua</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white/90 bg-white/10 border border-white/20 hover:bg-white/20 transition-all">
                        <FileSpreadsheet size={16} /> Relatórios
                    </button>
                </div>
            </div>

            <div className="flex gap-1 mt-6 overflow-x-auto">
                {TABS.map(({ key, label, Icon, badge }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeTab === key ? 'bg-white/20 text-white shadow-inner' : 'text-white/50 hover:bg-white/5'}`}>
                        <Icon size={15} />
                        {label}
                        {badge && <span className="ml-1 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-black flex items-center justify-center">{badge}</span>}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AdminHeader;
