/**
 * ============================================================
 * Testes unitários — engines/lgpd/anonymizer.js
 * ============================================================
 *
 * Cobertura (11 casos):
 *   1.  hashCpf — prefixo correto + idempotência + unicidade
 *   2.  maskTelefone — máscara dos últimos 4 dígitos
 *   3.  maskEmail — substituição do local-part
 *   4.  CPF civil → hash em anonymizeText
 *   5.  CPF múltiplos em anonymizeText
 *   6.  E-mail pessoal → máscara (*** local-part)
 *   7.  E-mail governamental → mantido em claro (exceção pública)
 *   8.  CID médico em contexto médico → [CID-REDACTED]
 *   9.  CID fora de contexto médico → mantido
 *   10. Endereço residencial → [ENDERECO-REDACTED]
 *   11. anonymizeObject — recursividade + stats acumulados + exceção política
 *
 * Execução:
 *   cd engines && npx vitest run lgpd/anonymizer.test.js
 * ============================================================
 */

// vi.mock() é hoistado automaticamente pelo Vitest para o topo do arquivo.
import { vi, describe, it, expect, beforeAll } from 'vitest';

vi.mock('@google-cloud/storage', () => {
  /**
   * Stub mínimo do SDK GCS.
   * download() retorna JSON vazio; save(), getMetadata() e exists() são no-ops.
   * getFiles() retorna array vazio (não é chamado em testes unitários puros).
   */
  const fileMock = {
    download:    vi.fn().mockResolvedValue([Buffer.from('{}')]),
    save:        vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue([{ metadata: {} }]),
    exists:      vi.fn().mockResolvedValue([false]),
  };
  const bucketMock = {
    file:     vi.fn(() => fileMock),
    getFiles: vi.fn().mockResolvedValue([[]]),
  };
  return {
    Storage: class {
      bucket() { return bucketMock; }
    },
  };
});

// Salt de teste — definido antes da carga do módulo (getSalt() é lazy)
process.env.LGPD_SALT = 'salt_de_teste_unitario_2026_nao_usar_em_prod';

import {
  hashCpf,
  maskTelefone,
  maskEmail,
  anonymizeText,
  anonymizeObject,
  log,
} from './anonymizer.js';

// ============================================================
// Helpers
// ============================================================

/** CPF de político fictício para testar exceção pública. */
const CPF_POLITICO_FMT = '123.456.789-01';

// ============================================================
// 1. hashCpf
// ============================================================
describe('hashCpf', () => {
  it('retorna string com prefixo cpf_h_ e 16 hex chars', () => {
    const h = hashCpf('123.456.789-09');
    expect(h).toMatch(/^cpf_h_[0-9a-f]{16}$/);
  });

  it('gera o mesmo hash para CPF com e sem formatação', () => {
    expect(hashCpf('123.456.789-09')).toBe(hashCpf('12345678909'));
  });

  it('gera hashes diferentes para CPFs distintos', () => {
    expect(hashCpf('111.111.111-11')).not.toBe(hashCpf('222.222.222-22'));
  });
});

// ============================================================
// 2. maskTelefone
// ============================================================
describe('maskTelefone', () => {
  it('mascara 4 últimos dígitos de celular formatado', () => {
    expect(maskTelefone('(11) 99999-1234')).toBe('(11) 99999-****');
  });

  it('mascara 4 últimos dígitos sem formatação', () => {
    expect(maskTelefone('11999991234')).toBe('1199999****');
  });

  it('mascara fixo de 8 dígitos', () => {
    expect(maskTelefone('(21) 3232-5678')).toBe('(21) 3232-****');
  });
});

// ============================================================
// 3. maskEmail
// ============================================================
describe('maskEmail', () => {
  it('substitui local-part por ***', () => {
    expect(maskEmail('joao.silva@gmail.com')).toBe('***@gmail.com');
  });

  it('preserva domínio completo com subdomínio', () => {
    expect(maskEmail('usuario@empresa.com.br')).toBe('***@empresa.com.br');
  });

  it('retorna string original quando não há @', () => {
    expect(maskEmail('semArroba')).toBe('semArroba');
  });
});

// ============================================================
// 4. CPF civil em anonymizeText → hash
// ============================================================
describe('anonymizeText — CPF civil', () => {
  it('substitui CPF formatado por hash cpf_h_', () => {
    const { texto, redacoes } = anonymizeText('Contribuinte CPF 123.456.789-09 realizou pagamento.');
    expect(texto).not.toContain('123.456.789-09');
    expect(texto).toMatch(/cpf_h_[0-9a-f]{16}/);
    expect(redacoes.cpf_hash).toBe(1);
  });

  it('substitui CPF sem formatação', () => {
    const { texto, redacoes } = anonymizeText('CPF 12345678909 identificado.');
    expect(texto).not.toContain('12345678909');
    expect(redacoes.cpf_hash).toBe(1);
  });
});

// ============================================================
// 5. CPF múltiplos
// ============================================================
describe('anonymizeText — múltiplos CPFs', () => {
  it('conta corretamente 2 CPFs distintos', () => {
    const { redacoes } = anonymizeText(
      'CPF1: 111.111.111-11 e CPF2: 222.222.222-22 localizados.'
    );
    expect(redacoes.cpf_hash).toBe(2);
  });
});

// ============================================================
// 6. E-mail pessoal → máscara
// ============================================================
describe('anonymizeText — e-mail pessoal', () => {
  it('substitui local-part de e-mail pessoal', () => {
    const { texto, redacoes } = anonymizeText('Contato: maria.santos@hotmail.com para retorno.');
    expect(texto).toContain('***@hotmail.com');
    expect(texto).not.toContain('maria.santos');
    expect(redacoes.email_mask).toBe(1);
  });
});

// ============================================================
// 7. E-mail governamental → exceção pública
// ============================================================
describe('anonymizeText — e-mail governamental (exceção)', () => {
  it('mantém e-mail gov.br em claro', () => {
    const { texto, redacoes } = anonymizeText('Ofício enviado a joao@tcu.gov.br.');
    expect(texto).toContain('joao@tcu.gov.br');
    expect(redacoes.email_mask).toBe(0);
  });

  it('mantém e-mail leg.br em claro', () => {
    const { texto, redacoes } = anonymizeText('Contato: senador@senado.leg.br.');
    expect(texto).toContain('senador@senado.leg.br');
    expect(redacoes.email_mask).toBe(0);
  });

  it('mantém e-mail jus.br em claro', () => {
    const { texto, redacoes } = anonymizeText('Decisão de juiz@stj.jus.br publicada.');
    expect(texto).toContain('juiz@stj.jus.br');
    expect(redacoes.email_mask).toBe(0);
  });

  it('mantém e-mail mp.br em claro', () => {
    const { texto, redacoes } = anonymizeText('Manifesto de promotor@mpf.mp.br arquivado.');
    expect(texto).toContain('promotor@mpf.mp.br');
    expect(redacoes.email_mask).toBe(0);
  });
});

// ============================================================
// 8. CID médico em contexto médico → [CID-REDACTED]
// ============================================================
describe('anonymizeText — CID médico (contexto presente)', () => {
  it('redacta CID quando palavra "hospital" presente', () => {
    const { texto, redacoes } = anonymizeText(
      'Paciente internado no hospital com diagnóstico F32.0.'
    );
    expect(texto).toContain('[CID-REDACTED]');
    expect(texto).not.toContain('F32.0');
    expect(redacoes.cid_redacted).toBeGreaterThan(0);
  });

  it('redacta CID quando palavra "consulta" presente', () => {
    const { texto, redacoes } = anonymizeText('Consulta registrada: K21 diagnosticado.');
    expect(texto).toContain('[CID-REDACTED]');
    expect(redacoes.cid_redacted).toBe(1);
  });

  it('redacta CID quando palavra "exame" presente', () => {
    const { texto, redacoes } = anonymizeText('Exame revelou J45 e Z82.');
    expect(redacoes.cid_redacted).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 9. CID fora de contexto médico → mantido
// ============================================================
describe('anonymizeText — CID sem contexto médico', () => {
  it('não redacta CID quando não há palavra-gatilho médica', () => {
    // A12, B34 parecem CIDs mas não há contexto médico → mantidos
    const { texto, redacoes } = anonymizeText(
      'Contrato A12 referente ao item B34 do edital licitatório.'
    );
    expect(texto).toContain('A12');
    expect(texto).toContain('B34');
    expect(redacoes.cid_redacted).toBe(0);
  });
});

// ============================================================
// 10. Endereço residencial → [ENDERECO-REDACTED]
// ============================================================
describe('anonymizeText — endereço residencial', () => {
  it('redacta logradouro "Rua" com número', () => {
    const { texto, redacoes } = anonymizeText('Morador da Rua das Palmeiras, 123 notificado.');
    expect(texto).toContain('[ENDERECO-REDACTED]');
    expect(redacoes.endereco_redacted).toBe(1);
  });

  it('redacta logradouro "Av." com número', () => {
    const { texto, redacoes } = anonymizeText('Endereço: Av. Paulista 1578.');
    expect(texto).toContain('[ENDERECO-REDACTED]');
    expect(redacoes.endereco_redacted).toBe(1);
  });
});

// ============================================================
// 11. anonymizeObject — recursividade, stats e exceção política
// ============================================================
describe('anonymizeObject — objeto aninhado', () => {
  it('anonimiza strings em todas as profundidades do objeto', () => {
    const doc = {
      titulo:  'Nota fiscal',
      cpf:     '123.456.789-09',
      contato: {
        email:    'joao@gmail.com',
        telefone: '(11) 91234-5678',
      },
      itens: [
        { descricao: 'Item CPF 987.654.321-00 verificado' },
      ],
    };

    const { obj, stats } = anonymizeObject(doc);

    // CPF no nível raiz
    expect(obj.cpf).toMatch(/^cpf_h_/);
    // E-mail aninhado
    expect(obj.contato.email).toBe('***@gmail.com');
    // Telefone aninhado
    expect(obj.contato.telefone).toContain('****');
    // CPF em array aninhado
    expect(obj.itens[0].descricao).toMatch(/cpf_h_/);

    // Estatísticas acumuladas
    expect(stats.cpf_hash).toBe(2);
    expect(stats.email_mask).toBe(1);
    expect(stats.telefone_mask).toBe(1);
  });

  it('preserva valores não-string (number, boolean, null, array de números)', () => {
    const doc = {
      valor:  1234.56,
      ativo:  true,
      nulo:   null,
      lista:  [1, 2, 3],
    };

    const { obj } = anonymizeObject(doc);

    expect(obj.valor).toBe(1234.56);
    expect(obj.ativo).toBe(true);
    expect(obj.nulo).toBeNull();
    expect(obj.lista).toEqual([1, 2, 3]);
  });

  it('retorna stats zerados para documento sem PII', () => {
    const { stats } = anonymizeObject({ titulo: 'Relatório de auditoria', numero: 42 });
    expect(stats.cpf_hash).toBe(0);
    expect(stats.email_mask).toBe(0);
    expect(stats.telefone_mask).toBe(0);
    expect(stats.cid_redacted).toBe(0);
    expect(stats.endereco_redacted).toBe(0);
  });

  it('mantém e-mail institucional (gov.br) mesmo aninhado dentro de objeto', () => {
    const doc = {
      remetente: { email: 'auditor@cgu.gov.br' },
      assunto:   'Relatório',
    };
    const { obj, stats } = anonymizeObject(doc);
    // E-mail governamental NÃO deve ser mascarado
    expect(obj.remetente.email).toBe('auditor@cgu.gov.br');
    expect(stats.email_mask).toBe(0);
  });
});

// ============================================================
// 12. log — formato JSON estruturado
// ============================================================
describe('log — logger estruturado JSON', () => {
  it('grava JSON válido com campos obrigatórios no stdout (INFO)', () => {
    const capturas = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { capturas.push(chunk); return true; };

    log('INFO', 'teste_evento_info', { chave: 'valor' });

    process.stdout.write = original;

    expect(capturas.length).toBeGreaterThan(0);
    const entrada = JSON.parse(capturas[0]);
    expect(entrada.severity).toBe('INFO');
    expect(entrada.event).toBe('teste_evento_info');
    expect(entrada.chave).toBe('valor');
    expect(typeof entrada.timestamp).toBe('string');
  });

  it('grava WARN/ERROR no stderr', () => {
    const capturas = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { capturas.push(chunk); return true; };

    log('ERROR', 'erro_grave_teste', { mensagem: 'falha crítica' });

    process.stderr.write = original;

    expect(capturas.length).toBeGreaterThan(0);
    const entrada = JSON.parse(capturas[0]);
    expect(entrada.severity).toBe('ERROR');
    expect(entrada.event).toBe('erro_grave_teste');
  });
});
