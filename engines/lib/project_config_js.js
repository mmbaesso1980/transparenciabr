/**
 * Identidade GCP — resolução de projectId para módulos Node.js (engines).
 *
 * Equivalente JS de engines/lib/project_config.py.
 * Hierarquia: GCP_PROJECT_ID > GOOGLE_CLOUD_PROJECT > GCLOUD_PROJECT > GCLOUD_PROJECT_ID > default.
 */

const DEFAULT_GCP_PROJECT = "transparenciabr";

/**
 * Retorna o projectId GCP seguindo a mesma hierarquia do Python.
 * @returns {string}
 */
export function projectId() {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT_ID ||
    DEFAULT_GCP_PROJECT
  );
}
