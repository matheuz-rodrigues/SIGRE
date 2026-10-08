import { toast } from 'sonner'
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../../services/api';

export const ScheduleContext = createContext();

const DIA_SEMANA_BYDAY = {
    'Domingo':  'SU',
    'Segunda':  'MO',
    'Terça':    'TU',
    'Quarta':   'WE',
    'Quinta':   'TH',
    'Sexta':    'FR',
    'Sábado':   'SA',
};

// Índice JS do dia (0=Dom, 1=Seg...)
const DIA_SEMANA_IDX = {
    'Domingo':  0,
    'Segunda':  1,
    'Terça':    2,
    'Quarta':   3,
    'Quinta':   4,
    'Sexta':    5,
    'Sábado':   6,
};

function datePart(isoOrDate) {
    if (!isoOrDate) return '';
    const s = String(isoOrDate);
    return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

function firstOccurrence(dataInicio, diaSemana) {
    const targetIdx = DIA_SEMANA_IDX[diaSemana];
    if (targetIdx === undefined) return dataInicio;

    const date = new Date(dataInicio + 'T00:00:00');
    const currentIdx = date.getDay();
    const diff = (targetIdx - currentIdx + 7) % 7;
    date.setDate(date.getDate() + diff);
    return date.toISOString().split('T')[0];
}

/** Monta corpo de criação/atualização de reserva alinhado ao backend (Pydantic). */
function buildReservationApiPayload(disciplinas, professores, d) {
    const uid = Number(localStorage.getItem('userId'));
    const ds = datePart(d.dataInicio);
    const de = datePart(d.dataFim);
    
    // Calcula a primeira ocorrência real baseada no dia da semana
    const realDs = firstOccurrence(ds, d.diaSemana);

    const startLocal = `${realDs}T${d.horarioInicio}:00`;
    const endLocal = `${realDs}T${d.horarioFim}:00`;
    const disc = disciplinas.find(x => x.id === d.disciplinaId);
    const prof = professores.find(x => x.id === d.professorId);
    const discNome = disc?.nome || disc?.nomeDisciplina || 'Alocação';
    const profNome = prof?.nome || prof?.nomeProf || '';
    
    let recurrency;
    if (d.diaSemana && de && ds !== de) {
        const byDay = DIA_SEMANA_BYDAY[d.diaSemana];
        if (byDay) {
            const until = new Date(`${de}T23:59:59`).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            recurrency = `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`;
        }
    }

    return {
        fk_usuario: uid,
        salaId: d.salaId,
        professorId: d.professorId,
        disciplinaId: d.disciplinaId,
        cursoId: d.cursoId,
        periodoId: d.periodoId,
        tipo: 'AULA',
        dia_horario_inicio: new Date(startLocal).toISOString(),
        dia_horario_saida: new Date(endLocal).toISOString(),
        diaSemana: d.diaSemana,
        dataInicio: new Date(startLocal).toISOString(),
        dataFim: new Date(endLocal).toISOString(),
        uso: discNome,
        justificativa: profNome ? `${discNome} — ${profNome}` : discNome,
        status: 'APPROVED',
        recurrency: recurrency,
    };
}

function buildReservationPatchPayload(disciplinas, professores, d) {
    const base = buildReservationApiPayload(disciplinas, professores, d);
    const { fk_usuario, status, ...rest } = base;
    return rest;
}

export const useSchedule = () => {
    const context = useContext(ScheduleContext);
    if (!context) throw new Error('useSchedule deve ser usado dentro de ScheduleProvider');
    return context;
};

export const ScheduleProvider = ({ children }) => {
    const [cursos, setCursos] = useState([]);
    const [salas, setSalas] = useState([]);
    const [periodos, setPeriodos] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [professores, setProfessores] = useState([]);
    const [disciplinas, setDisciplinas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshCount, setRefreshCount] = useState(0);
    const [periodoAtivo, setPeriodoAtivo] = useState(null);

    const recarregarDados = async () => {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        console.log("Atualizando dados...");
        setLoading(true);
        try {
            const settled = await Promise.allSettled([
                api.get('/courses/'),
                api.get('/rooms/'),
                api.get('/periods/'),
                api.get('/reservations/'),
                api.get('/professors/'),
                api.get('/disciplines/'),
            ]);

            const ok = (s) => s.status === 'fulfilled' ? s.value : { data: [] };
            const [resCursos, resSalas, resPeriodos, resAloc, resProfs, resDiscs] = settled.map(ok);

            const normalize = (arr, idKey) => (Array.isArray(arr) ? arr.map(x => ({ ...x, id: x.id ?? x[idKey] })) : []);

            setCursos(normalize(resCursos.data, 'idCurso'));
            setSalas(normalize(resSalas.data, 'idSala'));
            
            const periodosFmt = Array.isArray(resPeriodos.data) 
                ? resPeriodos.data.map(p => ({
                    id: p.id,
                    semestre: p.semestre,
                    descricao: p.descricao,
                    dataInicio: p.dataInicio ? p.dataInicio.split('T')[0] : '',
                    dataFim: p.dataFim ? p.dataFim.split('T')[0] : ''
                }))
                : [];
            setPeriodos(periodosFmt);
            
            const profsFmt = Array.isArray(resProfs.data) ? resProfs.data : [];
            const discsFmt = Array.isArray(resDiscs.data) ? resDiscs.data : [];
            setProfessores(profsFmt);
            setDisciplinas(discsFmt);
            
            // Backend returns { items: [...] } for reservations
            const alocItems = resAloc.data?.items || [];
            setHorarios(alocItems.map(aloc => {
                if (aloc.start && aloc.end) {
                    const priv = aloc.extendedProperties?.private || {};
                    const start = new Date(aloc.start.dateTime || aloc.start.date);
                    const end = new Date(aloc.end.dateTime || aloc.end.date);
                    const f = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    
                    const profId = priv.fk_professor;
                    const prof = profsFmt.find(p => String(p.id) === profId);
                    const profNome = prof ? (prof.nome || prof.nomeProf) : '';

                    return {
                        id: aloc.id,
                        diaSemana: priv.dia_semana || '',
                        horarioInicio: start.getHours().toString().padStart(2, '0') + ':' + start.getMinutes().toString().padStart(2, '0'),
                        horarioFim: end.getHours().toString().padStart(2, '0') + ':' + end.getMinutes().toString().padStart(2, '0'),
                        dataInicio: f(start),
                        dataFim: f(end),
                        cursoId: parseInt(priv.fk_curso) || null,
                        salaId: parseInt(priv.fk_sala) || null,
                        periodoId: parseInt(priv.fk_periodo) || null,
                        professorId: parseInt(priv.fk_professor) || null,
                        disciplinaId: parseInt(priv.fk_disciplina) || null,
                        disciplina: aloc.summary,
                        professor: profNome,
                        semestre: priv.fk_periodo ? periodosFmt.find(p => String(p.id) === priv.fk_periodo)?.semestre || '' : '',
                        status: aloc.status || priv.status || 'PENDING'
                    };
                }
                
                return {
                    id: aloc.id,
                    diaSemana: aloc.diaSemana,
                    horarioInicio: aloc.horarioInicio,
                    horarioFim: aloc.horarioFim,
                    dataInicio: aloc.dataInicio ? aloc.dataInicio.split('T')[0] : '',
                    dataFim: aloc.dataFim ? aloc.dataFim.split('T')[0] : '',
                    cursoId: aloc.cursoId,
                    salaId: aloc.salaId,
                    periodoId: aloc.periodoId,
                    disciplina: aloc.disciplina,
                    professor: aloc.professor,
                    semestre: aloc.semestre,
                    status: aloc.status
                };
            }));

            setProfessores(normalize(resProfs.data, 'idProfessor'));
            setDisciplinas(normalize(resDiscs.data, 'idDisciplina'));

            console.log("─── DADOS CARREGADOS ───");
            console.table(resSalas.data);
            console.table(resProfs.data);
            console.table(resDiscs.data);

            setRefreshCount(c => c + 1);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        recarregarDados();
    }, []);

    const createItem = async (endpoint, data, stateSetter, formatter) => {
        try {
            const response = await api.post(endpoint, data);
            await recarregarDados();
            return response.data.id;
        } catch (error) {
            console.error(`Erro ao criar:`, error);
            toast.error("Erro ao salvar.");
            return null;
        }
    };

    const adicionarPeriodo = (d) => createItem('/periods/', d, setPeriodos, (r) => ({ ...r, dataInicio: r.dataInicio.split('T')[0], dataFim: r.dataFim.split('T')[0] }));
    const adicionarProfessor = (d) => createItem('/professors/', d, setProfessores);
    const adicionarDisciplina = (d) => createItem('/disciplines/', d, setDisciplinas);
    const adicionarCurso = (d) => createItem('/courses/', d, setCursos);
    const adicionarSala = (d) => createItem('/rooms/', d, setSalas);

    const adicionarHorario = async (novoHorario) => {
        try {
            const body = buildReservationApiPayload(disciplinas, professores, novoHorario);
            console.log("POST /reservations/", body);

            if (!body.fk_usuario) {
                toast.warning('Sessão inválida: faça login novamente.');
                return;
            }
            await api.post('/reservations/', body);
            recarregarDados();
            toast.success("Horário salvo!");
            return true;
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.detail || "Erro ao salvar horário.";
            toast.error(typeof msg === 'string' ? msg : "Erro ao salvar horário. Verifique os dados.");
            return false;
        }
    };

    const atualizarHorario = async (id, dados) => {
        try {
            const baseId = String(id).split(':')[0];
            const body = buildReservationPatchPayload(disciplinas, professores, dados);
            console.log(`PATCH /reservations/${baseId}`, body);

            await api.patch(`/reservations/${baseId}`, body);
            recarregarDados();
            toast.success("Horário atualizado!");
            return true;
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.detail || "Erro ao atualizar.";
            toast.error(typeof msg === 'string' ? msg : "Erro ao atualizar.");
            return false;
        }
    }

    const [deleteModal, setDeleteModal] = useState({ show: false, id: null, isRecurrent: false });

    const confirmDelete = async (action) => {
        const id = deleteModal.id;
        setDeleteModal({ show: false, id: null, isRecurrent: false });
        
        try {
            const baseId = String(id).split(':')[0];
            const query = action === 'all' ? '?deleteSeries=true' : '?deleteSeries=false';
            await api.delete(`/reservations/${action === 'all' ? baseId : id}${query}`);
            recarregarDados();
            toast.success("Excluído!");
        } catch (error) { console.error(error); toast.error("Erro ao excluir."); }
    };

    const removerHorario = (id) => {
        const isRecurrent = horarios.find(h => String(h.id) === String(id))?.id.includes(':');
        
        if (isRecurrent) {
            setDeleteModal({ show: true, id, isRecurrent: true });
        } else {
            setDeleteModal({ show: true, id, isRecurrent: false });
        }
    }

    return (
        <ScheduleContext.Provider value={{
            cursos, salas, periodos, horarios, professores, disciplinas, periodoAtivo, setPeriodoAtivo, loading, refreshCount,
            adicionarHorario, atualizarHorario, removerHorario,
            adicionarPeriodo, adicionarProfessor, adicionarDisciplina, adicionarCurso, adicionarSala,
            recarregarDados 
        }}>
            {children}

            {/* Custom Delete Modal */}
            {deleteModal.show && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-center p-6">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">Excluir Alocação?</h3>
                        
                        {deleteModal.isRecurrent ? (
                            <>
                                <p className="text-sm text-gray-500 mb-6">
                                    Este é um evento recorrente. Você deseja excluir apenas esta ocorrência ou toda a série de eventos?
                                </p>
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => confirmDelete('single')}
                                        className="w-full py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-sm transition-colors">
                                        Excluir APENAS este dia
                                    </button>
                                    <button onClick={() => confirmDelete('all')}
                                        className="w-full py-3 bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200 rounded-xl font-bold text-sm transition-all">
                                        Excluir TODA a série
                                    </button>
                                    <button onClick={() => setDeleteModal({ show: false, id: null, isRecurrent: false })}
                                        className="w-full py-3 bg-white text-gray-400 border border-gray-200 hover:bg-gray-50 rounded-xl font-bold text-sm mt-2 transition-colors">
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-500 mb-6">
                                    Tem certeza que deseja excluir esta alocação permanentemente? Esta ação não pode ser desfeita.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => confirmDelete('all')}
                                        className="w-full py-3 bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200 rounded-xl font-bold text-sm transition-all">
                                        Sim, Excluir
                                    </button>
                                    <button onClick={() => setDeleteModal({ show: false, id: null, isRecurrent: false })}
                                        className="w-full py-3 bg-white text-gray-400 border border-gray-200 hover:bg-gray-50 rounded-xl font-bold text-sm mt-2 transition-colors">
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </ScheduleContext.Provider>
    );
};