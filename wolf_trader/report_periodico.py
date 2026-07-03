"""Report periódico (6/6h) ao Comandante via Telegram.

Combina, num panorama honesto e informativo:

  1. PANORAMA POLÍTICO da banca (direção, convicção, destaques de manchetes) —
     o mesmo vetor P que alimenta a decisão, agora explicado em texto.
  2. RESUMO DE DESEMPENHO do robô desde o último report: ciclos rodados, reações
     (compra/venda/hold/sem-dado), ordens processadas, gates abertos, gasto no
     dia e estado dos freios.

Sem promessa de retorno. Sem número inventado. Se um dado não existe, o report
diz que não existe (R2/R9 do projeto). Tom formal, "Comandante Baesso".
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from wolf_trader.banca_politica import VetorPolitico


@dataclass
class EstatisticasDesempenho:
    """Acumulador leve de métricas operacionais entre reports.

    O runner incrementa estes contadores a cada ciclo. `snapshot_e_zerar` é
    chamado quando o report é enviado, devolvendo uma cópia e reiniciando a
    janela — assim cada report cobre exatamente o período desde o anterior.
    """
    janela_inicio: float = field(default_factory=time.time)
    ciclos: int = 0
    tokens_avaliados: int = 0
    reacoes_comprar: int = 0
    reacoes_vender: int = 0
    reacoes_hold: int = 0
    reacoes_sem_dado: int = 0
    ordens_processadas: int = 0
    gates_abertos: int = 0
    erros_ciclo: int = 0

    def registrar_ciclo(
        self, *, avaliados: int, comprar: int, vender: int, hold: int,
        sem_dado: int, ordens: int, gates: int = 0,
    ) -> None:
        self.ciclos += 1
        self.tokens_avaliados += avaliados
        self.reacoes_comprar += comprar
        self.reacoes_vender += vender
        self.reacoes_hold += hold
        self.reacoes_sem_dado += sem_dado
        self.ordens_processadas += ordens
        self.gates_abertos += gates

    def registrar_erro(self) -> None:
        self.erros_ciclo += 1

    def snapshot_e_zerar(self) -> "EstatisticasDesempenho":
        copia = EstatisticasDesempenho(
            janela_inicio=self.janela_inicio,
            ciclos=self.ciclos,
            tokens_avaliados=self.tokens_avaliados,
            reacoes_comprar=self.reacoes_comprar,
            reacoes_vender=self.reacoes_vender,
            reacoes_hold=self.reacoes_hold,
            reacoes_sem_dado=self.reacoes_sem_dado,
            ordens_processadas=self.ordens_processadas,
            gates_abertos=self.gates_abertos,
            erros_ciclo=self.erros_ciclo,
        )
        # Zera a janela para o próximo período.
        agora = time.time()
        self.janela_inicio = agora
        self.ciclos = 0
        self.tokens_avaliados = 0
        self.reacoes_comprar = 0
        self.reacoes_vender = 0
        self.reacoes_hold = 0
        self.reacoes_sem_dado = 0
        self.ordens_processadas = 0
        self.gates_abertos = 0
        self.erros_ciclo = 0
        return copia


def _fmt_duracao(segundos: float) -> str:
    h = int(segundos // 3600)
    m = int((segundos % 3600) // 60)
    if h and m:
        return f"{h}h{m:02d}min"
    if h:
        return f"{h}h"
    return f"{m}min"


def montar_report(
    stats: EstatisticasDesempenho,
    vetor: Optional[VetorPolitico],
    *,
    modo_dry_run: bool,
    gate_usdc: float,
    max_ordem_usdc: float,
    gasto_dia_usdc: float = 0.0,
    agora: Optional[float] = None,
) -> str:
    """Monta o texto HTML do report de 6h. Determinístico e testável."""
    agora = agora if agora is not None else time.time()
    dur = _fmt_duracao(max(0.0, agora - stats.janela_inicio))

    # --- Bloco banca política ---
    if vetor is None or vetor.n_manchetes <= 0:
        bloco_banca = (
            "🏛️ <b>Panorama político da banca</b>\n"
            "Sem panorama disponível neste período (coleta de fontes públicas "
            "não retornou manchetes suficientes). O robô operou apenas com os "
            "sinais técnicos do book."
        )
    else:
        idade_h = vetor.idade_s(agora) / 3600.0
        if vetor.direcao > 0.15:
            clima = "favorável (risk-on)"
        elif vetor.direcao < -0.15:
            clima = "de cautela (risk-off)"
        else:
            clima = "neutro"
        bloco_banca = (
            "🏛️ <b>Panorama político da banca</b>\n"
            f"Clima {clima} — direção <b>{vetor.direcao:+.2f}</b>, "
            f"convicção <b>{vetor.conviccao:.0%}</b> "
            f"(base: {vetor.n_manchetes} manchetes, atualizado há {idade_h:.1f}h).\n"
            f"{vetor.resumo}"
        )

    # --- Bloco desempenho ---
    modo = "DRY_RUN (simulação)" if modo_dry_run else "OPERAÇÃO REAL"
    bloco_desempenho = (
        "📊 <b>Desempenho do robô</b> (últimas " + dur + ")\n"
        f"Modo: <b>{modo}</b>\n"
        f"Ciclos: {stats.ciclos} | Tokens avaliados: {stats.tokens_avaliados}\n"
        f"Reações → Comprar: {stats.reacoes_comprar} | "
        f"Vender: {stats.reacoes_vender} | Hold: {stats.reacoes_hold} | "
        f"Sem dado: {stats.reacoes_sem_dado}\n"
        f"Ordens processadas: {stats.ordens_processadas} | "
        f"Gates abertos: {stats.gates_abertos} | Erros de ciclo: {stats.erros_ciclo}\n"
        f"Gasto no dia: US$ {gasto_dia_usdc:.2f} | "
        f"Gate: US$ {gate_usdc:.0f} | Máx/ordem: US$ {max_ordem_usdc:.0f}"
    )

    rodape = (
        "ℹ️ Freios intactos: ordens acima do gate pedem sua autorização; "
        "nenhuma promessa de retorno. O senhor pode enviar sua leitura política "
        "a qualquer momento — ela entra como sinal da banca."
    )

    return (
        "🐺 <b>WOLF — Report periódico</b>\n\n"
        f"{bloco_banca}\n\n"
        f"{bloco_desempenho}\n\n"
        f"{rodape}"
    )
