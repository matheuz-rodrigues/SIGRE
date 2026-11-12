import { useSchedule } from './ScheduleContext'
import { useScheduleForm } from '../../hooks/useScheduleForm'

// Componentes Internos
import FormHeader from './components/FormHeader'
import FormFooter from './components/FormFooter'
import Step1Horario from './components/Steps/Step1Horario'
import Step2Sala from './components/Steps/Step2Sala'
import Step3DisciplinaCurso from './components/Steps/Step3DisciplinaCurso'
import Step4Professor from './components/Steps/Step4Professor'
import Step5Confirmacao from './components/Steps/Step5Confirmacao'

const ScheduleForm = ({ horarioEdit, onSave, onCancel, onGoToCadastros, restoreDraft }) => {
    const { 
        cursos, salas, periodos, professores, disciplinas, periodoAtivo 
    } = useSchedule()

    const {
        step,
        form, set,
        errors,
        isSaving,
        handleNext, handleBack,
        handleSubmit,
        handleGoTo
    } = useScheduleForm({
        horarioEdit,
        periodoAtivo,
        periodos,
        onSave,
        onCancel,
        onGoToCadastros,
        restoreDraft
    })

    return (
        <div className="rounded-2xl overflow-hidden mb-8"
            style={{ border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

            {/* Cabeçalho */}
            <FormHeader 
                step={step} 
                horarioEdit={horarioEdit} 
                onCancel={onCancel} 
            />

            {/* Corpo */}
            <div className="bg-white px-8 py-8 space-y-6">
                {step === 1 && (
                    <Step1Horario 
                        form={form} 
                        set={set} 
                        errors={errors} 
                    />
                )}

                {step === 2 && (
                    <Step2Sala 
                        form={form} 
                        set={set} 
                        errors={errors} 
                        salas={salas} 
                        onGoTo={handleGoTo} 
                    />
                )}

                {step === 3 && (
                    <Step3DisciplinaCurso 
                        form={form} 
                        set={set} 
                        errors={errors} 
                        disciplinas={disciplinas} 
                        cursos={cursos} 
                        onGoTo={handleGoTo} 
                    />
                )}

                {step === 4 && (
                    <Step4Professor 
                        form={form} 
                        set={set} 
                        errors={errors} 
                        professores={professores} 
                    />
                )}

                {step === 5 && (
                    <Step5Confirmacao 
                        form={form} 
                        salas={salas} 
                        disciplinas={disciplinas} 
                        cursos={cursos} 
                        professores={professores} 
                    />
                )}
            </div>

            {/* Rodapé */}
            <FormFooter 
                step={step}
                isSaving={isSaving}
                handleNext={handleNext}
                handleBack={handleBack}
                handleSubmit={handleSubmit}
                horarioEdit={horarioEdit}
            />
        </div>
    )
}

export default ScheduleForm