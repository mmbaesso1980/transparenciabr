/**
 * Ocean Ways — Service: API Client
 *
 * Cliente HTTP para o backend Ocean Ways FastAPI.
 * Inclui automaticamente o Firebase JWT no header Authorization.
 *
 * Base URL: VITE_OCEANWAYS_API_URL (ex: https://oceanways-api-HASH-uc.a.run.app)
 *
 * TODO (Maestro):
 *   [ ] Implementar getAuthToken() que busca JWT do Firebase Auth
 *   [ ] Implementar apiRequest() com tratamento de 401 (token expirado → refresh)
 *   [ ] Implementar funções de cada endpoint (searchAwards, getAlerts, etc.)
 *   [ ] Adicionar retry automático para erros 5xx (máx 2 tentativas)
 *   [ ] Tratar rate limit 429 com mensagem amigável
 */

const API_BASE = import.meta.env.VITE_OCEANWAYS_API_URL || 'http://localhost:8080/api/v1'

/**
 * Obtém o token JWT do Firebase Auth.
 * TODO (Maestro): implementar com getAuth().currentUser.getIdToken()
 */
async function getAuthToken() {
  // TODO: return await getAuth().currentUser?.getIdToken()
  throw new Error('getAuthToken não implementado')
}

/**
 * Requisição autenticada ao backend.
 * TODO (Maestro): implementar
 */
async function apiRequest(method, path, body = null) {
  const token = await getAuthToken()
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${response.status}`)
  }

  return response.json()
}

// ---------------------------------------------------------------------------
// API functions — TODO (Maestro): implementar cada uma
// ---------------------------------------------------------------------------

/**
 * Busca award flights.
 * @param {Object} searchParams - SearchRequest payload
 * @returns {Promise<Object>} SearchResponse
 * TODO (Maestro): POST /search
 */
export async function searchAwards(searchParams) {
  return apiRequest('POST', '/search', searchParams)
}

/**
 * Retorna saldo de créditos do usuário.
 * @returns {Promise<Object>} CreditBalance
 * TODO (Maestro): GET /credits/balance
 */
export async function getCreditBalance() {
  return apiRequest('GET', '/credits/balance')
}

/**
 * Lista alertas ativos do usuário.
 * @returns {Promise<Object>} { alerts: [] }
 * TODO (Maestro): GET /alerts
 */
export async function getAlerts() {
  return apiRequest('GET', '/alerts')
}

/**
 * Cria novo alerta.
 * @param {Object} alertData - AlertCreate payload
 * TODO (Maestro): POST /alerts
 */
export async function createAlert(alertData) {
  return apiRequest('POST', '/alerts', alertData)
}

/**
 * Desativa alerta.
 * @param {string} alertId
 * TODO (Maestro): DELETE /alerts/{alertId}
 */
export async function deactivateAlert(alertId) {
  return apiRequest('DELETE', `/alerts/${alertId}`)
}

/**
 * Cria sessão de checkout (Stripe ou MercadoPago).
 * @param {Object} params - { product, gateway, success_url, cancel_url }
 * TODO (Maestro): POST /payments/{gateway}/checkout
 */
export async function createCheckout(params) {
  const gateway = params.gateway.toLowerCase()
  return apiRequest('POST', `/payments/${gateway}/checkout`, params)
}
