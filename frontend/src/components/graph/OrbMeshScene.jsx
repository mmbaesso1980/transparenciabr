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
import { Instances, Instance, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { getRiskColor } from "../../utils/colorUtils.js";
import { getPoliticianColor } from "../../utils/politicianColor.js";

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

function perpBasis(dir) {
  const d = dir.clone();
  if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
  d.normalize();
  let tmp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(d.y) > 0.9) tmp.set(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(tmp, d).normalize();
  const v = new THREE.Vector3().crossVectors(d, u).normalize();
  return { u, v };
}

/**
 * Partido no anel exterior; políticos em torno do partido; fornecedores em torno do político.
 */
export function layoutGalaxyPositions(nodes, links) {
  const posById = new Map();
  const { polToParty, polToSuppliers } = buildGraphIndices(nodes, links);

  const parties = nodes.filter((n) => n.tipo === "partido");
  const nP = parties.length;
  for (let i = 0; i < nP; i++) {
    const node = parties[i];
    posById.set(node.id, fibonacciPoint(i, Math.max(nP, 1), 28));
  }

  const polNodes = nodes.filter((n) => n.tipo === "politico");
  const polByParty = new Map();
  for (const pol of polNodes) {
    const partyId = polToParty.get(pol.id);
    if (!partyId) continue;
    if (!polByParty.has(partyId)) polByParty.set(partyId, []);
    polByParty.get(partyId).push(pol);
  }

  for (const [, plist] of polByParty) {
    plist.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  const orphanPols = polNodes.filter((p) => !polToParty.has(p.id));
  let orphanIdx = 0;

  for (const party of parties) {
    const center = posById.get(party.id);
    if (!center) continue;
    const plist = polByParty.get(party.id) || [];
    const { u, v } = perpBasis(center);
    const n = plist.length;
    for (let j = 0; j < n; j++) {
      const pol = plist[j];
      const ang = (j / Math.max(n, 1)) * Math.PI * 2;
      const orbitR = 5.2;
      const polPos = center
        .clone()
        .multiplyScalar(0.72)
        .add(u.clone().multiplyScalar(Math.cos(ang) * orbitR))
        .add(v.clone().multiplyScalar(Math.sin(ang) * orbitR));
      posById.set(pol.id, polPos);

      const supIds = polToSuppliers.get(pol.id) || [];
      const m = supIds.length;
      const polU = perpBasis(polPos.clone().sub(center)).u;
      const polV = perpBasis(polPos.clone().sub(center)).v;
      for (let k = 0; k < m; k++) {
        const sid = supIds[k];
        const angS = (k / Math.max(m, 1)) * Math.PI * 2;
        const rS = 1.85;
        const sPos = polPos
          .clone()
          .add(polU.clone().multiplyScalar(Math.cos(angS) * rS))
          .add(polV.clone().multiplyScalar(Math.sin(angS) * rS));
        posById.set(sid, sPos);
      }
    }
  }

  const Rorph = 11;
  for (const pol of orphanPols) {
    const p = fibonacciPoint(orphanIdx, Math.max(orphanPols.length, 1), Rorph);
    posById.set(pol.id, p);
    orphanIdx++;
    const supIds = polToSuppliers.get(pol.id) || [];
    const { u, v } = perpBasis(p);
    supIds.forEach((sid, k) => {
      const angS = (k / Math.max(supIds.length, 1)) * Math.PI * 2;
      posById.set(
        sid,
        p
          .clone()
          .add(u.clone().multiplyScalar(Math.cos(angS) * 1.6))
          .add(v.clone().multiplyScalar(Math.sin(angS) * 1.6)),
      );
    });
  }

  for (const node of nodes) {
    if (!posById.has(node.id)) {
      posById.set(node.id, fibonacciPoint(0, 1, 10));
    }
  }

  return posById;
}

/** @deprecated use layoutGalaxyPositions */
export function layoutOrbPositions(nodes) {
  const byType = { partido: [], politico: [], fornecedor: [], other: [] };
  for (const n of nodes) {
    const t = n?.tipo || "other";
    if (byType[t]) byType[t].push(n);
    else byType.other.push(n);
  }
  const posById = new Map();
  const shells = [
    ["partido", byType.partido, 14],
    ["politico", byType.politico, 10],
    ["fornecedor", byType.fornecedor, 7],
    ["other", byType.other, 8],
  ];
  for (const [, arr, R] of shells) {
    const n = arr.length;
    for (let i = 0; i < n; i++) {
      const node = arr[i];
      const p = fibonacciPoint(i, n, R);
      posById.set(node.id, p);
    }
  }
  return posById;
}

function nodeColor(node) {
  const c = new THREE.Color();

  // Partidos — cor oficial mapeada (PT vermelho, PSDB azul+amarelo, PSOL vermelho+amarelo, etc.).
  if (node?.tipo === "partido") {
    if (typeof node.partyColor === "string" && node.partyColor) {
      try {
        c.setStyle(node.partyColor);
        return c;
      } catch {
        /* fallback abaixo */
      }
    }
    if (Number.isFinite(node.partyHue)) {
      const h = Math.min(360, Math.max(0, node.partyHue));
      c.setHSL(h / 360, 0.72, 0.58);
      return c;
    }
    // Último fallback — cinza neutro.
    c.set("#6b7280");
    return c;
  }

  // Fornecedores críticos — escala de risco (vermelho profundo).
  if (node?.tipo === "fornecedor") {
    const score =
      typeof node.riskScore === "number" && Number.isFinite(node.riskScore)
        ? node.riskScore
        : 80;
    try {
      c.setStyle(getRiskColor(score));
    } catch {
      c.set("#f87171");
    }
    return c;
  }

  // Políticos — cor determinística do CPF/ID modulada por risco (mesma orbe usada
  // nos cards-portal). Garante diversidade visual e identidade única por pessoa.
  if (node?.tipo === "politico") {
    const ident = node.politicoId || node.id || "anon";
    const score = Number.isFinite(node.riskScore) ? node.riskScore : 35;
    try {
      c.setStyle(getPoliticianColor(ident, score).primary);
    } catch {
      c.set("#58a6ff");
    }
    return c;
  }

  // Fallback genérico.
  const score =
    typeof node.riskScore === "number" && Number.isFinite(node.riskScore)
      ? node.riskScore
      : 45;
  try {
    c.setStyle(getRiskColor(score));
  } catch {
    c.set("#58a6ff");
  }
  return c;
}

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

function FlowLink({ from, to, warm, dim }) {
  if (!from || !to) return null;
  const color = warm ? "#fca5a5" : "#93c5fd";
  const lineRef = useRef(null);
  useFrame((_, dt) => {
    const mat = lineRef.current?.material;
    if (mat && "dashOffset" in mat) {
      mat.dashOffset -= dt * (warm ? 0.85 : 0.5);
    }
    if (mat && "opacity" in mat) {
      mat.opacity = dim ? 0.08 : warm ? 0.72 : 0.42;
    }
  });
  return (
    <Line
      ref={(r) => {
        lineRef.current = r;
      }}
      points={[from.toArray(), to.toArray()]}
      color={color}
      lineWidth={warm ? 2.2 : 1.35}
      dashed
      dashSize={0.35}
      gapSize={0.28}
      dashScale={1.8}
      transparent
      opacity={warm ? 0.65 : 0.4}
    />
  );
}

function CameraRig({
  controlsRef,
  flyStateRef,
}) {
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

function SceneContent({
  graphData,
  onNodeClick,
  flyApiRef,
}) {
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

  const linkSegments = useMemo(() => {
    const out = [];
    for (const L of links) {
      const sid = typeof L.source === "object" ? L.source?.id : L.source;
      const tid = typeof L.target === "object" ? L.target?.id : L.target;
      const a = posById.get(String(sid));
      const b = posById.get(String(tid));
      if (!a || !b) continue;
      const risk = typeof L.risk === "number" ? L.risk : 40;
      const sParty = partyIdForNode(nodes.find((n) => n.id === sid) || { id: sid }, links, polToParty);
      const tParty = partyIdForNode(nodes.find((n) => n.id === tid) || { id: tid }, links, polToParty);
      const inFocusParty =
        hoveredPartyId &&
        (sParty === hoveredPartyId || tParty === hoveredPartyId);
      const dim =
        hoveredPartyId && !inFocusParty && (sParty || tParty);
      out.push({
        from: a.clone(),
        to: b.clone(),
        warm: risk >= 60,
        dim: Boolean(dim),
        neon: Boolean(hoveredPartyId && inFocusParty),
      });
    }
    return out;
  }, [links, nodes, posById, hoveredPartyId, polToParty]);

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
      groupRef.current.rotation.y += delta * 0.028;
    }
  });

  const handleInstanceClick = useCallback(
    (e, node) => {
      e.stopPropagation();
      if (typeof onNodeClick === "function") onNodeClick(node);
    },
    [onNodeClick],
  );

  const maxInstances = Math.max(nodes.length, 1);

  return (
    <>
      <group ref={groupRef}>
        <ambientLight intensity={0.22} />
        <pointLight position={[20, 16, 24]} intensity={88} color="#58a6ff" distance={90} />
        <pointLight position={[-18, -12, 20]} intensity={52} color="#f87171" distance={75} />
        <pointLight position={[0, -24, 14]} intensity={38} color="#a78bfa" distance={68} />

        {linkSegments.map((seg, i) => (
          <FlowLink
            key={`ln-${i}`}
            from={seg.from}
            to={seg.to}
            warm={seg.warm || seg.neon}
            dim={seg.dim}
          />
        ))}

        <Instances limit={maxInstances} range={nodes.length}>
          <sphereGeometry args={[0.42, 22, 22]} />
          <meshStandardMaterial
            roughness={0.3}
            metalness={0.42}
            emissive="#0a1628"
            emissiveIntensity={0.55}
            transparent
            opacity={0.96}
          />
          {nodes.map((node) => {
            const p = posById.get(node.id);
            if (!p) return null;
            const partyId = partyIdForNode(node, links, polToParty);
            const isParty = node.tipo === "partido";
            const dim = hoveredPartyId
              ? isParty
                ? String(node.id) !== hoveredPartyId
                : Boolean(partyId) && partyId !== hoveredPartyId
              : false;
            const focusParty = hoveredPartyId && partyId === hoveredPartyId;
            const baseCol = nodeColor(node);
            const col = baseCol.clone();
            if (dim) col.multiplyScalar(0.14);
            if (focusParty && !isParty) {
              col.lerp(new THREE.Color("#7dd3fc"), 0.35);
            }
            let sc = tierScale(node);
            const hr = isHighRisk(node);
            if (hr) {
              sc *= 1 + Math.sin(pulseT.current * 3.2) * 0.07;
              col.lerp(new THREE.Color("#f87171"), 0.22 + Math.sin(pulseT.current * 3.2) * 0.08);
            }
            return (
              <Instance
                key={node.id}
                position={p}
                scale={[sc, sc, sc]}
                color={col}
                onClick={(e) => handleInstanceClick(e, node)}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = "pointer";
                  if (isParty) setHoveredPartyId(String(node.id));
                }}
                onPointerOut={() => {
                  document.body.style.cursor = "auto";
                  if (isParty) setHoveredPartyId(null);
                }}
              />
            );
          })}
        </Instances>
        <OrbitControls
          ref={controlsRef}
          enablePan={true}
          screenSpacePanning={true}
          minDistance={4}
          maxDistance={120}
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

const OrbMeshScene = forwardRef(function OrbMeshScene(
  {
    graphData,
    onNodeClick,
    empty = false,
    className = "",
  },
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
        camera={{ position: [0, 2.5, 28], fov: 46 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#02040a"]} />
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
