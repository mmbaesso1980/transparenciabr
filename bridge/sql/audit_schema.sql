-- Schema de auditoria para BigQuery
-- Dataset: bridge_audit
-- Tabela: events

CREATE TABLE IF NOT EXISTS `bridge_audit.events` (
  event_id STRING NOT NULL DEFAULT (GENERATE_UUID()),
  event_type STRING NOT NULL,
  actor STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  data JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY event_type, actor
OPTIONS (
  description = 'Eventos de auditoria da ponte Devin-Vertex / Protocolo WOLF',
  labels = [('modulo', 'bridge'), ('projeto', 'transparenciabr')]
);
