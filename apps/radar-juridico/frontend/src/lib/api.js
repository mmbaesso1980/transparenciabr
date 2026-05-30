/**
 * API client — Radar Jurídico INSS
 *
 * Todas as chamadas ao backend Cloud Run passam por aqui.
 * O backend é o ÚNICO ponto de acesso ao BigQuery — nunca chame BQ diretamente do frontend.
 *
 * TODO(maestro): configurar VITE_BACKEND_URL em .env.local:
 *   VITE_BACKEND_URL=https://radar-juridico-api-xxxxxx-uc.a.run.app
 *
 * Em dev local, o proxy do vite.config.js redireciona /api → localhost:8080
 */

// TODO(maestro): ajustar URL base conforme deploy
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "/api";

/**
 * Faz request autenticado ao backend com Bearer token Firebase.
 *
 * @param {string} path - caminho relativo (ex: "/leads?page=1&uf=PR")
 * @param {object} opts - opções fetch adicionais
 * @param {string} idToken - Firebase ID token do usuário autenticado
 *
 * TODO(maestro): integrar com AuthContext para obter idToken automaticamente:
 *   const { user } = useAuth();
 *   const token = await user.getIdToken();
 */
async function apiFetch(path, opts = {}, idToken = "") {
  const url = `${BACKEND_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(url, { ...opts, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    // HTTP 402: créditos insuficientes — tratar no componente com PaywallGate
    if (res.status === 402) {
      const err = new Error("Créditos insuficientes");
      err.code = "CREDITOS_INSUFICIENTES";
      err.data = error;
      throw err;
    }
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Leads (Paywall 1)
// ---------------------------------------------------------------------------

/**
 * Lista leads qualificados com filtros e paginação.
 *
 * TODO(maestro): implementar após backend /leads estar funcional.
 * Resposta esperada: { leads: [...], total: N, page: N, page_size: N }
 */
export async function fetchLeads({ page = 1, pageSize = 25, uf = "", especie = 0, tipoAcao = "", scoreMin = 0, focoAtual = false } = {}, idToken = "") {
  const params = new URLSearchParams({
    page,
    page_size: pageSize,
    ...(uf ? { uf } : {}),
    ...(especie ? { especie } : {}),
    ...(tipoAcao ? { tipo_acao: tipoAcao } : {}),
    ...(scoreMin > 0 ? { score_min: scoreMin } : {}),
    ...(focoAtual ? { foco_atual: "true" } : {}),
  });
  return apiFetch(`/leads?${params}`, { method: "GET" }, idToken);
}

/**
 * Busca detalhes de um lead específico.
 * TODO(maestro): implementar após backend /leads/{id} estar funcional.
 */
export async function fetchLead(leadId, idToken = "") {
  return apiFetch(`/leads/${leadId}`, { method: "GET" }, idToken);
}

// ---------------------------------------------------------------------------
// Alertas (Paywall 2)
// ---------------------------------------------------------------------------

/**
 * Lista alertas do usuário.
 * TODO(maestro): implementar após backend /alertas GET estar funcional.
 */
export async function fetchAlertas({ status = "" } = {}, idToken = "") {
  const params = new URLSearchParams({ ...(status ? { status } : {}) });
  return apiFetch(`/alertas?${params}`, { method: "GET" }, idToken);
}

/**
 * Cria um novo alerta.
 * Custo: 2 créditos.
 * TODO(maestro): implementar após backend /alertas POST estar funcional.
 */
export async function createAlerta(payload, idToken = "") {
  return apiFetch("/alertas", {
    method: "POST",
    body: JSON.stringify(payload),
  }, idToken);
}

/**
 * Cancela um alerta.
 * TODO(maestro): implementar após backend /alertas/{id} DELETE estar funcional.
 */
export async function cancelAlerta(alertaId, idToken = "") {
  return apiFetch(`/alertas/${alertaId}`, { method: "DELETE" }, idToken);
}

// ---------------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------------

/**
 * Lê saldo de créditos do usuário.
 * TODO(maestro): implementar após backend /creditos/saldo estar funcional.
 */
export async function fetchSaldoCreditos(idToken = "") {
  return apiFetch("/creditos/saldo", { method: "GET" }, idToken);
}

// ---------------------------------------------------------------------------
// PJe anti-waste
// ---------------------------------------------------------------------------

/**
 * Verifica litispendência PJe.
 * TODO(maestro): implementar após backend /pje/check estar funcional.
 */
export async function checkPjeLitispendencia({ numeroProcesso, cpfHash, uf } = {}, idToken = "") {
  return apiFetch("/pje/check", {
    method: "POST",
    body: JSON.stringify({ numero_processo: numeroProcesso, cpf_hash: cpfHash, uf }),
  }, idToken);
}
