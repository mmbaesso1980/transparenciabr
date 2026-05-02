import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";

import { partyHaloColor, getPartyPrimary } from "../../utils/partyColors.js";
import StarField from "./StarField.jsx";

/* ------------------------------------------------------------------ */
/* Geometria utilitária                                                */
/* ------------------------------------------------------------------ */

function fibonacciPoint(i, n, radius) {
  if (n < 1) return new THREE.Vector3(0, 0, radius);
  const idx = i + 0.5;
  const phi = Math.acos(1 - (2 * idx) / Math.max(n, 1));
  const theta = Math.PI * (1 + Math.sqrt(5)) * idx;
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    radius * sinPhi * Math.cos(theta),
    radius * sinPhi * Math.sin(theta),
    radius * Math.cos(phi),
  );
}

function tierScale(node) {
  switch (node?.tier) {
    case "grande":
      return 2.05;
    case "medio":
      return 1;
    case "pequeno":
      return 0.58;
    default:
      return 0.85;
  }
}

function buildGraphIndices(nodes, links) {
  const polToParty = new Map();
  const polToSuppliers = new Map();

  for (const L of links) {
    const sid = String(typeof L.source === "object" ? L.source?.id : L.source);
    const tid = String(typeof L.target === "object" ? L.target?.id : L.target);
    if (sid.startsWith("party_") && tid.startsWith("pol_")) {
      polToParty.set(tid, sid);
    }
    if (sid.startsWith("pol_") && !tid.startsWith("pol_")) {
      const tNode = nodes.find((n) => n.id === tid);
      if (tNode?.tipo === "fornecedor") {
        if (!polToSuppliers.has(sid)) polToSuppliers.set(sid, []);
        polToSuppliers.get(sid).push(tid);
      }
    }
  }

  return { polToParty, polToSuppliers };
}

/* PRNG determinístico — string -> [0,1) */
function hash01(str) {
  let h = 0x811c9dc5;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/* Gaussiana box-muller a partir de duas amostras [0,1). */
function gauss(u1, u2) {
  const a = Math.sqrt(-2 * Math.log(Math.max(1e-9, u1)));
  return a * Math.cos(2 * Math.PI * u2);
}

/**
 * LAYOUT GALÁCTICO POR PARTIDO
 *
 * Cada partido vira uma "galáxia": um anchor 3D distribuído por Fibonacci numa
 * casca esférica. Parlamentares são pontos gaussianos em torno do anchor (cluster
 * cósmico). Fornecedores ficam em pequena órbita ao redor do político.
 *
 * Não há mais anel rígido — a sensação é de aglomerados galácticos no espaço.
 */
export function layoutGalaxyPositions(nodes, links) {
  const posById = new Map();
  const { polToParty, polToSuppliers } = buildGraphIndices(nodes, links);

  const parties = nodes.filter((n) => n.tipo === "partido");
  const nP = parties.length;

  // Anchors dos partidos — esfera de raio 38, Fibonacci para boa distribuição.
  const partyAnchors = new Map();
  for (let i = 0; i < nP; i++) {
    const node = parties[i];
    const base = fibonacciPoint(i, Math.max(nP, 1), 38);
    // Pequeno jitter determinístico para evitar simetria perfeita.
    const jx = (hash01(`${node.id}:x`) - 0.5) * 4;
    const jy = (hash01(`${node.id}:y`) - 0.5) * 4;
    const jz = (hash01(`${node.id}:z`) - 0.5) * 4;
    const anchor = base.clone().add(new THREE.Vector3(jx, jy, jz));
    partyAnchors.set(node.id, anchor);
    posById.set(node.id, anchor.clone());
  }

  // Agrupa políticos por partido.
  const polNodes = nodes.filter((n) => n.tipo === "politico");
  const polByParty = new Map();
  for (const pol of polNodes) {
    const partyId = polToParty.get(pol.id);
    if (!partyId) continue;
    if (!polByParty.has(partyId)) polByParty.set(partyId, []);
    polByParty.get(partyId).push(pol);
  }

  // Para cada cluster, distribui parlamentares com gaussiana 3D.
  for (const [partyId, plist] of polByParty) {
    const anchor = partyAnchors.get(partyId);
    if (!anchor) continue;
    // Sigma cresce levemente com o tamanho do partido (cluster maior).
    const sigma = 4.5 + Math.min(plist.length, 90) * 0.06;

    plist.forEach((pol, j) => {
      const seed = String(pol.id);
      // 6 amostras independentes -> 3 gaussianas
      const gx = gauss(hash01(`${seed}:gx1`), hash01(`${seed}:gx2`));
      const gy = gauss(hash01(`${seed}:gy1`), hash01(`${seed}:gy2`));
      const gz = gauss(hash01(`${seed}:gz1`), hash01(`${seed}:gz2`));

      // Clamp para evitar outliers exagerados (galáxias visíveis, não diáspora).
      const clamp = (x) => Math.max(-2.6, Math.min(2.6, x));
      const offset = new THREE.Vector3(
        clamp(gx) * sigma,
        clamp(gy) * sigma,
        clamp(gz) * sigma,
      );

      // Pequena dependência do índice para "achatar" o cluster levemente,
      // dando aspecto de galáxia espiral em vez de esfera perfeita.
      const flatten = 0.62 + (j % 7) * 0.04;
      offset.y *= flatten;

      const polPos = anchor.clone().add(offset);
      posById.set(pol.id, polPos);

      // Fornecedores do político — mini-órbita.
      const supIds = polToSuppliers.get(pol.id) || [];
      const m = supIds.length;
      if (m > 0) {
        const dirOut = polPos.clone().sub(anchor);
        if (dirOut.lengthSq() < 1e-6) dirOut.set(1, 0, 0);
        dirOut.normalize();
        const tmp = Math.abs(dirOut.y) > 0.9
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 1, 0);
        const u = new THREE.Vector3().crossVectors(tmp, dirOut).normalize();
        const v = new THREE.Vector3().crossVectors(dirOut, u).normalize();
        for (let k = 0; k < m; k++) {
          const ang = (k / m) * Math.PI * 2;
          const rS = 1.6;
          const sPos = polPos
            .clone()
            .add(u.clone().multiplyScalar(Math.cos(ang) * rS))
            .add(v.clone().multiplyScalar(Math.sin(ang) * rS));
          posById.set(supIds[k], sPos);
        }
      }
    });
  }

  // Políticos órfãos (sem partido conhecido) — campo dispersou em casca interna.
  const orphanPols = polNodes.filter((p) => !polToParty.has(p.id));
  orphanPols.forEach((pol, idx) => {
    const p = fibonacciPoint(idx, Math.max(orphanPols.length, 1), 18);
    const j = new THREE.Vector3(
      (hash01(`${pol.id}:ox`) - 0.5) * 4,
      (hash01(`${pol.id}:oy`) - 0.5) * 4,
      (hash01(`${pol.id}:oz`) - 0.5) * 4,
    );
    const polPos = p.add(j);
    posById.set(pol.id, polPos);

    const supIds = polToSuppliers.get(pol.id) || [];
    if (supIds.length) {
      const dirOut = polPos.clone().normalize();
      const tmp = Math.abs(dirOut.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(tmp, dirOut).normalize();
      const v = new THREE.Vector3().crossVectors(dirOut, u).normalize();
      supIds.forEach((sid, k) => {
        const ang = (k / supIds.length) * Math.PI * 2;
        posById.set(
          sid,
          polPos
            .clone()
            .add(u.clone().multiplyScalar(Math.cos(ang) * 1.4))
            .add(v.clone().multiplyScalar(Math.sin(ang) * 1.4)),
        );
      });
    }
  });

  // Garantia: todo node tem posição.
  for (const node of nodes) {
    if (!posById.has(node.id)) {
      posById.set(node.id, fibonacciPoint(0, 1, 14));
    }
  }

  return posById;
}

/** @deprecated mantido por compat. */
export function layoutOrbPositions(nodes) {
  const posById = new Map();
  nodes.forEach((n, i) => {
    posById.set(n.id, fibonacciPoint(i, nodes.length, 16));
  });
  return posById;
}

/* ------------------------------------------------------------------ */
/* Cores das orbes — replicam EXATAMENTE o padrão PoliticianOrb 2D     */
/* (radial gradient inner -> accent -> outer + highlight branco).       */
/* ------------------------------------------------------------------ */

function partidoStops(node) {
  // Partidos são "estrelas guia" — usam o mesmo gerador determinístico
  // (seedado pela sigla) para terem orbe cósmica única, não um disco chapado.
  return getPoliticianOrbStops(`party:${node.id || node.label || "x"}`, 30);
}

function fornecedorStops(node) {
  // Fornecedor: mesma estrutura de orbe radial, com hue puxado pelo risco.
  // Reaproveita getPoliticianOrbStops com identidade que combina id + tier de risco
  // para distribuir hues; o "score" passado modula saturação como sempre.
  const score = Number.isFinite(node.riskScore) ? node.riskScore : 80;
  return getPoliticianOrbStops(`forn:${node.id}`, score);
}

function politicoStops(node) {
  const ident = node.politicoId || node.id || "anon";
  const score = Number.isFinite(node.riskScore) ? node.riskScore : 35;
  return getPoliticianOrbStops(ident, score);
}

function stopsForNode(node) {
  if (node?.tipo === "partido") return partidoStops(node);
  if (node?.tipo === "fornecedor") return fornecedorStops(node);
  if (node?.tipo === "politico") return politicoStops(node);
  return getPoliticianOrbStops(node?.id || "x", 35);
}

/* ------------------------------------------------------------------ */
/* Halo / nebulosa difusa — sprite com gradiente radial branco         */
/* tingido pela cor desaturada do partido (additive blending).         */
/* ------------------------------------------------------------------ */

let _haloTex = null;
function getHaloTexture() {
  if (_haloTex) return _haloTex;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.35, "rgba(255,255,255,0.18)");
  g.addColorStop(0.7, "rgba(255,255,255,0.05)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _haloTex = new THREE.CanvasTexture(canvas);
  _haloTex.colorSpace = THREE.SRGBColorSpace;
  return _haloTex;
}

/* ------------------------------------------------------------------ */

function isHighRisk(node) {
  const s =
    typeof node.riskScore === "number" && Number.isFinite(node.riskScore)
      ? node.riskScore
      : 0;
  return s >= 75;
}

function partyIdForNode(node, links, polToPartyMemo) {
  if (node?.tipo === "partido") return String(node.id);
  if (node?.tipo === "politico") return polToPartyMemo.get(String(node.id)) || "";
  if (node?.tipo === "fornecedor") {
    const pid = String(node.id);
    for (const L of links) {
      const sid = String(typeof L.source === "object" ? L.source?.id : L.source);
      const tid = String(typeof L.target === "object" ? L.target?.id : L.target);
      if (tid === pid && sid.startsWith("pol_")) {
        return polToPartyMemo.get(sid) || "";
      }
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Filamento cósmico — link fino, opacidade baixa em rest               */
/* ------------------------------------------------------------------ */

function CosmicFilament({ from, to, focus, dim, hot }) {
  if (!from || !to) return null;
  // Cores: padrão é cinza-azulado escuro; partyColor SÓ quando hover ativo.
  let color = "#3a4a6e";
  if (focus?.color) color = focus.color;
  else if (hot) color = "#fca5a5";

  const opacity = focus
    ? 0.6
    : dim
    ? 0.04
    : hot
    ? 0.32
    : 0.18;

  return (
    <Line
      points={[from.toArray(), to.toArray()]}
      color={color}
      lineWidth={focus ? 1.6 : 1}
      transparent
      opacity={opacity}
      depthWrite={false}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Shader — replica PoliticianOrb 2D (gradiente + highlight + fresnel)   */
/* ------------------------------------------------------------------ */

const orbVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const orbFragmentShader = `
  uniform vec3 uInner;
  uniform vec3 uAccent;
  uniform vec3 uOuter;
  uniform float uTime;
  uniform float uBrightness;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 sph = vUv;
    vec2 innerLight = vec2(0.35, 0.65);
    float distInner = distance(sph, innerLight) / 0.75;
    float gradT = smoothstep(0.0, 1.0, distInner);

    vec3 col;
    if (gradT < 0.55) {
      col = mix(uInner, uAccent, smoothstep(0.0, 0.55, gradT));
    } else {
      col = mix(uAccent, uOuter, smoothstep(0.55, 1.0, gradT));
    }

    vec2 hlPos = vec2(0.32, 0.72);
    float distHl = distance(sph, hlPos) / 0.22;
    float hl = smoothstep(1.0, 0.0, distHl) * 0.55;
    col = mix(col, vec3(1.0), hl);

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
    fresnel = pow(fresnel, 2.5);
    col += fresnel * 0.18 * uAccent;

    float swirl = noise(sph * 4.0 + uTime * 0.05) * 0.04;
    col += vec3(swirl);

    col *= uBrightness;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* Orbe individual — shader + halo (mesma identidade que PoliticianOrb)   */
/* ------------------------------------------------------------------ */

function CosmicOrb({
  node,
  position,
  scale,
  haloColor,
  haloIntensity,
  brightness,
  pulse,
  onClick,
  onPointerOver,
  onPointerOut,
  onPointerMove,
}) {
  const stops = useMemo(() => stopsForNode(node), [node]);
  const halo = useMemo(() => getHaloTexture(), []);

  const meshRef = useRef(null);
  const matRef = useRef(null);
  const haloRef = useRef(null);

  const uniforms = useMemo(
    () => ({
      uInner: { value: new THREE.Color(stops.inner) },
      uAccent: { value: new THREE.Color(stops.accent) },
      uOuter: { value: new THREE.Color(stops.outer) },
      uTime: { value: 0 },
      uBrightness: { value: brightness },
    }),
    [stops.inner, stops.accent, stops.outer],
  );

  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uInner.value.set(stops.inner);
    matRef.current.uniforms.uAccent.value.set(stops.accent);
    matRef.current.uniforms.uOuter.value.set(stops.outer);
  }, [stops.inner, stops.accent, stops.outer]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const baseScale = scale;
    const hr = isHighRisk(node);
    const t = pulse.current;
    const s = hr ? baseScale * (1 + Math.sin(t * 3.2) * 0.06) : baseScale;
    meshRef.current.scale.setScalar(s);
    if (matRef.current) {
      const u = matRef.current.uniforms;
      u.uTime.value = clock.elapsedTime;
      const br =
        brightness * (hr ? 1 + Math.sin(t * 3.2) * 0.18 : 1);
      u.uBrightness.value = br;
    }
    if (haloRef.current?.material) {
      haloRef.current.material.opacity = haloIntensity;
    }
  });

  const orbRadius = 0.42;

  return (
    <group position={position}>
      <sprite ref={haloRef} scale={[orbRadius * scale * 7, orbRadius * scale * 7, 1]}>
        <spriteMaterial
          map={halo}
          color={haloColor}
          transparent
          opacity={haloIntensity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest
        />
      </sprite>

      <mesh
        ref={meshRef}
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e, node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver?.(e, node);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e, node);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onPointerOut?.(e, node);
        }}
      >
        <sphereGeometry args={[orbRadius, 64, 64]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={orbVertexShader}
          fragmentShader={orbFragmentShader}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Câmera — drift orbital + fly-through + reset (sem spring extra dep) */
/* ------------------------------------------------------------------ */

function cubicBezierEase(x1, y1, x2, y2, x) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const xEst = sx(t) - x;
    const dx = 3 * ax * t * t + 2 * bx * t + cx;
    if (Math.abs(dx) < 1e-6) break;
    t -= xEst / dx;
    t = Math.max(0, Math.min(1, t));
  }
  return sy(Math.max(0, Math.min(1, t)));
}

function ImmersiveCamera({
  controlsRef,
  cameraAnimRef,
  focusTarget,
}) {
  const { camera } = useThree();
  const tmpFrom = useMemo(() => new THREE.Vector3(), []);
  const tmpTo = useMemo(() => new THREE.Vector3(), []);
  const tmpLookFrom = useMemo(() => new THREE.Vector3(), []);
  const tmpLookTo = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    const anim = cameraAnimRef.current;

    if (!anim.active) return;

    const now = performance.now();
    const elapsed = now - anim.t0;
    const rawT = Math.min(1, elapsed / anim.duration);
    const u = cubicBezierEase(0.22, 1, 0.36, 1, rawT);
    tmpFrom.copy(anim.startCam);
    tmpTo.copy(anim.endCam);
    tmpLookFrom.copy(anim.startLook);
    tmpLookTo.copy(anim.endLook);
    camera.position.lerpVectors(tmpFrom, tmpTo, u);
    controls.target.lerpVectors(tmpLookFrom, tmpLookTo, u);
    controls.update();
    if (rawT >= 1) {
      anim.active = false;
      camera.position.copy(anim.endCam);
      controls.target.copy(anim.endLook);
      controls.update();
      const cb = anim.onComplete;
      anim.onComplete = null;
      cb?.();
    }
  });

  return null;
}

function SceneContent({
  graphData,
  onNodeClick,
  flyApiRef,
  onOrbHover,
}) {
  const groupRef = useRef(null);
  const controlsRef = useRef(null);
  const nodes = graphData?.nodes ?? [];
  const links = graphData?.links ?? [];
  const [hoveredPartyId, setHoveredPartyId] = useState(null);
  const pulseT = useRef(0);

  const [camBusy, setCamBusy] = useState(false);
  const [driftPaused, setDriftPaused] = useState(false);

  const DRIFT_RADIUS = 28;

  const cameraAnimRef = useRef({
    active: false,
    t0: 0,
    duration: 1200,
    startCam: new THREE.Vector3(),
    endCam: new THREE.Vector3(),
    startLook: new THREE.Vector3(),
    endLook: new THREE.Vector3(),
    onComplete: null,
  });

  const polToParty = useMemo(() => {
    const m = new Map();
    for (const L of links) {
      const sid = String(typeof L.source === "object" ? L.source?.id : L.source);
      const tid = String(typeof L.target === "object" ? L.target?.id : L.target);
      if (sid.startsWith("party_") && tid.startsWith("pol_")) m.set(tid, sid);
    }
    return m;
  }, [links]);

  const posById = useMemo(
    () => layoutGalaxyPositions(nodes, links),
    [nodes, links],
  );

  // Map party_id -> sigla para halos (sigla é o label dos nodes "partido").
  const partySiglaById = useMemo(() => {
    const m = new Map();
    for (const n of nodes) {
      if (n.tipo === "partido") {
        m.set(String(n.id), String(n.label || ""));
      }
    }
    return m;
  }, [nodes]);

  // Cor do halo dessaturada por partido (cache).
  const haloColorByParty = useMemo(() => {
    const m = new Map();
    for (const [pid, sigla] of partySiglaById) {
      m.set(pid, partyHaloColor(sigla));
    }
    return m;
  }, [partySiglaById]);

  const linkSegments = useMemo(() => {
    const out = [];
    for (const L of links) {
      const sid = typeof L.source === "object" ? L.source?.id : L.source;
      const tid = typeof L.target === "object" ? L.target?.id : L.target;
      const a = posById.get(String(sid));
      const b = posById.get(String(tid));
      if (!a || !b) continue;
      const risk = typeof L.risk === "number" ? L.risk : 40;
      const sNode = nodes.find((n) => n.id === sid) || { id: sid };
      const tNode = nodes.find((n) => n.id === tid) || { id: tid };
      const sParty = partyIdForNode(sNode, links, polToParty);
      const tParty = partyIdForNode(tNode, links, polToParty);
      const linkParty = sParty || tParty;
      const inFocusParty =
        hoveredPartyId &&
        (sParty === hoveredPartyId || tParty === hoveredPartyId);
      const dim = hoveredPartyId && !inFocusParty;
      out.push({
        from: a,
        to: b,
        hot: risk >= 70,
        dim: Boolean(dim),
        focus: inFocusParty
          ? { color: haloColorByParty.get(linkParty) || "#9aa6c2" }
          : null,
      });
    }
    return out;
  }, [links, nodes, posById, hoveredPartyId, polToParty, haloColorByParty]);

  const beginCameraAnim = useCallback((endCam, endLook, durationMs, onComplete) => {
    if (!controlsRef.current?.object) return;
    const ctrls = controlsRef.current;
    const camObj = ctrls.object;
    const anim = cameraAnimRef.current;
    anim.startCam.copy(camObj.position);
    anim.startLook.copy(ctrls.target);
    anim.endCam.copy(endCam);
    anim.endLook.copy(endLook);
    anim.duration = durationMs;
    anim.t0 = performance.now();
    anim.active = true;
    setCamBusy(true);
    anim.onComplete = () => {
      setCamBusy(false);
      onComplete?.();
    };
  }, []);

  const beginFlyToWorld = useCallback(
    (worldPos, onArrive) => {
      const target = worldPos.clone();
      const dir = target.clone();
      if (dir.lengthSq() < 1e-8) {
        dir.set(0, 0.25, 1);
      }
      dir.normalize();
      const endCam = target.clone().add(dir.multiplyScalar(4));
      beginCameraAnim(endCam, target, 1200, onArrive);
    },
    [beginCameraAnim],
  );

  const resetCameraToDrift = useCallback(() => {
    if (!controlsRef.current?.object) return;
    const ctrls = controlsRef.current;
    const camObj = ctrls.object;
    const camDir = camObj.position.clone().normalize();
    const homeCam = camDir.multiplyScalar(DRIFT_RADIUS);
    homeCam.y += Math.sin(performance.now() * 0.0004) * 0.6;
    const homeLook = new THREE.Vector3(0, 0, 0);
    beginCameraAnim(homeCam, homeLook, 1500, () => {});
  }, [beginCameraAnim]);

  const clearFocus = useCallback(() => {
    resetCameraToDrift();
  }, [resetCameraToDrift]);

  useEffect(() => {
    const api = flyApiRef.current;
    api.clearFocus = clearFocus;
    return () => {
      delete api.clearFocus;
    };
  }, [flyApiRef, clearFocus]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "Escape") clearFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearFocus]);

  useEffect(() => {
    const api = flyApiRef.current;
    api.flyToNodeId = (nodeId) => {
      const id = String(nodeId || "").trim();
      if (!id) return Promise.resolve();
      const node =
        nodes.find((n) => n.id === id) ||
        nodes.find((n) => n.politicoId === id) ||
        nodes.find((n) => String(n.id).endsWith(id));
      if (!node) return Promise.resolve();
      const p = posById.get(node.id);
      if (!p) return Promise.resolve();
      return new Promise((resolve) => {
        beginFlyToWorld(p, resolve);
      });
    };
    return () => {
      delete api.flyToNodeId;
    };
  }, [beginFlyToWorld, flyApiRef, nodes, posById]);

  useFrame((_, delta) => {
    pulseT.current += delta;
  });

  const handleOrbClick = useCallback(
    (e, node) => {
      e.stopPropagation();
      if (!node) return;
      const p = posById.get(node.id);
      if (!p) return;
      beginFlyToWorld(p, () => {
        if (node.tipo === "partido") return;
        if (typeof onNodeClick === "function") onNodeClick(node);
      });
    },
    [beginFlyToWorld, onNodeClick, posById],
  );

  const onOver = useCallback(
    (e, node) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
      if (node?.tipo === "partido") setHoveredPartyId(String(node.id));
      onOrbHover?.(node, { x: e.clientX, y: e.clientY });
    },
    [onOrbHover],
  );

  const onMove = useCallback(
    (e, node) => {
      e.stopPropagation();
      onOrbHover?.(node, { x: e.clientX, y: e.clientY });
    },
    [onOrbHover],
  );

  const onOut = useCallback(
    (e, node) => {
      e.stopPropagation();
      document.body.style.cursor = "auto";
      if (node?.tipo === "partido") setHoveredPartyId(null);
      onOrbHover?.(null, null);
    },
    [onOrbHover],
  );

  const controlsInteractive = !camBusy;

  return (
    <>
      <group ref={groupRef}>
        {/* Iluminação cósmica — suave, ambiente difuso azul-quente. */}
        <ambientLight intensity={0.32} />
        <hemisphereLight args={["#1d2a4a", "#0a0612", 0.45]} />
        <pointLight position={[40, 30, 50]} intensity={90} color="#9bb6ff" distance={180} />
        <pointLight position={[-40, -25, 40]} intensity={60} color="#ffd6a8" distance={160} />

        {/* Filamentos cósmicos (links) — abaixo das orbes para perspectiva limpa. */}
        {linkSegments.map((seg, i) => (
          <CosmicFilament
            key={`fil-${i}`}
            from={seg.from}
            to={seg.to}
            focus={seg.focus}
            dim={seg.dim}
            hot={seg.hot}
          />
        ))}

        {/* Orbes individuais — cada uma com material radial-gradient idêntico ao
            PoliticianOrb 2D + halo nebuloso do partido. */}
        {nodes.map((node) => {
          const p = posById.get(node.id);
          if (!p) return null;
          const partyId = partyIdForNode(node, links, polToParty);
          const isParty = node.tipo === "partido";
          const focusActive = Boolean(hoveredPartyId);
          const inFocus = focusActive && partyId === hoveredPartyId;
          const dim = focusActive && !inFocus;

          // Halo color: partido em foco → cor saturada (highlight); senão dessaturada.
          let haloColor;
          if (inFocus) {
            haloColor = getPartyPrimary(partySiglaById.get(partyId) || "");
          } else {
            haloColor = haloColorByParty.get(partyId) || "#3a4a6e";
          }

          // Intensidade do halo: rest baixo, focus alto, dim quase zero.
          let haloIntensity = 0.12;
          if (inFocus) haloIntensity = 0.55;
          else if (dim) haloIntensity = 0.03;
          if (isParty) haloIntensity *= 1.45; // partido tem nebulosa mais densa

          // Brilho da esfera (emissive): ofusca quando dim para empurrar
          // estrelas para o fundo, sem mudar a cor base.
          let brightness = 0.85;
          if (dim) brightness = 0.18;
          if (inFocus) brightness = 1.05;

          const sc = tierScale(node);

          return (
            <CosmicOrb
              key={node.id}
              node={node}
              position={p}
              scale={sc}
              haloColor={haloColor}
              haloIntensity={haloIntensity}
              brightness={brightness}
              pulse={pulseT}
              onClick={handleOrbClick}
              onPointerOver={onOver}
              onPointerMove={onMove}
              onPointerOut={onOut}
            />
          );
        })}

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={8}
          maxDistance={60}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.85}
          zoomSpeed={0.9}
          enabled={controlsInteractive}
          autoRotate={!driftPaused && controlsInteractive}
          autoRotateSpeed={0.35}
          onStart={() => setDriftPaused(true)}
          onEnd={() => {
            window.setTimeout(() => setDriftPaused(false), 800);
          }}
        />
      </group>
      <ImmersiveCamera
        controlsRef={controlsRef}
        cameraAnimRef={cameraAnimRef}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

const OrbMeshScene = forwardRef(function OrbMeshScene(
  { graphData, onNodeClick, onOrbHover, empty = false, className = "" },
  ref,
) {
  const flyApiRef = useRef({});

  useImperativeHandle(
    ref,
    () => ({
      flyToPoliticianId(politicianDocumentId) {
        const id = String(politicianDocumentId ?? "").trim();
        if (!id || !flyApiRef.current.flyToNodeId) return Promise.resolve();
        const nodes = graphData?.nodes ?? [];
        const polGraphId = nodes.some((n) => n.id === id)
          ? id
          : `pol_${id}`;
        return flyApiRef.current.flyToNodeId(polGraphId);
      },
      clearCameraFocus() {
        flyApiRef.current.clearFocus?.();
      },
    }),
    [graphData],
  );

  if (empty || !graphData?.nodes?.length) {
    return (
      <div
        className={`absolute inset-0 bg-[#02040a] ${className}`}
        aria-hidden
      />
    );
  }

  return (
    <div className={`absolute inset-0 touch-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 28], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        onPointerMissed={() => flyApiRef.current.clearFocus?.()}
      >
        <color attach="background" args={["#02040a"]} />
        {/* Fog cósmico — orbes distantes desbotam suavemente. */}
        <fog attach="fog" args={["#02040a", 55, 200]} />
        {/* Estrelas de fundo (3000 pontos) — sensação de profundidade. */}
        <StarField count={3000} radius={150} />
        <SceneContent
          graphData={graphData}
          onNodeClick={onNodeClick}
          flyApiRef={flyApiRef}
          onOrbHover={onOrbHover}
        />
        <EffectComposer>
          <Bloom
            intensity={0.45}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.4}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
});

export default OrbMeshScene;
