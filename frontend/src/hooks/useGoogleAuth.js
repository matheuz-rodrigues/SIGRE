import { useState, useCallback } from 'react';
import api, { getGoogleStatus, connectGoogle, disconnectGoogle } from '../services/api';

export const useGoogleAuth = (setModalFeedback) => {
    const [isGoogleConnected, setIsGoogleConnected] = useState(false);
    const [loadingGoogle, setLoadingGoogle] = useState(false);
    const [modalConfirmDisconnect, setModalConfirmDisconnect] = useState(false);

    const checkGoogleStatus = useCallback(async () => {
        try {
            const connected = await getGoogleStatus();
            setIsGoogleConnected(connected);
        } catch (err) {
            console.error('Erro status Google:', err);
        }
    }, []);

    const handleConnectGoogle = async () => {
        setLoadingGoogle(true);
        try {
            const result = await connectGoogle();
            if (typeof result === 'string') {
                window.location.href = result;
            } else if (result.auth_url) {
                window.location.href = result.auth_url;
            } else {
                setModalFeedback({
                    show: true,
                    title: 'Erro de Conexão',
                    message: 'Não foi possível obter a URL de conexão com o Google.',
                    type: 'error'
                });
            }
        } catch (err) {
            setModalFeedback({
                show: true,
                title: 'Erro de Conexão',
                message: 'Não foi possível se conectar com o Google.',
                type: 'error'
            });
        } finally {
            setLoadingGoogle(false);
        }
    };

    const handleDisconnectGoogle = () => {
        setModalConfirmDisconnect(true);
    };

    const confirmDisconnect = async () => {
        setModalConfirmDisconnect(false);
        setLoadingGoogle(true);
        try {
            await disconnectGoogle();
            setIsGoogleConnected(false);
            setModalFeedback({
                show: true,
                title: 'Desconectado',
                message: 'Sua conta do Google Calendar foi desvinculada com sucesso.',
                type: 'success'
            });
        } catch (err) {
            setModalFeedback({
                show: true,
                title: 'Erro ao Desconectar',
                message: err.message || 'Erro desconhecido',
                type: 'error'
            });
        } finally {
            setLoadingGoogle(false);
        }
    };

    return {
        isGoogleConnected,
        loadingGoogle,
        modalConfirmDisconnect,
        setModalConfirmDisconnect,
        checkGoogleStatus,
        handleConnectGoogle,
        handleDisconnectGoogle,
        confirmDisconnect
    };
};
