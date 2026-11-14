// Fuso do campus (Ananindeua/PA). Datas da API são exibidas nele, seja qual for o fuso do navegador.
export const APP_TIMEZONE = 'America/Belem'

export function formatDateTimeBelem(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { timeZone: APP_TIMEZONE })
}
