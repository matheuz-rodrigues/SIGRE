import { useState, useCallback } from 'react';
import api from '../services/api';

const normalizeStatus = (status) => {
    if (!status) return 'pendente';
    const s = status.toLowerCase();
    if (s === 'pending') return 'pendente';
    if (s === 'approved') return 'aprovado';
    if (s === 'rejected' || s === 'recusado' || s === 'refused') return 'recusado';
    return s;
};

export const useAdminSolicitacoes = (recarregarDados, fetchMetrics, setModalFeedback) => {
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loadingSols, setLoadingSols] = useState(true);

    const carregarSolicitacoes = useCallback(async (approvedList = []) => {
        setLoadingSols(true);
        try {
            const [resSols, resReservaPending, resSalas] = await Promise.all([
                api.get('/solicitations/'),
                api.get('/reservations/?status=PENDING'),
                api.get('/rooms/')
            ]);

            const salasMap = (resSalas.data || []).reduce((acc, s) => ({ ...acc, [s.id]: s.nomeSala || s.codigo_sala }), {});

            const solsExt = (resSols.data || []).map(s => ({
                id: s.idSolicitacao,
                type: 'external',
                solicitante: s.solicitante,
                motivo: s.motivo,
                descricao: s.descricao,
                salaNome: s.sala?.nomeSala || salasMap[s.fk_sala] || 'Sem Sala',
                salaId: s.fk_sala,
                horario: `${s.horario_inicio?.substring(0, 5)} – ${s.horario_fim?.substring(0, 5)}`,
                status: normalizeStatus(s.status),
                criadoEm: new Date(s.created_at || s.criadoEm).getTime(),
                criadoEmLabel: new Date(s.created_at || s.criadoEm).toLocaleString('pt-BR'),
                diaSemana: s.dia_semana || s.diaSemana,
                dataEvento: s.data_evento || s.dataEvento
            }));

            const internalGroups = {};
            (resReservaPending.data?.items || []).forEach(r => {
                const priv = r.extendedProperties?.private || {};
                const baseId = priv.local_reservation_id || r.id?.split(':')[0];
                const startDT = r.start?.dateTime || '';

                if (!internalGroups[baseId]) {
                    internalGroups[baseId] = {
                        id: baseId,
                        type: 'internal',
                        solicitante: r.professor || priv.uso || 'Admin',
                        motivo: r.summary || 'Reserva Direta',
                        salaNome: salasMap[priv.fk_sala] || `Sala ${priv.fk_sala}`,
                        salaId: parseInt(priv.fk_sala),
                        horario: `${r.start?.dateTime?.split('T')[1]?.substring(0, 5)} – ${r.end?.dateTime?.split('T')[1]?.substring(0, 5)}`,
                        status: normalizeStatus(r.status || 'PENDING'),
                        criadoEm: 0,
                        criadoEmLabel: 'Reserva Direta',
                        series: []
                    };
                }

                internalGroups[baseId].series.push({
                    instanceId: r.id,
                    data: startDT ? startDT.split('T')[0] : '—',
                    diaSemana: priv.dia_semana || '—',
                    status: normalizeStatus(r.status || 'PENDING')
                });
            });

            const resInt = Object.values(internalGroups);
            const allSols = [...solsExt, ...resInt].map(sol => {
                const solStart = sol.horario?.split(' – ')[0];
                const solEnd = sol.horario?.split(' – ')[1];

                const conflitos = approvedList.filter(h => {
                    if (h.salaId !== sol.salaId) return false;
                    const timeOverlap = (solStart < h.horarioFim) && (solEnd > h.horarioInicio);
                    if (!timeOverlap) return false;

                    if (sol.dataEvento) {
                        const sDate = new Date(sol.dataEvento + 'T12:00:00');
                        const hIni = new Date(h.dataInicio + 'T00:00:00');
                        const hFim = new Date(h.dataFim + 'T23:59:59');
                        return sDate >= hIni && sDate <= hFim && h.diaSemana === sol.diaSemana;
                    }
                    return h.diaSemana === sol.diaSemana;
                });
                return { ...sol, temConflito: conflitos.length > 0 };
            });

            setSolicitacoes(allSols.sort((a, b) => b.criadoEm - a.criadoEm));
        } catch (err) {
            console.error('Erro ao carregar solicitações:', err);
        } finally {
            setLoadingSols(false);
        }
    }, []);

    const handleCheckAprovar = async (item) => {
        setSolicitacoes(prev => prev.map(sol => {
            const isMatch = item.isInstance 
                ? (sol.series && sol.series.some(s => s.instanceId === item.id))
                : (sol.id === item.id);

            if (isMatch) {
                if (item.isInstance) {
                    const newSeries = sol.series.map(s => s.instanceId === item.id ? { ...s, status: 'aprovado' } : s);
                    const allApp = newSeries.every(s => s.status === 'aprovado');
                    return { ...sol, series: newSeries, status: allApp ? 'aprovado' : sol.status };
                }
                return { ...sol, status: 'aprovado', series: sol.series?.map(s => ({ ...s, status: 'aprovado' })) };
            }
            return sol;
        }));

        try {
            const res = item.type === 'internal'
                ? await api.patch(`/reservations/approve/${item.id}`)
                : await api.patch(`/solicitations/${item.id}/status`, { status: 'aprovado' });

            setModalFeedback({
                show: true,
                title: 'Sucesso',
                message: res.data?.message || 'Solicitação aprovada com sucesso!',
                type: 'success'
            });

            fetchMetrics();
            recarregarDados();
        } catch (err) {
            const rawDetail = err.response?.data?.detail;
            const errorMessage = Array.isArray(rawDetail)
                ? rawDetail.map(d => `${d.loc?.join('.') || ''}: ${d.msg}`).join('; ')
                : (typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail) || 'Erro ao aprovar solicitação.');

            setModalFeedback({
                show: true,
                title: 'Erro na Aprovação',
                message: errorMessage,
                type: 'error'
            });
        }
    };

    const handleRecusarSolicitacao = async (item, motivo = '') => {
        setSolicitacoes(prev => prev.map(sol => {
            const isMatch = item.isInstance 
                ? (sol.series && sol.series.some(s => s.instanceId === item.id))
                : (sol.id === item.id);

            if (isMatch) {
                if (item.isInstance) {
                    const newSeries = sol.series.map(s => s.instanceId === item.id ? { ...s, status: 'recusado' } : s);
                    const allRec = newSeries.every(s => s.status === 'recusado');
                    return { ...sol, series: newSeries, status: allRec ? 'recusado' : sol.status };
                }
                return { ...sol, status: 'recusado', series: sol.series?.map(s => ({ ...s, status: 'recusado' })) };
            }
            return sol;
        }));

        try {
            if (item.type === 'internal') {
                await api.patch(`/reservations/refuse/${item.id}`);
            } else {
                await api.patch(`/solicitations/${item.id}/status`, {
                    status: 'recusado',
                    motivoRecusa: motivo
                });
            }
            fetchMetrics();
            recarregarDados();
        } catch (err) {
            const rawDetail = err.response?.data?.detail;
            const errorMessage = Array.isArray(rawDetail)
                ? rawDetail.map(d => `${d.loc?.join('.') || ''}: ${d.msg}`).join('; ')
                : (typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail) || 'Erro ao recusar solicitação.');

            alert(`Erro: ${errorMessage}`);
        }
    };

    return {
        solicitacoes,
        loadingSols,
        carregarSolicitacoes,
        handleCheckAprovar,
        handleRecusarSolicitacao
    };
};
