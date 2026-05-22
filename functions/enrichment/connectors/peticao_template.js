'use strict';

const { Storage } = require('@google-cloud/storage');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { BigQuery } = require('@google-cloud/bigquery');
const { AuroraEnricherBase } = require('./_base.js');

const GCS_BUCKET = process.env.GCS_BUCKET || 'tbr-leads-staging';
const TEMPLATE_OBJECT = process.env.PETICAO_TEMPLATE_OBJECT || 'templates/peticoes/template_universal.docx';
const OUTPUT_BUCKET = process.env.PETICAO_OUTPUT_BUCKET || 'tbr-peticoes-geradas';

let _bq;
function getBq() {
  if (!_bq) _bq = new BigQuery();
  return _bq;
}

class PeticaoTemplateConnector extends AuroraEnricherBase {
  /**
   * @param {{ template_id: string, dados_cliente: object, lead_id: string }} input
   * @param {object} ctx
   */
  async enrich(input, ctx) {
    this.assertLgpd(ctx);
    const { template_id, dados_cliente, lead_id } = input || {};
    if (!template_id || !dados_cliente || !lead_id) {
      const e = new Error('template_id, dados_cliente e lead_id são obrigatórios.');
      e.statusCode = 400;
      throw e;
    }

    const storage = new Storage();
    const src = storage.bucket(GCS_BUCKET).file(TEMPLATE_OBJECT);
    const [exists] = await src.exists();
    if (!exists) {
      const e = new Error(
        `Template DOCX ausente em gs://${GCS_BUCKET}/${TEMPLATE_OBJECT}. Envie o ficheiro real antes de gerar petições.`
      );
      e.statusCode = 503;
      throw e;
    }

    const [buf] = await src.download();
    const zip = new PizZip(buf);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    const dc = dados_cliente || {};
    doc.render({
      NOME_CLIENTE: dc.nome || '',
      CPF: dc.cpf || '',
      ESPECIE: dc.especie || '',
      MOTIVO: dc.motivo || '',
      TESE_JURIDICA: dc.tese_juridica || '',
      APS: dc.aps || '',
      LEAD_NOME: dc.nome || '',
      LEAD_CPF: dc.cpf || '',
      MOTIVO_INDEFERIMENTO: dc.motivo || '',
      DT_INDEFERIMENTO: dc.dt_indeferimento || '',
    });
    const outBuf = doc.getZip().generate({ type: 'nodebuffer' });
    const ts = Date.now();
    const objectPath = `${lead_id}/${ts}.docx`;
    const dest = storage.bucket(OUTPUT_BUCKET).file(objectPath);
    await dest.save(outBuf, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    const [docxUrl] = await dest.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const audit_id = ctx.auditId || `pet_${ts}`;
    const row = {
      audit_id,
      lead_id: String(lead_id),
      template_id: String(template_id),
      docx_gcs_uri: `gs://${OUTPUT_BUCKET}/${objectPath}`,
      docx_signed_url: docxUrl,
      pdf_url: '',
      created_at: new Date(),
    };
    await getBq().dataset('tbr_leads_prev').table('peticoes_geradas').insert([row]);

    return { docx_url: docxUrl, pdf_url: '', audit_id };
  }
}

module.exports = { PeticaoTemplateConnector };
