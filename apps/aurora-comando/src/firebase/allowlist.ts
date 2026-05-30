// Allowlist do app AURORA Comando.
// Atualmente: somente o Comandante. Para adicionar mais usuários, editar este array.
export const ALLOWED_EMAILS: string[] = ['mmbaesso@hotmail.com', 'manusalt13@gmail.com']

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase())
}
