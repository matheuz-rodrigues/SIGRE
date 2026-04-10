const Footer = () => {
  return (
   <footer className='bg-[#150355] text-white mt-auto'>
        <div className='max-w-7xl mx-auto px-6 py-8'>
            


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
