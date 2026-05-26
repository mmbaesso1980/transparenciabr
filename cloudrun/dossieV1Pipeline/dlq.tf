# Dead-letter queue — Dossiê v1 pipeline (projeto-codex-br ou variável).
# Aplicar: terraform -chdir=cloudrun/dossieV1Pipeline init && terraform apply -var="project_id=projeto-codex-br"
# A subscrição push principal deve ser atualizada com dead_letter_policy (ver scripts/provision_dossie_v1_dlq.sh).

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "Projeto GCP onde rodam Pub/Sub e Cloud Run do pipeline"
  default     = "projeto-codex-br"
}

variable "dlq_topic" {
  type    = string
  default = "dossie-v1-pipeline-dlq"
}

resource "google_pubsub_topic" "dossie_v1_pipeline_dlq" {
  project = var.project_id
  name    = var.dlq_topic
}

output "dlq_topic_id" {
  value = google_pubsub_topic.dossie_v1_pipeline_dlq.id
}
