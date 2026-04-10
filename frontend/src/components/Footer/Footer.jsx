const Footer = () => {
  return (
   <footer className='bg-[#150355] text-white mt-auto'>
        <div className='max-w-7xl mx-auto px-6 py-8'>
            <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-gray-700'>
                <div className='flex flex-col gap-2'>
                    <h3 className='text-xl font-bold text-white'>
                        Programação Orientada a Objetos
                    </h3>
                    <p className='text-white text-sm'>Projeto para avaliação da disciplina </p>
                </div> 

                <div className='flex flex-col gap-2'>
                    <h4 className='text-sm font-semibold text-white'>
                        Equipe de Desenvolvimento
                    </h4>
                    <div className='flex flex-wrap gap-x-3 gap-y-1 text-sm text-green-600'>
                        <span className='font-bold'>Ananda Nunes</span>
                        <span className='hidden md:inline'>•</span>
                        <span className='font-bold'>Driele Carvalho</span>
                        <span className='hidden md:inline'>•</span>
                        <span className='font-bold'>Thaylan Fonseca</span>
                        <span className='hidden md:inline'>•</span>
                        <span className='font-bold'>Iam Melo</span>
                        <span className='hidden md:inline'>•</span>
                        <span className='font-bold'>Filipe Cruz</span>
                    </div>
                </div>
            </div>


            <div className='pt-6 text-center md:text-left'>
                <p className='text-sm text-gray-400'>
                    &copy; {new Date().getFullYear()} SIGRE - Sistema Integrado de Gestão de Reservas Acadêmicas / UEPA Ananindeua.
                    Todos os direitos reservados.
                </p>
            </div>
        </div>
   </footer>
  )
}

export default Footer
