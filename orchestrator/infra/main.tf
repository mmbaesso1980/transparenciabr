###############################################################################
# transparenciabr — Sprint 2 Orchestrator Infrastructure
# Terraform >= 1.6, providers: google + google-beta
###############################################################################

terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.26"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.26"
    }
  }
}

###############################################################################
# Providers
###############################################################################

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

###############################################################################
# Local values
###############################################################################

locals {
  agent_ids    = toset([for i in range(1, 13) : tostring(i)])  # "1" .. "12"
  service_name = "agent-worker"
  function_name = "orchestrator-trigger"
}

###############################################################################
# Service Account
###############################################################################

resource "google_service_account" "agent_worker_sa" {
  account_id   = "agent-worker-sa"
  display_name = "Agent Worker Service Account (transparenciabr)"
  description  = "Used by Cloud Run agent workers and Pub/Sub subscriptions"
}

# Vertex AI user — invoke Reasoning Engine
resource "google_project_iam_member" "agent_worker_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent_worker_sa.email}"
}

# Storage object admin on datalake bucket
resource "google_storage_bucket_iam_member" "agent_worker_datalake" {
  bucket = var.datalake_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.agent_worker_sa.email}"
}

# Storage object viewer on arsenal bucket (catalog reads)
resource "google_storage_bucket_iam_member" "agent_worker_arsenal" {
  bucket = var.arsenal_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.agent_worker_sa.email}"
}

# Secret Manager accessor (LGPD salt)
resource "google_project_iam_member" "agent_worker_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.agent_worker_sa.email}"
}

# Allow Cloud Run invoker for Pub/Sub push
resource "google_project_iam_member" "agent_worker_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.agent_worker_sa.email}"
}

###############################################################################
# Pub/Sub — Dead-Letter Queue topic
###############################################################################

resource "google_pubsub_topic" "ingest_dlq" {
  name = "ingest-dlq"

  message_retention_duration = "604800s" # 7 days

  labels = {
    managed_by = "terraform"
    sprint     = "s2"
  }
}

###############################################################################
# Pub/Sub — Fan-out topic
###############################################################################

resource "google_pubsub_topic" "ingest_fan" {
  name = "ingest-fan"

  message_retention_duration = "86400s" # 24 hours

  labels = {
    managed_by = "terraform"
    sprint     = "s2"
  }
}

###############################################################################
# Cloud Run — Agent Worker service
###############################################################################

resource "google_cloud_run_v2_service" "agent_worker" {
  provider = google-beta
  name     = local.service_name
  location = var.region

  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.agent_worker_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 12
    }

    timeout = "900s"

    containers {
      image = "gcr.io/${var.project_id}/${local.service_name}:latest"

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "ARSENAL_BUCKET"
        value = var.arsenal_bucket
      }
      env {
        name  = "DATALAKE_BUCKET_RAW"
        value = var.datalake_bucket
      }
      env {
        name  = "LGPD_SALT_SECRET_NAME"
        value = var.lgpd_salt_secret_name
      }
      env {
        name  = "NUM_AGENTS"
        value = "12"
      }
      env {
        name  = "PUBSUB_TOPIC"
        value = google_pubsub_topic.ingest_fan.name
      }

      liveness_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        initial_delay_seconds = 10
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      startup_probe {
        http_get {
          path = "/readyz"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        timeout_seconds       = 5
        failure_threshold     = 10
      }

      ports {
        container_port = 8080
      }
    }
  }

  labels = {
    managed_by = "terraform"
    sprint     = "s2"
  }

  depends_on = [google_project_iam_member.agent_worker_aiplatform]
}

###############################################################################
# Pub/Sub — 12 push subscriptions (one per agent)
###############################################################################

resource "google_pubsub_subscription" "agent" {
  for_each = local.agent_ids

  name  = "agent-sub-${each.key}"
  topic = google_pubsub_topic.ingest_fan.name

  # Message filter — each subscription routes messages for its own agent_id
  filter = "attributes.agent_id = \"${each.key}\""

  ack_deadline_seconds       = 600  # 10 min (matches Cloud Run timeout)
  message_retention_duration = "86400s"
  retain_acked_messages      = false

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.agent_worker.uri}/"

    oidc_token {
      service_account_email = google_service_account.agent_worker_sa.email
      audience              = google_cloud_run_v2_service.agent_worker.uri
    }

    attributes = {
      x-goog-version = "v1"
    }
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.ingest_dlq.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "60s"
    maximum_backoff = "600s"
  }

  labels = {
    managed_by = "terraform"
    sprint     = "s2"
    agent_id   = each.key
  }
}

###############################################################################
# Cloud Functions gen2 — Orchestrator Trigger
###############################################################################

# Upload source archive — use a GCS object containing the function source.
# CI pipeline is responsible for uploading the zip before terraform apply.
resource "google_storage_bucket_object" "orchestrator_source" {
  name   = "functions/orchestrator-trigger-source.zip"
  bucket = var.arsenal_bucket
  source = var.orchestrator_source_zip
}

resource "google_cloudfunctions2_function" "orchestrator_trigger" {
  provider = google-beta
  name     = local.function_name
  location = var.region
  description = "Partitions the API catalog and publishes batches to Pub/Sub"

  build_config {
    runtime     = "nodejs22"
    entry_point = "orchestratorTrigger"

    source {
      storage_source {
        bucket = var.arsenal_bucket
        object = google_storage_bucket_object.orchestrator_source.name
      }
    }
  }

  service_config {
    available_memory      = "512Mi"
    timeout_seconds       = 540
    max_instance_count    = 3
    min_instance_count    = 0
    service_account_email = google_service_account.agent_worker_sa.email

    environment_variables = {
      GCP_PROJECT_ID   = var.project_id
      ARSENAL_BUCKET   = var.arsenal_bucket
      PUBSUB_TOPIC     = google_pubsub_topic.ingest_fan.name
      NUM_AGENTS       = "12"
    }
  }

  labels = {
    managed_by = "terraform"
    sprint     = "s2"
  }
}

# Allow unauthenticated HTTP for Cloud Scheduler invocations
# (Cloud Scheduler uses OIDC; public invoke is gated by scheduler's SA)
resource "google_cloudfunctions2_function_iam_member" "orchestrator_invoker" {
  project        = var.project_id
  location       = var.region
  cloud_function = google_cloudfunctions2_function.orchestrator_trigger.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${google_service_account.agent_worker_sa.email}"
}

###############################################################################
# Cloud Scheduler — Daily imediata run at 05:00 UTC (02:00 Brasília)
###############################################################################

resource "google_cloud_scheduler_job" "daily_imediata" {
  name        = "daily-imediata-trigger"
  region      = var.region
  description = "Kicks orchestrator_trigger for priority=imediata at 05:00 UTC (02:00 Brasília)"
  schedule    = "0 5 * * *"
  time_zone   = "UTC"

  http_target {
    uri         = "${google_cloudfunctions2_function.orchestrator_trigger.service_config[0].uri}?priority=imediata"
    http_method = "POST"
    body        = base64encode("{\"priority\":\"imediata\"}")

    headers = {
      "Content-Type" = "application/json"
    }

    oidc_token {
      service_account_email = google_service_account.agent_worker_sa.email
      audience              = google_cloudfunctions2_function.orchestrator_trigger.service_config[0].uri
    }
  }

  retry_config {
    retry_count          = 3
    min_backoff_duration = "5s"
    max_backoff_duration = "3600s"
    max_doublings        = 5
  }

  depends_on = [google_cloudfunctions2_function.orchestrator_trigger]
}

###############################################################################
# Outputs
###############################################################################

output "cloud_run_url" {
  description = "Cloud Run agent worker service URL"
  value       = google_cloud_run_v2_service.agent_worker.uri
}

output "topic_id" {
  description = "Pub/Sub fan-out topic ID"
  value       = google_pubsub_topic.ingest_fan.id
}

output "dlq_topic_id" {
  description = "Pub/Sub dead-letter topic ID"
  value       = google_pubsub_topic.ingest_dlq.id
}

output "function_uri" {
  description = "Cloud Function HTTP trigger URI"
  value       = google_cloudfunctions2_function.orchestrator_trigger.service_config[0].uri
}

output "agent_worker_sa_email" {
  description = "Service account email for the agent worker"
  value       = google_service_account.agent_worker_sa.email
}
