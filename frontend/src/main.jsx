import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'
import { ConfirmHost } from './components/common/confirm.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster richColors position="top-right" />
    <ConfirmHost />
  </StrictMode>,
)
