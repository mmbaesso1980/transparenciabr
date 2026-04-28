/**
 * Classe base para ingestores do Data Lake (particionamento estilo Hive / BigQuery external tables).
 *
 * Padrão de path (Prisma ARIMA / lacunas temporais):
 *   {prefixo}/ano={YYYY}/mes={MM}/dia={DD}/{nome_ficheiro}
 *
 * Exemplo:
 *   fontes/camara/deputados/ano=2026/mes=04/dia=28/payload_completo.json
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {Date | string | number} [input] - default: agora (UTC)
 */
export function hivePartitionFromDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      ano: String(now.getUTCFullYear()),
      mes: pad2(now.getUTCMonth() + 1),
      dia: pad2(now.getUTCDate()),
    };
  }
  return {
    ano: String(d.getUTCFullYear()),
    mes: pad2(d.getUTCMonth() + 1),
    dia: pad2(d.getUTCDate()),
  };
}

/**
 * Monta o segmento `ano=…/mes=…/dia=…`.
 */
export function hivePartitionPath(part = hivePartitionFromDate()) {
  const { ano, mes, dia } = part;
  return `ano=${ano}/mes=${mes}/dia=${dia}`;
}

/**
 * Path completo Hive sob um prefixo de fonte (sem barra inicial/final).
 *
 * @param {string} prefixoExemplo - ex: `fontes/camara/deputados`
 * @param {string} nomeFicheiro - ex: `payload_completo.json`
 * @param {Date | string | number} [dataRef]
 */
export function buildHiveDestination(prefixoExemplo, nomeFicheiro, dataRef) {
  const pre = String(prefixoExemplo).replace(/^\/+|\/+$/g, "");
  const name = String(nomeFicheiro).replace(/^\/+/, "");
  const part = hivePartitionPath(hivePartitionFromDate(dataRef));
  return `${pre}/${part}/${name}`;
}

/**
 * Ingestor base: subclasses podem chamar `destinoPara` e `uploadJson`.
 */
export class BaseIngestor {
  /**
   * @param {{ fonte: string, recurso: string, bucket?: string }} config
   *   Ex: { fonte: "camara", recurso: "deputados" } → prefixo `fontes/camara/deputados`
   */
  constructor(config) {
    this.fonte = String(config.fonte).replace(/\/+/g, "");
    this.recurso = String(config.recurso).replace(/\/+/g, "");
    this.bucket = config.bucket;
    this.prefixo = `fontes/${this.fonte}/${this.recurso}`;
  }

  /**
   * @param {string} nomeFicheiro
   * @param {Date} [dataRef]
   * @returns {string} path object GCS
   */
  destinoPara(nomeFicheiro, dataRef) {
    return buildHiveDestination(this.prefixo, nomeFicheiro, dataRef);
  }
}

export default BaseIngestor;
