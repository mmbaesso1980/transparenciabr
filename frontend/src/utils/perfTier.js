/**
 * Detector de tier de hardware para o Universo 3D.
 *
 * Decisão sincrôna no boot baseada em:
 *   - navigator.hardwareConcurrency (núcleos)
 *   - navigator.deviceMemory (RAM em GB)
 *   - WEBGL_debug_renderer_info (modelo da GPU)
 *   - userAgent (mobile vs desktop)
 *
 * Tiers:
 *   "high" → desktop com GPU dedicada / Apple Silicon / 8GB+ RAM / 8+ cores
 *   "mid"  → laptop/desktop intermediário / 4-8 cores
 *   "low"  → mobile, GPU integrada antiga, ≤4 cores ou ≤4GB
 *
 * Uso:
 *   import { detectPerfTier, getCanvasOptionsForTier } from "../utils/perfTier";
 *   const tier = detectPerfTier();
 *   const opts = getCanvasOptionsForTier(tier);
 */

const STORAGE_KEY = "tbr_perf_tier_override";

/** Lê override manual do usuário (ex: alguém pediu "modo clássico" antes). */
export function getOverrideTier() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setOverrideTier(tier) {
  if (typeof window === "undefined") return;
  try {
    if (!tier) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    /* quota / privacy mode — ignora */
  }
}

function detectMobileUA() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  return /iphone|ipad|ipod|android|mobile|silk|kindle/.test(ua);
}

function getGPURenderer() {
  if (typeof document === "undefined") return "";
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "unknown";
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
  } catch {
    return "error";
  }
}

function classifyGPU(rendererStr) {
  const r = rendererStr.toLowerCase();
  if (!r || r === "no-webgl" || r === "error") return "low";
  // Apple Silicon — sempre top tier
  if (r.includes("apple") && (r.includes("m1") || r.includes("m2") || r.includes("m3") || r.includes("m4"))) {
    return "high";
  }
  // GPUs dedicadas modernas
  if (r.includes("rtx") || r.includes("radeon rx") || r.includes("arc a")) return "high";
  if (r.includes("gtx") && /(1060|1070|1080|16\d{2}|20\d{2}|30\d{2}|40\d{2})/.test(r)) return "high";
  // Integradas modernas
  if (r.includes("iris xe") || r.includes("iris plus")) return "mid";
  if (r.includes("uhd") && /(620|630|730|750|770)/.test(r)) return "mid";
  if (r.includes("radeon") && r.includes("vega")) return "mid";
  // Mali/Adreno mobile
  if (r.includes("mali") || r.includes("adreno") || r.includes("powervr")) return "low";
  // GPU antiga / desconhecida
  if (r.includes("hd graphics") && /(3000|4000|5000|520|530)/.test(r)) return "low";
  return "mid"; // fallback conservador
}

/**
 * Retorna "high" | "mid" | "low".
 */
export function detectPerfTier() {
  const override = getOverrideTier();
  if (override === "high" || override === "mid" || override === "low") {
    return override;
  }
  if (typeof navigator === "undefined") return "mid";

  const cores = Number(navigator.hardwareConcurrency || 4);
  const memory = Number(navigator.deviceMemory || 4);
  const isMobile = detectMobileUA();
  const gpuTier = classifyGPU(getGPURenderer());

  // Mobile sempre cai pra low ou mid (no max).
  if (isMobile) {
    if (gpuTier === "high" && cores >= 6 && memory >= 6) return "mid";
    return "low";
  }

  // Desktop / laptop
  if (gpuTier === "high" && cores >= 8 && memory >= 8) return "high";
  if (gpuTier === "low" || cores <= 4 || memory <= 4) return "low";
  return "mid";
}

/**
 * Configurações de Canvas/cena por tier.
 */
export function getCanvasOptionsForTier(tier) {
  switch (tier) {
    case "high":
      return {
        dpr: [1, 1.75],
        antialias: true,
        sphereSegments: 32,
        starCount: 3000,
        haloEnabled: true,
        targetFps: 60,
        fogFar: 200,
      };
    case "mid":
      return {
        dpr: [1, 1.25],
        antialias: true,
        sphereSegments: 16,
        starCount: 1500,
        haloEnabled: true,
        targetFps: 45,
        fogFar: 160,
      };
    case "low":
    default:
      return {
        dpr: [1, 1],
        antialias: false,
        sphereSegments: 12,
        starCount: 600,
        haloEnabled: false,
        targetFps: 30,
        fogFar: 120,
      };
  }
}

/**
 * Probe de FPS — roda durante N segundos e retorna FPS médio.
 * Útil para validar a decisão do tier após o primeiro render.
 */
export function probeFps(durationMs = 3000) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      resolve(60);
      return;
    }
    let frames = 0;
    const start = performance.now();
    function tick() {
      frames += 1;
      const elapsed = performance.now() - start;
      if (elapsed < durationMs) {
        window.requestAnimationFrame(tick);
      } else {
        resolve(Math.round((frames * 1000) / elapsed));
      }
    }
    window.requestAnimationFrame(tick);
  });
}
