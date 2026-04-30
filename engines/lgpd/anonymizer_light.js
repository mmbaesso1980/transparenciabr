// engines/lgpd/anonymizer.js
// Anonimizador LGPD — roda em 100% das notas/dados antes do storage
// Detecta e mascara: CPF, RG, telefone, email, endereço residencial
// PRESERVA: nomes de agentes públicos (jurisprudência STF ARE 652.777)

const PATTERNS = {
  // CPF: 000.000.000-00 ou 00000000000
  cpf: /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g,
  // RG: variável por UF, padrão genérico 7-12 dígitos com X opcional
  rg: /\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Xx]\b/g,
  // Telefone: (11) 99999-9999, 11999999999, +55 11 99999-9999
  telefone: /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g,
  // Email
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // CEP: 00000-000 ou 00000000
  cep: /\b\d{5}-?\d{3}\b/g,
};

const REPLACEMENTS = {
  cpf: '[CPF-REDACTED]',
  rg: '[RG-REDACTED]',
  telefone: '[TEL-REDACTED]',
  email: '[EMAIL-REDACTED]',
  cep: '[CEP-REDACTED]',
};

/**
 * Anonimiza um texto preservando dados de agentes públicos.
 * @param {string} text
 * @returns {{ anonymized: string, redactions: Object<string, number> }}
 */
export function anonymizeText(text) {
  if (typeof text !== 'string' || !text) return { anonymized: text, redactions: {} };
  let out = text;
  const redactions = {};
  for (const [key, regex] of Object.entries(PATTERNS)) {
    const matches = out.match(regex);
    if (matches?.length) {
      redactions[key] = matches.length;
      out = out.replace(regex, REPLACEMENTS[key]);
    }
  }
  return { anonymized: out, redactions };
}

/**
 * Anonimiza recursivamente um objeto JSON.
 * Preserva campos canônicos de agentes públicos: nome, nomeCivil, partido, cargo, etc.
 */
export function anonymizeObject(obj, opts = {}) {
  const PRESERVE_FIELDS = new Set([
    'nome', 'nomeCivil', 'nomeParlamentar', 'nomeAutor', 'nomeFornecedor',
    'partido', 'siglaPartido', 'uf', 'siglaUf', 'cargo', 'descricaoCargo',
    'orgao', 'idDeputado', 'codigoAutor', 'idLegislatura',
    'ano', 'mes', 'data', 'dataDocumento', 'numero',
    'tipo', 'tipoDocumento', 'descricao',
    'valor', 'valorLiquido', 'valorBruto', 'valorEmpenhado', 'valorPago',
    'cnpj', 'cnpjCpfFornecedor', // CNPJ de fornecedor é público
    'codigo', 'codigoMunicipio', 'codigoUF',
  ]);

  const totalRedactions = {};

  function recurse(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(recurse);
    if (typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (PRESERVE_FIELDS.has(k)) {
          out[k] = val; // mantém intacto
        } else if (typeof val === 'string') {
          const { anonymized, redactions } = anonymizeText(val);
          out[k] = anonymized;
          for (const [type, count] of Object.entries(redactions)) {
            totalRedactions[type] = (totalRedactions[type] || 0) + count;
          }
        } else {
          out[k] = recurse(val);
        }
      }
      return out;
    }
    if (typeof v === 'string') {
      const { anonymized, redactions } = anonymizeText(v);
      for (const [type, count] of Object.entries(redactions)) {
        totalRedactions[type] = (totalRedactions[type] || 0) + count;
      }
      return anonymized;
    }
    return v;
  }

  const result = recurse(obj);
  return { anonymized: result, redactions: totalRedactions };
}
