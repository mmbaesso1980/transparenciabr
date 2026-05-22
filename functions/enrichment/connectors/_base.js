'use strict';

class AuroraEnricherBase {
  assertLgpd(ctx) {
    if (!ctx || !ctx.lgpdAuditLogged) {
      const e = new Error(
        'Comandante Baesso: operação recusada — registo LGPD obrigatório antes do connector (motor AURORA).'
      );
      e.statusCode = 403;
      throw e;
    }
  }
}

module.exports = { AuroraEnricherBase };
