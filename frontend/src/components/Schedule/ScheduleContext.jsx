import { createContext, useContext, useState, useEffect } from 'react';
import api from '../../services/api';
import { getCookie } from '../../utils/cookieUtils';

export const ScheduleContext = createContext();

function datePart(isoOrDate) {
    if (!isoOrDate) return '';
    const s = String(isoOrDate);
    return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

const RRULE_MAP = {
    'Segunda': 'MO',
    'Terça': 'TU',
    'Quarta': 'WE',
    'Quinta': 'TH',
    'Sexta': 'FR',
    'Sábado': 'SA',
    'Domingo': 'SU'
};

/** Monta corpo de criação/atualização de reserva alinhado ao backend (Pydantic). */
const buildReservationApiPayload = (disciplinas, professores, d) => {
    const disc = disciplinas.find(x => x.id === parseInt(d.disciplinaId));
    const discNome = disc?.nomeDisciplina || disc?.nome || 'Aula';
    const prof = professores.find(x => x.id === parseInt(d.professorId));
    const profNome = prof?.nomeProf || prof?.nome || '';

    const ds = d.dataInicio.split('T')[0];
    const de = d.dataFim.split('T')[0];

    const startLocal = `${ds}T${d.horarioInicio}:00`;
    const endLocal = `${ds}T${d.horarioFim}:00`;
    
    // Calcula RRULE
    let recurrency = null;
    if (d.diaSemana && RRULE_MAP[d.diaSemana]) {
        const until = de.replace(/-/g, '') + 'T235959Z';
        recurrency = `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_MAP[d.diaSemana]};UNTIL=${until}`;
    }

    return {
        fk_usuario: parseInt(getCookie('userId')),
        salaId: parseInt(d.salaId),
        professorId: parseInt(d.professorId),
        disciplinaId: parseInt(d.disciplinaId),
        cursoId: parseInt(d.cursoId),
        periodoId: parseInt(d.periodoId),
        tipo: 'AULA',
        dia_horario_inicio: new Date(startLocal).toISOString(),
        dia_horario_saida: new Date(endLocal).toISOString(),
        diaSemana: d.diaSemana,
        dataInicio: new Date(startLocal).toISOString(),
        dataFim: new Date(`${de}T${d.horarioFim}:00`).toISOString(),
        uso: discNome,
        justificativa: profNome ? `${discNome} — ${profNome}` : discNome,
        recurrency: recurrency,
        status: 'APPROVED'
    };
};

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
    const [periodoAtivo, setPeriodoAtivo] = useState(null);
    const [loading, setLoading] = useState(false);

    const recarregarDados = async () => {
        const token = getCookie('access_token');
        if (!token) return;

        console.log("Atualizando dados...");
        setLoading(true);
        try {
            const [resCursos, resSalas, resPeriodos, resAloc, resProfs, resDiscs] = await Promise.all([
                api.get('/courses/'),
                api.get('/rooms/'),
                api.get('/periods/'),
                api.get('/reservations/'),
                api.get('/professors/'),
                api.get('/disciplines/'),
            ]);

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
            
            if (periodosFmt.length > 0 && !periodoAtivo) setPeriodoAtivo(periodosFmt[0].id);

            const alocItems = resAloc.data?.items || [];
            setHorarios(alocItems.map(aloc => {
                const priv = aloc.extendedProperties?.private || {};
                const startDT = aloc.start?.dateTime || '';
                const endDT = aloc.end?.dateTime || '';
                const daysMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                const extractedDia = startDT ? daysMap[new Date(startDT).getDay()] : '';
                
                return {
                    id: aloc.id,
                    diaSemana: priv.dia_semana || extractedDia || '',
                    horarioInicio: startDT ? startDT.split('T')[1]?.substring(0, 5) : '',
                    horarioFim: endDT ? endDT.split('T')[1]?.substring(0, 5) : '',
                    dataInicio: startDT ? startDT.split('T')[0] : '',
                    dataFim: endDT ? endDT.split('T')[0] : '',
                    cursoId: priv.fk_curso ? parseInt(priv.fk_curso) : null,
                    salaId: priv.fk_sala ? parseInt(priv.fk_sala) : null,
                    periodoId: priv.fk_periodo ? parseInt(priv.fk_periodo) : null,
                    disciplina: aloc.summary,
                    professor: aloc.description?.split(' — ')[1] || aloc.description || '',
                    solicitante: priv.solicitante_nome || 'Admin',
                    professorNome: priv.professor_nome || 'Nenhum',
                    status: aloc.status
                };
            }));

            setProfessores(normalize(resProfs.data, 'idProfessor'));
            setDisciplinas(normalize(resDiscs.data, 'idDisciplina'));

            console.log("─── DADOS CARREGADOS ───");
            console.table(resSalas.data);
            console.table(resProfs.data);
            console.table(resDiscs.data);

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            if (error.response) {
                console.error("Status:", error.response.status);
                console.error("Data:", error.response.data);
            }
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
            const novoItem = formatter ? formatter(response.data) : response.data;
            stateSetter(prev => [...prev, novoItem]);
            return novoItem.id;
        } catch (error) {
            console.error(`Erro ao criar:`, error);
            alert("Erro ao salvar.");
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
                return { success: false, error: 'Sessão inválida: faça login novamente.' };
            }
            const res = await api.post('/reservations/', body);
            recarregarDados();
            return { success: true, data: res.data };
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.detail || "Erro ao salvar horário. Verifique os dados.";
            return { success: false, error: typeof msg === 'string' ? msg : "Erro ao salvar horário. Verifique os dados." };
        }
    };

    const atualizarHorario = async (id, dados) => {
        try {
            const baseId = String(id).split(':')[0];
            const body = buildReservationPatchPayload(disciplinas, professores, dados);
            console.log(`PATCH /reservations/${baseId}`, body);

            const res = await api.patch(`/reservations/${baseId}`, body);
            recarregarDados();
            return { success: true, data: res.data };
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.detail || "Erro ao atualizar.";
            return { success: false, error: typeof msg === 'string' ? msg : "Erro ao atualizar." };
        }
    }

    const removerHorario = async (id) => {
        if (!window.confirm("Tem certeza?")) return;
        try {
            await api.delete(`/reservations/${id}`);
            setHorarios(prev => prev.filter(h => h.id !== id));
            alert("Excluído!");
        } catch (error) { console.error(error); alert("Erro ao excluir."); }
    }

    return (
        <ScheduleContext.Provider value={{
            cursos, salas, periodos, horarios, professores, disciplinas, periodoAtivo, setPeriodoAtivo, loading,
            adicionarHorario, atualizarHorario, removerHorario,
            adicionarPeriodo, adicionarProfessor, adicionarDisciplina, adicionarCurso, adicionarSala,
            recarregarDados 
        }}>
            {children}
        </ScheduleContext.Provider>
    );
};