import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import api from '../../services/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    Upload, Download, X, CheckCircle2, AlertCircle,
    FileSpreadsheet, Users, Building2, BookOpen, GraduationCap,
    ChevronRight, Loader2, FileDown, History, UserCheck, FileText
} from 'lucide-react'



const ABAS_CONFIG = {
    Professores: {
        icon: Users, color: '#1d4ed8', colorBg: '#dbeafe',
        colunas: ['Nome', 'Email', 'Matricula'],
        endpoint: '/professors/',
        toPayload: (row) => ({
            nomeProf:      row['Nome']?.toString().trim(),
            emailProf:     row['Email']?.toString().trim(),
            matriculaProf: row['Matricula']?.toString().trim(),
        }),
        label: (row) => row['Nome'],
    },
    Disciplinas: {
        icon: BookOpen, color: '#7c3aed', colorBg: '#ede9fe',
        colunas: ['Nome', 'Codigo'],
        endpoint: '/disciplines/',
        toPayload: (row) => ({
            nomeDisciplina:      row['Nome']?.toString().trim(),
            matriculaDisciplina: row['Codigo']?.toString().trim(),
        }),
        label: (row) => row['Nome'],
    },
    Cursos: {
        icon: GraduationCap, color: '#0891b2', colorBg: '#cffafe',
        colunas: ['Nome', 'Sigla', 'Cor'],
        endpoint: '/courses/',
        toPayload: (row) => ({
            nomeCurso:  row['Nome']?.toString().trim(),
            siglaCurso: row['Sigla']?.toString().trim(),
            corCurso:   row['Cor']?.toString().trim() || '#3b82f6',
        }),
        label: (row) => row['Nome'],
    },
    Salas: {
        icon: Building2, color: '#059669', colorBg: '#d1fae5',
        colunas: ['Nome', 'Tipo'],
        endpoint: '/rooms/',
        toPayload: (row) => {
            const raw = row['Tipo']?.toString().toLowerCase().trim() || '';
            let tipoId = 3; // Padrão: Sala de Aula
            if (raw.includes('lab')) tipoId = 1;
            else if (raw.includes('audi')) tipoId = 2;
            else if (raw.includes('estudo')) tipoId = 4;

            return {
                nomeSala: row['Nome']?.toString().trim(),
                tipoSalaId: tipoId,
            };
        },
        label: (row) => row['Nome'],
    },
}

// ─── Gera planilha modelo ─────────────────────────────────────────────
const baixarModelo = () => {
    const wb = XLSX.utils.book_new()
    const exemplos = {
        Professores: [['Nome', 'Email', 'Matricula'], ['João Silva', 'joao.silva@uepa.br', '123456'], ['Maria Souza', 'maria.souza@uepa.br', '654321']],
        Disciplinas: [['Nome', 'Codigo'], ['Cálculo I', 'MAT001'], ['Física Geral', 'FIS001']],
        Cursos:      [['Nome', 'Sigla', 'Cor'], ['Engenharia de Software', 'BES', '#3b82f6'], ['Licenciatura em Matemática', 'MAT', '#f59e0b']],
        Salas:       [['Nome', 'Tipo'], ['Sala 01', 'Sala de Aula'], ['Lab 01', 'Laboratório']],
    }
    Object.entries(exemplos).forEach(([nome, dados]) => {
        const ws = XLSX.utils.aoa_to_sheet(dados)
        ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 15 }]
        XLSX.utils.book_append_sheet(wb, ws, nome)
    })
    XLSX.writeFile(wb, 'modelo-importacao-sca-uepa.xlsx')
}

// ─── Componente principal ─────────────────────────────────────────────
const ImportarPlanilha = ({ onClose, onImportado }) => {
    const inputRef = useRef(null)
    const [etapa, setEtapa] = useState('inicio') // inicio | preview | importando | resultado
    const [dadosPreview, setDadosPreview] = useState({})
    const [errosPreview, setErrosPreview] = useState({})
    const [resultado, setResultado] = useState({})
    const [nomeArquivo, setNomeArquivo] = useState('')
    
    // Novos estados para controle de exportação
    const [exportando, setExportando] = useState(null) 
    const [formatoDownload, setFormatoDownload] = useState('excel') // 'excel' | 'pdf'

    const handleArquivo = (e) => {
        const file = e.target.files[0]
        if (!file) return
        setNomeArquivo(file.name)
        const reader = new FileReader()
        
        // Usando readAsArrayBuffer conforme correção anterior
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'array' })
            const preview = {}
            const erros = {}
            Object.keys(ABAS_CONFIG).forEach(abaEsperada => {
                if (!wb.SheetNames.includes(abaEsperada)) return
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[abaEsperada])
                const cfg = ABAS_CONFIG[abaEsperada]
                const errosAba = []
                rows.forEach((row, i) => {
                    cfg.colunas.forEach(col => {
                        if (!row[col] || row[col].toString().trim() === '')
                            errosAba.push(`Linha ${i + 2}: "${col}" está vazia`)
                    })
                })
                preview[abaEsperada] = rows
                if (errosAba.length > 0) erros[abaEsperada] = errosAba
            })
            setDadosPreview(preview)
            setErrosPreview(erros)
            setEtapa('preview')
        }
        reader.readAsArrayBuffer(file)
    }

    const handleImportar = async () => {
        setEtapa('importando')
        const res = {}
        for (const [aba, rows] of Object.entries(dadosPreview)) {
            const cfg = ABAS_CONFIG[aba]
            let ok = 0, erros = 0
            for (const row of rows) {
                try { await api.post(cfg.endpoint, cfg.toPayload(row)); ok++ }
                catch { erros++ }
            }
            res[aba] = { ok, erros, total: rows.length }
        }
        setResultado(res)
        setEtapa('resultado')
        if (onImportado) onImportado()
    }

    // ─── Lógica de Exportação Dinâmica (Excel e PDF) ───────────────────
    const gerarRelatorio = async (tipo) => {
        setExportando(tipo)
        try {
            const dataStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
            const conjuntosDeDados = [] // Array para guardar os blocos de dados antes de renderizar

            // 1. Busca e formatação dos dados
            if (tipo === 'cadastros') {
                const res = await api.get('/reports/base')
                const { professors, disciplines, courses, rooms } = res.data
                
                conjuntosDeDados.push({
                    titulo: 'Professores',
                    colunas: ['Nome', 'Email', 'Matrícula'],
                    linhas: professors.map(p => ({ Nome: p.nomeProf, Email: p.emailProf, Matricula: p.matriculaProf }))
                })
                conjuntosDeDados.push({
                    titulo: 'Disciplinas',
                    colunas: ['Nome', 'Código'],
                    linhas: disciplines.map(d => ({ Nome: d.nomeDisciplina, Codigo: d.matriculaDisciplina }))
                })
                conjuntosDeDados.push({
                    titulo: 'Cursos',
                    colunas: ['Nome', 'Sigla', 'Cor'],
                    linhas: courses.map(c => ({ Nome: c.nomeCurso, Sigla: c.siglaCurso, Cor: c.corCurso }))
                })
                conjuntosDeDados.push({
                    titulo: 'Salas',
                    colunas: ['Nome', 'Tipo'],
                    linhas: rooms.map(s => ({ Nome: s.nomeSala, Tipo: s.tipoSala || 'Sala de Aula' }))
                })
            } 
            else if (tipo === 'usuarios') {
                const res = await api.get('/reports/users')
                conjuntosDeDados.push({
                    titulo: 'Usuários do Sistema',
                    colunas: ['Nome', 'Email', 'Papel', 'Status'],
                    linhas: res.data.map(u => ({ Nome: u.Nome, Email: u.Email, Papel: u.Papel, Status: u.Status }))
                })
            }
            else if (tipo === 'horarios') {
                const res = await api.get('/reports/history')
                conjuntosDeDados.push({
                    titulo: 'Histórico de Horários',
                    colunas: ['Data', 'Horário', 'Professor', 'Disciplina', 'Sala'],
                    linhas: res.data.map(h => ({ Data: h.Data, Horário: h.Horário, Professor: h.Professor, Disciplina: h.Disciplina, Sala: h.Sala }))
                })
            }

            // 2. Geração do Arquivo de acordo com o formato escolhido
            if (formatoDownload === 'excel') {
                const wb = XLSX.utils.book_new()
                conjuntosDeDados.forEach(conjunto => {
                    const ws = conjunto.linhas.length > 0
                        ? XLSX.utils.json_to_sheet(conjunto.linhas)
                        : XLSX.utils.aoa_to_sheet([conjunto.colunas])
                    ws['!cols'] = conjunto.colunas.map(() => ({ wch: 25 })) // Largura padrão
                    XLSX.utils.book_append_sheet(wb, ws, conjunto.titulo.substring(0, 31)) // Limite de 31 chars por aba
                })
                XLSX.writeFile(wb, `relatorio-${tipo}-sca-uepa-${dataStr}.xlsx`)
            } 
            else if (formatoDownload === 'pdf') {
                const doc = new jsPDF()
                let yAtual = 15

                doc.setFontSize(16)
                doc.text(`Relatório do Sistema - ${dataStr}`, 14, yAtual)
                yAtual += 10

                conjuntosDeDados.forEach((conjunto, index) => {
                    if (index > 0 && yAtual > 250) { // Quebra de página se estiver no fim
                        doc.addPage()
                        yAtual = 20
                    }

                    doc.setFontSize(12)
                    doc.text(conjunto.titulo, 14, yAtual)
                    
                    const linhasFormatoArray = conjunto.linhas.map(linha => Object.values(linha))
                    
                    autoTable(doc, {
                        head: [conjunto.colunas],
                        body: linhasFormatoArray.length > 0 ? linhasFormatoArray : [['Nenhum registro encontrado']],
                        startY: yAtual + 3,
                        theme: 'grid',
                        styles: { fontSize: 9, cellPadding: 3 },
                        headStyles: { fillColor: [28, 26, 163] }, // Cor azul do header
                        margin: { top: 15 }
                    })
                    
                    yAtual = doc.lastAutoTable.finalY + 15 // Atualiza a posição Y para a próxima tabela
                })

                doc.save(`relatorio-${tipo}-sca-uepa-${dataStr}.pdf`)
            }

        } catch (err) {
            console.error(err)
            alert(`Erro ao exportar relatório. Verifique se o servidor está rodando.`)
        } finally {
            setExportando(null)
        }
    }

    const totalLinhas = Object.values(dadosPreview).reduce((acc, rows) => acc + rows.length, 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col"
                style={{ animation: 'fadeInUp 0.2s ease', maxHeight: '90vh' }}>

                {/* Header */}
                <div className="px-6 py-5 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1c1aa3 0%, #150355 100%)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                            <FileSpreadsheet size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white leading-none">Dados & Relatórios</h2>
                            <p className="text-blue-200 text-xs mt-0.5">Importe ou exporte dados do sistema</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                        <X size={15} />
                    </button>
                </div>

                {/* Conteúdo */}
                <div className="overflow-y-auto flex-1 p-6 space-y-6">

                    {etapa === 'inicio' && (
                        <>
                            {/* Relatórios */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gerar Relatórios</p>
                                    
                                    {/* Seletor de Formato */}
                                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                        <button 
                                            onClick={() => setFormatoDownload('excel')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${formatoDownload === 'excel' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                            <FileSpreadsheet size={14} /> Excel
                                        </button>
                                        <button 
                                            onClick={() => setFormatoDownload('pdf')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${formatoDownload === 'pdf' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                            <FileText size={14} /> PDF
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {/* Opção 1: Cadastros Base */}
                                    <button onClick={() => gerarRelatorio('cadastros')} disabled={exportando !== null}
                                        className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100 transition-all group disabled:opacity-60">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                                                {exportando === 'cadastros' ? <Loader2 size={16} className="text-emerald-600 animate-spin" /> : <FileDown size={16} className="text-emerald-600" />}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-emerald-900">Cadastros Base</p>
                                                <p className="text-xs text-emerald-600">Professores, Disciplinas, Cursos e Salas</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-emerald-400 group-hover:text-emerald-600" />
                                    </button>

                                    {/* Opção 2: Usuários */}
                                    <button onClick={() => gerarRelatorio('usuarios')} disabled={exportando !== null}
                                        className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition-all group disabled:opacity-60">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                                                {exportando === 'usuarios' ? <Loader2 size={16} className="text-blue-600 animate-spin" /> : <UserCheck size={16} className="text-blue-600" />}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-blue-900">Usuários do Sistema</p>
                                                <p className="text-xs text-blue-600">Contas, permissões e status dos usuários</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-blue-400 group-hover:text-blue-600" />
                                    </button>

                                    {/* Opção 3: Histórico de Horários */}
                                    <button onClick={() => gerarRelatorio('horarios')} disabled={exportando !== null}
                                        className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:border-purple-400 hover:bg-purple-100 transition-all group disabled:opacity-60">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
                                                {exportando === 'horarios' ? <Loader2 size={16} className="text-purple-600 animate-spin" /> : <History size={16} className="text-purple-600" />}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-purple-900">Histórico de Horários</p>
                                                <p className="text-xs text-purple-600">Alocações anteriores e reservas passadas</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-purple-400 group-hover:text-purple-600" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 my-2">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-xs text-gray-400 font-semibold">IMPORTAÇÃO</span>
                                <div className="flex-1 h-px bg-gray-200" />
                            </div>

                            {/* Importar */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Subir dados de planilha</p>
                                    <button onClick={baixarModelo} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1">
                                        <Download size={12}/> Modelo.xlsx
                                    </button>
                                </div>

                                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleArquivo} />
                                <button onClick={() => inputRef.current.click()}
                                    className="w-full flex flex-col items-center justify-center gap-3 px-5 py-7 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 hover:border-indigo-500 hover:bg-indigo-50 transition-all">
                                    <div className="w-11 h-11 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                        <Upload size={20} className="text-indigo-600" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-indigo-800">Clique para escolher o arquivo</p>
                                        <p className="text-xs text-indigo-400 mt-0.5">Aceita .xlsx, .xls ou .csv com as abas padrão</p>
                                    </div>
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── PREVIEW ── */}
                    {etapa === 'preview' && (
                         <>
                         <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                             <FileSpreadsheet size={15} className="text-gray-500 shrink-0" />
                             <p className="text-xs text-gray-600 font-semibold truncate flex-1">{nomeArquivo}</p>
                             <button onClick={() => { setEtapa('inicio'); setDadosPreview({}); setErrosPreview({}) }}
                                 className="text-xs text-indigo-500 hover:underline shrink-0">Trocar</button>
                         </div>

                         {Object.entries(ABAS_CONFIG).map(([aba, cfg]) => {
                             const rows = dadosPreview[aba]
                             const erros = errosPreview[aba]
                             if (!rows) return null
                             const Icon = cfg.icon
                             return (
                                 <div key={aba} className="rounded-xl border overflow-hidden"
                                     style={{ borderColor: erros ? '#fecaca' : '#e5e7eb' }}>
                                     <div className="flex items-center gap-3 px-4 py-3"
                                         style={{ background: erros ? '#fef2f2' : cfg.colorBg + '60' }}>
                                         <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: cfg.colorBg }}>
                                             <Icon size={14} style={{ color: cfg.color }} />
                                         </div>
                                         <span className="text-sm font-bold text-gray-800 flex-1">{aba}</span>
                                         <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                             style={{ background: cfg.colorBg, color: cfg.color }}>
                                             {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
                                         </span>
                                     </div>
                                     {erros && (
                                         <div className="px-4 py-2 bg-red-50">
                                             {erros.slice(0, 2).map((e, i) => (
                                                 <p key={i} className="text-xs text-red-500 flex items-center gap-1">
                                                     <AlertCircle size={11} className="shrink-0" />{e}
                                                 </p>
                                             ))}
                                             {erros.length > 2 && <p className="text-xs text-red-400">+{erros.length - 2} outros erros</p>}
                                         </div>
                                     )}
                                     <div className="px-4 py-2 divide-y divide-gray-50">
                                         {rows.slice(0, 3).map((row, i) => (
                                             <p key={i} className="text-xs text-gray-600 py-1 truncate">{cfg.label(row) || '—'}</p>
                                         ))}
                                         {rows.length > 3 && <p className="text-xs text-gray-400 py-1">+{rows.length - 3} mais...</p>}
                                     </div>
                                 </div>
                             )
                         })}

                         {Object.keys(dadosPreview).length === 0 && (
                             <div className="text-center py-8 text-gray-400">
                                 <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
                                 <p className="text-sm font-semibold">Nenhuma aba reconhecida</p>
                                 <p className="text-xs mt-1">O arquivo deve ter abas: Professores, Disciplinas, Cursos, Salas</p>
                             </div>
                         )}
                     </>
                    )}

                    {/* ── IMPORTANDO ── */}
                    {etapa === 'importando' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <Loader2 size={40} className="animate-spin text-indigo-500" />
                            <p className="text-base font-bold text-gray-800">Importando dados...</p>
                            <p className="text-xs text-gray-400">Não feche esta janela</p>
                        </div>
                    )}

                    {/* ── RESULTADO ── */}
                    {etapa === 'resultado' && (
                        <>
                        <div className="text-center py-4">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                                style={{ background: 'linear-gradient(135deg,#1c1aa3,#7c3aed)' }}>
                                <CheckCircle2 size={28} className="text-white" />
                            </div>
                            <p className="text-lg font-black text-gray-900">Importação concluída!</p>
                        </div>
                        {Object.entries(resultado).map(([aba, res]) => {
                            const cfg = ABAS_CONFIG[aba]
                            const Icon = cfg.icon
                            return (
                                <div key={aba} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.colorBg }}>
                                        <Icon size={14} style={{ color: cfg.color }} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-gray-800">{aba}</p>
                                        <p className="text-xs text-gray-500">{res.total} registros processados</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-green-600">{res.ok} importados</p>
                                        {res.erros > 0 && <p className="text-xs text-red-400">{res.erros} já existiam</p>}
                                    </div>
                                </div>
                            )
                        })}
                    </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/70 flex justify-between items-center shrink-0">
                    {(etapa === 'inicio') && (
                        <button onClick={onClose}
                            className="px-4 py-2 rounded-xl text-gray-500 text-sm font-semibold hover:bg-gray-200 transition-colors">
                            Fechar
                        </button>
                    )}
                    {etapa === 'preview' && (
                        <>
                            <button onClick={() => { setEtapa('inicio'); setDadosPreview({}); setErrosPreview({}) }}
                                className="px-4 py-2 rounded-xl text-gray-500 text-sm font-semibold hover:bg-gray-200 transition-colors">
                                Voltar
                            </button>
                            <button onClick={handleImportar} disabled={Object.keys(dadosPreview).length === 0}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
                                style={{ background: 'linear-gradient(135deg,#1c1aa3,#4f46e5)', boxShadow: '0 4px 14px rgba(28,26,163,0.28)' }}>
                                <Upload size={15} />
                                Importar {totalLinhas} registro{totalLinhas !== 1 ? 's' : ''}
                            </button>
                        </>
                    )}
                    {etapa === 'resultado' && (
                        <button onClick={onClose}
                            className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold"
                            style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                            <CheckCircle2 size={15} />
                            Concluir
                        </button>
                    )}
                </div>
            </div>
            <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
    )
}

export default ImportarPlanilha