import { useState, useCallback } from 'react';
import api from '../services/api';

export const useAdminUsers = () => {
    const [usuarios, setUsuarios] = useState([]);

    const carregarUsuarios = useCallback(async () => {
        try {
            const res = await api.get('/users/');
            setUsuarios(res.data);
        } catch (err) {
            console.error('Erro ao carregar usuários:', err);
        }
    }, []);

    const handleAprovarUsuario = async (id) => {
        try {
            await api.patch(`/users/approve/${id}`);
            carregarUsuarios();
        } catch (err) { 
            alert('Erro ao aprovar usuário.');
        }
    };

    const handleRecusarUsuario = async (id) => {
        try {
            await api.patch(`/users/refuse/${id}`);
            carregarUsuarios();
        } catch (err) { 
            alert('Erro ao recusar usuário.');
        }
    };

    const handleDeletarUsuario = async (id) => {
        if (!window.confirm("Deseja realmente excluir este usuário?")) return;
        try {
            await api.delete(`/users/${id}`);
            carregarUsuarios();
        } catch (err) { 
            alert('Erro ao deletar usuário.'); 
        }
    };

    return {
        usuarios,
        carregarUsuarios,
        handleAprovarUsuario,
        handleRecusarUsuario,
        handleDeletarUsuario
    };
};
