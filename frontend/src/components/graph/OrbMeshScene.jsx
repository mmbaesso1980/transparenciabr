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
import * as THREE from "three";

import { getRiskColor } from "../../utils/colorUtils.js";
import { getPoliticianOrbStops } from "../../utils/politicianColor.js";
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
/* Cache global de texturas radial-gradient (mesmo padrão da SVG 2D)   */
/* ------------------------------------------------------------------ */

const ORB_TEX_CACHE = new Map();

function makeOrbTexture({ inner, accent, outer }) {
  const key = `${inner}|${accent}|${outer}`;
  const cached = ORB_TEX_CACHE.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fundo do "espaço" da textura (transparente para a esfera assumir o look completo).
  ctx.clearRect(0, 0, size, size);

  // Gradient base — espelha PoliticianOrb.jsx (cx=35%, cy=35%, r=75%).
  const cx = size * 0.35;
  const cy = size * 0.35;
  const r = size * 0.75;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.0, hexA(inner, 0.98));
  grad.addColorStop(0.55, hexA(accent, 0.92));
  grad.addColorStop(1.0, hexA(outer, 1.0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Highlight branco (cx=32%, cy=28%, r=22%) — também idêntico ao SVG 2D.
  const hx = size * 0.32;
  const hy = size * 0.28;
  const hr = size * 0.22;
  const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  hl.addColorStop(0.0, "rgba(255,255,255,0.55)");
  hl.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  ORB_TEX_CACHE.set(key, tex);
  return tex;
}

function hexA(hex, a) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(255,255,255,${a})`;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return `rgba(${r},${g},${b},${a})`;
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
/* Orbe individual — replica visual do PoliticianOrb em 3D + halo      */
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
}) {
  const stops = useMemo(() => stopsForNode(node), [node]);
  const tex = useMemo(() => makeOrbTexture(stops), [stops]);
  const halo = useMemo(() => getHaloTexture(), []);

  const meshRef = useRef(null);
  const matRef = useRef(null);
  const haloRef = useRef(null);

  // Pulso suave em alto risco — modula scale + emissive.
  useFrame((_, dt) => {
    if (!meshRef.current) return;
    const baseScale = scale;
    const hr = isHighRisk(node);
    const t = pulse.current;
    const s = hr ? baseScale * (1 + Math.sin(t * 3.2) * 0.06) : baseScale;
    meshRef.current.scale.setScalar(s);
    if (matRef.current) {
      const e = brightness * (hr ? 1 + Math.sin(t * 3.2) * 0.18 : 1);
      matRef.current.emissiveIntensity = e;
    }
    if (haloRef.current?.material) {
      haloRef.current.material.opacity = haloIntensity;
    }
  });

  // Tamanho real da esfera (raio base 0.42 igual ao código antigo).
  const orbRadius = 0.42;

  return (
    <group position={position}>
      {/* Halo / nebulosa do partido — sprite grande, additive, dessaturado. */}
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

      {/* Esfera cósmica — radial gradient ESTILO PoliticianOrb 2D. */}
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
        onPointerOut={(e) => {
          e.stopPropagation();
          onPointerOut?.(e, node);
        }}
      >
        <sphereGeometry args={[orbRadius, 28, 28]} />
        <meshStandardMaterial
          ref={matRef}
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={brightness}
          roughness={0.42}
          metalness={0.18}
          toneMapped
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

function CameraRig({ controlsRef, flyStateRef }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    const st = flyStateRef.current;
    if (!st.active || !controlsRef.current) return;
    const damping = 1 - Math.exp(-4.2 * delta);
    camera.position.lerp(st.camPos, damping);
    controlsRef.current.target.lerp(st.lookAt, damping);
    controlsRef.current.update();
    const done =
      camera.position.distanceTo(st.camPos) < 0.15 &&
      controlsRef.current.target.distanceTo(st.lookAt) < 0.12;
    if (done || performance.now() - st.startedAt > 4500) {
      st.active = false;
      st.onComplete?.();
      st.onComplete = null;
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */

function SceneContent({ graphData, onNodeClick, flyApiRef }) {
  const groupRef = useRef(null);
  const controlsRef = useRef(null);
  const nodes = graphData?.nodes ?? [];
  const links = graphData?.links ?? [];
  const [hoveredPartyId, setHoveredPartyId] = useState(null);
  const pulseT = useRef(0);
  const flyStateRef = useRef({
    active: false,
    camPos: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
    startedAt: 0,
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

  const beginFlyToWorld = useCallback((worldPos, onComplete) => {
    const look = worldPos.clone();
    const camPos = look.clone().add(new THREE.Vector3(0, 1.2, 9.5));
    const st = flyStateRef.current;
    st.camPos.copy(camPos);
    st.lookAt.copy(look);
    st.startedAt = performance.now();
    st.active = true;
    st.onComplete = onComplete;
  }, []);

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
    if (groupRef.current) {
      // Rotação muito lenta — sensação de cosmos que respira, não carrossel.
      groupRef.current.rotation.y += delta * 0.012;
    }
  });

  const handleClick = useCallback(
    (e, node) => {
      e.stopPropagation();
      if (typeof onNodeClick === "function") onNodeClick(node);
    },
    [onNodeClick],
  );

  const onOver = useCallback((e, node) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
    if (node?.tipo === "partido") setHoveredPartyId(String(node.id));
  }, []);
  const onOut = useCallback((e, node) => {
    e.stopPropagation();
    document.body.style.cursor = "auto";
    if (node?.tipo === "partido") setHoveredPartyId(null);
  }, []);

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
              onClick={handleClick}
              onPointerOver={onOver}
              onPointerOut={onOut}
            />
          );
        })}

        <OrbitControls
          ref={controlsRef}
          enablePan
          screenSpacePanning
          minDistance={4}
          maxDistance={160}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.85}
          zoomSpeed={0.9}
          panSpeed={0.9}
        />
      </group>
      <CameraRig controlsRef={controlsRef} flyStateRef={flyStateRef} />
    </>
  );
}

/* ------------------------------------------------------------------ */

const OrbMeshScene = forwardRef(function OrbMeshScene(
  { graphData, onNodeClick, empty = false, className = "" },
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
        camera={{ position: [0, 6, 70], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
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
        />
      </Canvas>
    </div>
  );
});

export default OrbMeshScene;
