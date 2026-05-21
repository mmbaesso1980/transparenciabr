import { sherlockScan } from './sherlock.js';
import { shodanLookup } from './shodan.js';
import { truecallerLookup } from './truecaller.js';
import { googleDorks } from './dorks.js';
import { cadastroPreLookup } from './cadastropre.js';
import { logEvent } from '../utils/audit.js';

const CEL_RE = /^\(\d{2}\)\s?9?\d{4}-?\d{4}$/;

/**
 * Cascata de enriquecimento (custo crescente). Para no primeiro celular BR válido.
 */
export async function enriqueceCelular({ cpf, nome, jobId }) {
  const camadas = [
    { nome: 'cadastropre', fn: () => cadastroPreLookup({ cpf }), custo: 0 },
    { nome: 'dorks', fn: () => googleDorks({ nome, cpf }), custo: 0 },
    { nome: 'sherlock', fn: () => sherlockScan({ nome }), custo: 0 },
    { nome: 'shodan', fn: () => shodanLookup({ nome, cpf }), custo: 0.01 },
    { nome: 'truecaller', fn: () => truecallerLookup({ nome }), custo: 0 },
  ];

  for (const camada of camadas) {
    try {
      const r = await camada.fn();
      await logEvent({
        jobId,
        evento: `OSINT_${camada.nome.toUpperCase()}`,
        detalhes: JSON.stringify({ hit: !!r?.celular }),
        custoBrl: camada.custo,
      });
      if (r?.celular && CEL_RE.test(String(r.celular).trim())) {
        return { celular: r.celular, fonte: camada.nome, confianca: r.confianca || 'media' };
      }
    } catch (e) {
      await logEvent({
        jobId,
        evento: `OSINT_${camada.nome.toUpperCase()}_ERRO`,
        detalhes: String(e?.message || e),
      });
    }
  }
  return { celular: null, fonte: null, confianca: null };
}
