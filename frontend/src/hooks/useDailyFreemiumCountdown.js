import { useEffect, useState } from "react";

import { DAILY_FREEMIUM_CREDITS } from "../lib/firebase.js";

/** Brasília oficial (UTC−3, sem horário de verão). */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;

function msUntilMidnightBrasilia() {
  const shifted = Date.now() + BRT_OFFSET_MS;
  const dayIndex = Math.floor(shifted / MS_DAY);
  const nextBoundary = (dayIndex + 1) * MS_DAY;
  return Math.max(0, nextBoundary - shifted);
}

/**
 * Contagem regressiva até 00:00 em Brasília (para copy de reset de créditos diários).
 */
export function useDailyFreemiumCountdown(enabled = true) {
  const [msLeft, setMsLeft] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setMsLeft(null);
      return undefined;
    }
    const tick = () => setMsLeft(msUntilMidnightBrasilia());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [enabled]);

  if (msLeft == null) {
    return {
      msLeft: null,
      hoursApprox: null,
      labelShort: "",
      dailyCap: DAILY_FREEMIUM_CREDITS,
    };
  }
  const totalMinutes = Math.ceil(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hoursApprox = hours + (minutes >= 30 ? 1 : 0);
  const labelShort =
    hours > 0
      ? `${hours}h${minutes > 0 ? ` ${minutes}min` : ""}`
      : `${Math.max(1, minutes)} min`;

  return {
    msLeft,
    hoursApprox,
    labelShort,
    dailyCap: DAILY_FREEMIUM_CREDITS,
  };
}
