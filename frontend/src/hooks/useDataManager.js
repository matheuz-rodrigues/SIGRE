import { toast } from 'sonner'
import { confirmAction } from '../components/common/confirmStore'
import { useState, useEffect } from 'react'
import { useSchedule } from '../components/Schedule/ScheduleContext'
import * as ProfessorService from '../services/ProfessorService'
import * as DisciplineService from '../services/DisciplineService'
import * as CourseService from '../services/CourseService'
import * as RoomService from '../services/RoomService'
import * as PeriodService from '../services/PeriodService'
import * as RoomTypeService from '../services/RoomTypeService'
import { getRoomTypes, createRoomType } from '../services/RoomTypeService'
import { getCourses, createCourse } from '../services/CourseService'

const SERVICES = {
    professores: {
        getAll: ProfessorService.getProfessors,
        create: ProfessorService.createProfessor,
        update: ProfessorService.updateProfessor,
        delete: ProfessorService.deleteProfessor
    },
    disciplinas: {
        getAll: DisciplineService.getDisciplines,
        create: DisciplineService.createDiscipline,
        update: DisciplineService.updateDiscipline,
        delete: DisciplineService.deleteDiscipline
    },
    cursos: {
        getAll: CourseService.getCourses,
        create: CourseService.createCourse,
        update: CourseService.updateCourse,
        delete: CourseService.deleteCourse
    },
    tiposSala: {
        getAll: RoomTypeService.getRoomTypes,
        create: RoomTypeService.createRoomType,
        update: RoomTypeService.updateRoomType,
        delete: RoomTypeService.deleteRoomType
    },
    salas: {
        getAll: RoomService.getRooms,
        create: RoomService.createRoom,
        update: RoomService.updateRoom,
        delete: RoomService.deleteRoom
    },
    periodos: {
        getAll: PeriodService.getPeriods,
        create: PeriodService.createPeriod,
        update: PeriodService.updatePeriod,
        delete: PeriodService.deletePeriod
    }
}

export const useDataManager = (initialTab = 'professores') => {
    const { 
        professores, disciplinas, cursos, salas, periodos, 
        recarregarDados 
    } = useSchedule()
    
    const [activeTab, setActiveTab] = useState(initialTab)
    const [modal, setModal] = useState(null)
    const [tiposSala, setTiposSala] = useState([])
    const [showResumeBanner, setShowResumeBanner] = useState(false)
    const [loading, setLoading] = useState(false)

    const hasDraft = !!sessionStorage.getItem('scheduleFormDraft')

    useEffect(() => {
        const tab = sessionStorage.getItem('cadastrosTab')
        if (tab && SERVICES[tab]) {
            setActiveTab(tab)
            sessionStorage.removeItem('cadastrosTab')
            setTimeout(() => setModal({ tipo: tab, item: null }), 100)
        }
    }, [])

    useEffect(() => {
        getRoomTypes().then(setTiposSala).catch(() => setTiposSala([]))
    }, [])

    const handleModalClose = () => {
        setModal(null)
        if (hasDraft) setShowResumeBanner(true)
    }

    const handleModalSave = async (payload) => {
        const service = SERVICES[activeTab]
        try {
            setLoading(true)
            if (payload.id) {
                await service.update(payload.id, payload)
            } else {
                await service.create(payload)
            }
            recarregarDados()
            if (activeTab === 'tiposSala') {
                getRoomTypes().then(setTiposSala).catch(() => setTiposSala([]))
            }
            setModal(null)
            if (hasDraft) setShowResumeBanner(true)
        } catch (err) {
            console.error(err)
            const d = err.response?.data?.detail
            const msg = typeof d === 'string' ? d : err.response?.data?.message
            toast.error(msg || 'Erro ao salvar. Verifique os dados.')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        const service = SERVICES[activeTab]
        if (!(await confirmAction({ title: 'Excluir item?', description: 'Tem certeza que deseja excluir? Esta ação não pode ser desfeita.' }))) return
        try {
            setLoading(true)
            await service.delete(id)
            recarregarDados()
            if (activeTab === 'tiposSala') {
                getRoomTypes().then(setTiposSala).catch(() => setTiposSala([]))
            }
        } catch (err) {
            const d = err.response?.data?.detail
            const msg = typeof d === 'string' ? d : 'Erro ao excluir. Este item pode estar em uso.'
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }

    const handleAddSubItem = async (listName, data) => {
        try {
            if (listName === 'tiposSala') {
                const name = typeof data === 'string' ? data : data.nome
                const newItem = await createRoomType({ nome: name })
                setTiposSala(prev => [...prev, newItem])
                return newItem.id
            }
            if (listName === 'cursos') {
                const newItem = await createCourse({ 
                    nomeCurso: data.nome, 
                    siglaCurso: data.sigla,
                    corCurso: '#4f46e5' // Cor default
                })
                recarregarDados() 
                return newItem.id || newItem.idCurso
            }
        } catch (err) {
            toast.error('Erro ao criar item. Verifique se já existe.')
            throw err
        }
    }

    const lists = { professores, disciplinas, cursos, salas, periodos, tiposSala }

    return {
        activeTab, setActiveTab,
        modal, setModal,
        lists,
        loading,
        showResumeBanner, setShowResumeBanner,
        handleModalClose,
        handleModalSave,
        handleDelete,
        handleAddSubItem,
        recarregarDados
    }
}
