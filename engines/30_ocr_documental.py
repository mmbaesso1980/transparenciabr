#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/30_ocr_documental.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pipeline OCR Híbrido L4 — TransparênciaBR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Processamento massivo de PDFs do DOU, DOEs estaduais e LOA federal.
Hardware alvo: g2-standard-8 (8 vCPU, 1× L4 GPU 24 GB).

Estratégia OCR (por página):
  1. pdfplumber.extract_text() — se len(text) > 100 chars: texto nativo, ok.
  2. pdf2image (poppler) → PaddleOCR PP-OCRv4 (GPU, lang='pt').
  3. Se confiança média PaddleOCR < 70%: fallback docTR (CPU/GPU).
  4. Se docTR também falha (conf < 60%): marca página como _quarantine.

Saída:
  gs://datalake-tbr-clean/diarios/YYYY/MM/DD/edicao_{N}.jsonl
  Cada linha: {page, text, conf, engine, pdf_source, ts_proc}

Concorrência:
  8 PDFs em paralelo (ThreadPoolExecutor) — satura GPU L4 via PaddleOCR.
  Limite documento_ai_fallback desativado: custo → hard-stop US$50/dia.

Billing:
  PaddleOCR e docTR locais → custo_usd=0.0.
  Document AI (fallback extremo): ABORTA se check_daily_spend() retornar False.
"""

from __future__ import annotations

import argparse
import datetime
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional

# ── Billing guardrail ─────────────────────────────────────────────────────────
# Importado primeiro; falha silenciosa se lib não disponível (desenvolvimento local).
try:
    from engines.lib.billing_guardrail import assert_within_budget, record_spend
except ImportError:
    try:
        sys.path.insert(0, str(Path(__file__).parents[1]))
        from engines.lib.billing_guardrail import assert_within_budget, record_spend
    except ImportError:
        def assert_within_budget(threshold_usd=50.0): pass
        def record_spend(servico, custo_usd): pass

# ── Logging estruturado ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("tbr.ocr_documental")

# ── Constantes ─────────────────────────────────────────────────────────────────
GCS_RAW_BUCKET   = os.environ.get("GCS_RAW_BUCKET",   "datalake-tbr-raw")
GCS_CLEAN_BUCKET = os.environ.get("GCS_CLEAN_BUCKET", "datalake-tbr-clean")
PADDLE_CONF_THRESHOLD = float(os.environ.get("PADDLE_CONF_THRESHOLD", "70.0"))
DOCTR_CONF_THRESHOLD  = float(os.environ.get("DOCTR_CONF_THRESHOLD",  "60.0"))
TEXT_MIN_CHARS        = int(os.environ.get("TEXT_MIN_CHARS", "100"))
MAX_WORKERS           = int(os.environ.get("OCR_MAX_WORKERS", "8"))
PDF_DPI               = int(os.environ.get("PDF_DPI", "300"))
BILLING_CHECK_EVERY   = int(os.environ.get("BILLING_CHECK_EVERY", "1000"))  # páginas

# ── Lazy imports (pesados) ─────────────────────────────────────────────────────
_paddle_ocr_instance = None
_doctr_model         = None


def _get_paddle() -> "PaddleOCR":
    """Inicializa PaddleOCR PP-OCRv4 com GPU (singleton)."""
    global _paddle_ocr_instance
    if _paddle_ocr_instance is None:
        from paddleocr import PaddleOCR  # type: ignore
        logger.info("Inicializando PaddleOCR PP-OCRv4 (use_gpu=True, lang=pt)...")
        _paddle_ocr_instance = PaddleOCR(
            use_angle_cls=True,
            lang="pt",
            use_gpu=True,
            show_log=False,
            # PP-OCRv4 — modelo mais recente
            rec_model_dir=None,   # usa modelo padrão PP-OCRv4
            det_model_dir=None,
            cls_model_dir=None,
        )
        logger.info("PaddleOCR inicializado com sucesso.")
    return _paddle_ocr_instance


def _get_doctr():
    """Inicializa docTR (fallback — CPU ou GPU secundária)."""
    global _doctr_model
    if _doctr_model is None:
        try:
            from doctr.models import ocr_predictor  # type: ignore
            logger.info("Inicializando docTR (fallback)...")
            _doctr_model = ocr_predictor(pretrained=True)
            logger.info("docTR inicializado.")
        except ImportError:
            logger.warning("docTR não instalado — fallback indisponível.")
            _doctr_model = None
    return _doctr_model


# ── GPU util ──────────────────────────────────────────────────────────────────

def _gpu_utilization() -> Optional[int]:
    """Retorna utilização GPU (%) via nvidia-smi. Retorna None se indisponível."""
    try:
        saida = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            timeout=5
        ).decode().strip()
        return int(saida.split("\n")[0].strip())
    except Exception:
        return None


# ── OCR por página ─────────────────────────────────────────────────────────────

def ocr_pagina_paddle(imagem_bytes: bytes) -> tuple[str, float]:
    """
    Executa PaddleOCR em bytes de imagem PNG/JPEG.

    Retorna:
        (texto, confiança_média_%)
    """
    import numpy as np  # type: ignore
    from PIL import Image  # type: ignore

    imagem = Image.open(io.BytesIO(imagem_bytes)).convert("RGB")
    arr = np.array(imagem)

    ocr = _get_paddle()
    resultado = ocr.ocr(arr, cls=True)

    if not resultado or not resultado[0]:
        return "", 0.0

    textos = []
    confs  = []
    for linha in resultado[0]:
        if linha and len(linha) >= 2:
            _bbox, (texto, conf) = linha
            textos.append(str(texto))
            confs.append(float(conf) * 100)

    texto_final = "\n".join(textos)
    conf_media  = sum(confs) / len(confs) if confs else 0.0
    return texto_final, conf_media


def ocr_pagina_doctr(imagem_bytes: bytes) -> tuple[str, float]:
    """
    Executa docTR em bytes de imagem.

    Retorna:
        (texto, confiança_média_%)
    """
    modelo = _get_doctr()
    if modelo is None:
        return "", 0.0

    try:
        from doctr.io import DocumentFile  # type: ignore
        doc = DocumentFile.from_images([imagem_bytes])
        resultado = modelo(doc)

        textos = []
        confs  = []
        for pagina in resultado.pages:
            for bloco in pagina.blocks:
                for linha in bloco.lines:
                    for palavra in linha.words:
                        textos.append(palavra.value)
                        confs.append(float(palavra.confidence) * 100)

        texto_final = " ".join(textos)
        conf_media  = sum(confs) / len(confs) if confs else 0.0
        return texto_final, conf_media
    except Exception as exc:
        logger.warning("docTR falhou: %s", exc)
        return "", 0.0


# ── Processamento de PDF ───────────────────────────────────────────────────────

def processar_pdf(
    pdf_path: str,
    gcs_output_prefix: str,
    edicao_id: str,
) -> dict:
    """
    Processa um PDF completo com pipeline OCR híbrido.

    Parâmetros:
        pdf_path          — caminho local ou gs:// do PDF.
        gcs_output_prefix — prefixo GCS de saída (sem barra final).
        edicao_id         — identificador único da edição.

    Retorna dict com métricas de execução.
    """
    assert_within_budget(threshold_usd=50.0)

    import pdfplumber  # type: ignore
    from pdf2image import convert_from_bytes  # type: ignore
    from PIL import Image  # type: ignore

    metricas = {
        "pdf_source": pdf_path,
        "edicao_id": edicao_id,
        "pages_done": 0,
        "pages_native": 0,
        "pages_paddle": 0,
        "pages_doctr": 0,
        "pages_quarantine": 0,
        "ts_inicio": datetime.datetime.utcnow().isoformat() + "Z",
        "gpu_util_pct": _gpu_utilization(),
        "usd_por_pagina": 0.0,   # OCR local = gratuito
    }

    # Carrega PDF (local ou GCS)
    if pdf_path.startswith("gs://"):
        pdf_bytes = _baixar_gcs(pdf_path)
    else:
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    paginas_jsonl: List[dict] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        n_paginas = len(pdf.pages)
        logger.info("%s — %d páginas detectadas.", edicao_id, n_paginas)

        # Converte todas as páginas pra imagem (necessário para OCR)
        imagens_pil = convert_from_bytes(pdf_bytes, dpi=PDF_DPI)

        for i, (pagina_pdf, imagem_pil) in enumerate(zip(pdf.pages, imagens_pil), start=1):
            texto_final = ""
            conf_final  = 100.0
            engine_usada = "pdfplumber"

            # Passo 1: texto nativo
            texto_nativo = pagina_pdf.extract_text() or ""
            if len(texto_nativo.strip()) > TEXT_MIN_CHARS:
                texto_final  = texto_nativo
                engine_usada = "pdfplumber"
                metricas["pages_native"] += 1
            else:
                # Passo 2: PaddleOCR
                buf = io.BytesIO()
                imagem_pil.save(buf, format="PNG")
                imagem_bytes = buf.getvalue()

                texto_paddle, conf_paddle = ocr_pagina_paddle(imagem_bytes)

                if conf_paddle >= PADDLE_CONF_THRESHOLD and texto_paddle:
                    texto_final  = texto_paddle
                    conf_final   = conf_paddle
                    engine_usada = "paddleocr_pp-ocrv4"
                    metricas["pages_paddle"] += 1
                    record_spend("paddleocr_gpu", 0.0)
                else:
                    # Passo 3: docTR fallback
                    logger.debug(
                        "Página %d/%d: PaddleOCR conf=%.1f%% < %.1f%% → docTR.",
                        i, n_paginas, conf_paddle, PADDLE_CONF_THRESHOLD
                    )
                    texto_doctr, conf_doctr = ocr_pagina_doctr(imagem_bytes)

                    if conf_doctr >= DOCTR_CONF_THRESHOLD and texto_doctr:
                        texto_final  = texto_doctr
                        conf_final   = conf_doctr
                        engine_usada = "doctr"
                        metricas["pages_doctr"] += 1
                        record_spend("doctr_cpu", 0.0)
                    else:
                        # Passo 4: quarentena
                        logger.warning(
                            "Página %d/%d: docTR conf=%.1f%% — marcando _quarantine.",
                            i, n_paginas, conf_doctr
                        )
                        texto_final  = texto_paddle or texto_doctr or ""
                        conf_final   = max(conf_paddle, conf_doctr)
                        engine_usada = "_quarantine"
                        metricas["pages_quarantine"] += 1

            paginas_jsonl.append({
                "page":       i,
                "text":       texto_final,
                "conf":       round(conf_final, 2),
                "engine":     engine_usada,
                "pdf_source": pdf_path,
                "ts_proc":    datetime.datetime.utcnow().isoformat() + "Z",
            })
            metricas["pages_done"] += 1

    # Salva JSONL no GCS
    gcs_dest = f"{gcs_output_prefix}/{edicao_id}.jsonl"
    _salvar_gcs(gcs_dest, paginas_jsonl)

    metricas["ts_fim"]    = datetime.datetime.utcnow().isoformat() + "Z"
    metricas["gcs_dest"]  = gcs_dest
    metricas["gpu_util_pct_fim"] = _gpu_utilization()

    logger.info(
        "%s — concluído: %d páginas | nativas=%d | paddle=%d | doctr=%d | quarentena=%d | GPU=%s%%",
        edicao_id,
        metricas["pages_done"],
        metricas["pages_native"],
        metricas["pages_paddle"],
        metricas["pages_doctr"],
        metricas["pages_quarantine"],
        metricas.get("gpu_util_pct_fim", "N/A"),
    )
    return metricas


# ── GCS helpers ────────────────────────────────────────────────────────────────

def _baixar_gcs(gcs_uri: str) -> bytes:
    """Baixa objeto GCS e retorna bytes."""
    from google.cloud import storage  # type: ignore
    cliente = storage.Client()
    bucket_name, blob_name = gcs_uri.replace("gs://", "").split("/", 1)
    bucket = cliente.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()


def _salvar_gcs(gcs_uri: str, paginas: List[dict]) -> None:
    """Serializa lista de dicts como JSONL e faz upload para GCS."""
    from google.cloud import storage  # type: ignore
    cliente = storage.Client()
    bucket_name, blob_name = gcs_uri.replace("gs://", "").split("/", 1)
    bucket = cliente.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    conteudo = "\n".join(json.dumps(p, ensure_ascii=False) for p in paginas) + "\n"
    blob.upload_from_string(conteudo.encode("utf-8"), content_type="application/x-ndjson")
    logger.debug("Salvo: %s (%d bytes)", gcs_uri, len(conteudo))


def _listar_pdfs_gcs(prefixo: str, bucket_name: str) -> List[str]:
    """Lista todos os blobs PDF em um prefixo GCS."""
    from google.cloud import storage  # type: ignore
    cliente = storage.Client()
    bucket = cliente.bucket(bucket_name)
    blobs = bucket.list_blobs(prefix=prefixo)
    return [f"gs://{bucket_name}/{b.name}" for b in blobs if b.name.lower().endswith(".pdf")]


# ── Entrada principal ──────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pipeline OCR híbrido L4 — TransparênciaBR"
    )
    parser.add_argument(
        "--prefixo-raw",
        default="diarios/",
        help="Prefixo GCS no bucket RAW a processar (ex: 'diarios/' ou 'loa/')"
    )
    parser.add_argument(
        "--prefixo-clean",
        default="diarios/",
        help="Prefixo de saída no bucket CLEAN"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help="Número de PDFs em paralelo (padrão: 8)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Lista PDFs mas não executa OCR"
    )
    args = parser.parse_args()

    logger.info("━━━━ Pipeline OCR L4 iniciado ━━━━")
    logger.info("Raw bucket  : gs://%s/%s", GCS_RAW_BUCKET, args.prefixo_raw)
    logger.info("Clean bucket: gs://%s/%s", GCS_CLEAN_BUCKET, args.prefixo_clean)
    logger.info("Workers     : %d", args.workers)

    # Verificação GPU
    gpu = _gpu_utilization()
    if gpu is not None:
        logger.info("GPU L4 utilização inicial: %d%%", gpu)
    else:
        logger.warning("nvidia-smi indisponível — GPU não detectada.")

    # Warm-up PaddleOCR
    logger.info("Warm-up PaddleOCR...")
    try:
        _get_paddle()
        logger.info("PaddleOCR pronto.")
    except Exception as exc:
        logger.error("PaddleOCR falhou no warm-up: %s", exc)

    # Lista PDFs
    pdfs = _listar_pdfs_gcs(args.prefixo_raw, GCS_RAW_BUCKET)
    logger.info("Total PDFs encontrados: %d", len(pdfs))

    if args.dry_run:
        for p in pdfs:
            print(p)
        return

    # Verifica orçamento antes de iniciar
    assert_within_budget(threshold_usd=50.0)

    # Processa em paralelo
    resultados = []
    paginas_processadas_total = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futuros = {}
        for pdf_uri in pdfs:
            # Deriva ID da edição a partir do path GCS
            partes = pdf_uri.replace(f"gs://{GCS_RAW_BUCKET}/", "").split("/")
            edicao_id = "_".join(partes[-3:]).replace(".pdf", "").replace(" ", "_")

            # Deriva prefixo de saída
            data_parts = partes[1:4] if len(partes) >= 4 else partes[1:]
            gcs_output = f"gs://{GCS_CLEAN_BUCKET}/{args.prefixo_clean}{'/'.join(data_parts[:-1])}"

            futuro = executor.submit(processar_pdf, pdf_uri, gcs_output, edicao_id)
            futuros[futuro] = pdf_uri

        for futuro in as_completed(futuros):
            pdf_uri = futuros[futuro]
            try:
                metricas = futuro.result()
                resultados.append(metricas)
                paginas_processadas_total += metricas.get("pages_done", 0)

                # Hard-stop a cada BILLING_CHECK_EVERY páginas
                if paginas_processadas_total % BILLING_CHECK_EVERY < MAX_WORKERS:
                    logger.info(
                        "Checkpoint: %d páginas processadas. Verificando orçamento...",
                        paginas_processadas_total
                    )
                    assert_within_budget(threshold_usd=50.0)

            except RuntimeError as exc:
                logger.critical("HARD-STOP: %s", exc)
                executor.shutdown(wait=False)
                break
            except Exception as exc:
                logger.error("Erro ao processar %s: %s", pdf_uri, exc)

    # Resumo final
    total_quarentena = sum(r.get("pages_quarantine", 0) for r in resultados)
    logger.info("━━━━ Pipeline OCR concluído ━━━━")
    logger.info("PDFs processados    : %d", len(resultados))
    logger.info("Páginas totais      : %d", paginas_processadas_total)
    logger.info("Páginas quarentena  : %d", total_quarentena)
    logger.info("GPU (última leitura): %s%%", _gpu_utilization() or "N/A")


if __name__ == "__main__":
    main()
