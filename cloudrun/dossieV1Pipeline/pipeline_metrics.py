"""Métricas Prometheus — serviço dossie-v1-pipeline (Cloud Run)."""

from __future__ import annotations

from prometheus_client import Counter, Histogram, generate_latest

dossie_jobs_total = Counter(
    "dossie_pipeline_jobs_total",
    "Mensagens Pub/Sub processadas",
    ["status", "slug"],
)

dossie_duration_seconds = Histogram(
    "dossie_pipeline_duration_seconds",
    "Duração do job (segundos)",
    ["slug"],
    buckets=(30.0, 60.0, 120.0, 300.0, 600.0, 1200.0, 1800.0, 3600.0),
)

findings_count = Histogram(
    "dossie_pipeline_findings_count",
    "Findings no documento final",
    ["slug"],
    buckets=(0, 5, 10, 20, 30, 40, 50, 60),
)

agent_failures_total = Counter(
    "dossie_pipeline_agent_failures_total",
    "Falhas reportadas pelo subprocesso (heurístico)",
    ["agente"],
)


def observe_job(
    status: str,
    slug: str,
    seconds: float,
    findings_n: int | None = None,
) -> None:
    dossie_jobs_total.labels(status=status, slug=slug).inc()
    if seconds > 0:
        dossie_duration_seconds.labels(slug=slug).observe(seconds)
    if findings_n is not None and findings_n >= 0:
        findings_count.labels(slug=slug).observe(float(findings_n))


def render_metrics() -> bytes:
    return generate_latest()


def content_type() -> str:
    return "text/plain; version=0.0.4; charset=utf-8"
