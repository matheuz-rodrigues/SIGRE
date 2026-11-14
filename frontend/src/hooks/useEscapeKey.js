import { useEffect, useRef } from 'react'

// Modais abertos, do mais antigo ao mais recente: o Esc fecha só o de cima
const stack = []

function onKeyDown(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  // Um ConfirmDialog (Radix) aberto por cima trata o próprio Esc
  if (document.querySelector('[role="alertdialog"][data-state="open"]')) return
  stack[stack.length - 1]?.current?.(event)
}

/**
 * Fecha o modal com Esc enquanto `enabled` for verdadeiro.
 * Campos que tratam Esc por conta própria devem chamar `event.preventDefault()`.
 */
export default function useEscapeKey(onClose, enabled = true) {
  const handlerRef = useRef(onClose)

  useEffect(() => {
    handlerRef.current = onClose
  })

  useEffect(() => {
    if (!enabled) return undefined
    stack.push(handlerRef)
    if (stack.length === 1) window.addEventListener('keydown', onKeyDown)
    return () => {
      const index = stack.lastIndexOf(handlerRef)
      if (index >= 0) stack.splice(index, 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}
