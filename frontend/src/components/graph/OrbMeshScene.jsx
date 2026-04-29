import { Canvas, useFrame } from "@react-three/fiber";
import { Instances, Instance, Line, OrbitControls } from "@react-three/drei";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";

import { getRiskColor } from "../../utils/colorUtils.js";

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
      return 1.35;
    case "medio":
      return 1;
    case "pequeno":
      return 0.62;
    default:
      return 0.85;
  }
}

/**
 * Posiciona nós em cascas esféricas (sem worker / sem canvas 2D).
 */
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
  if (node?.tipo === "partido" && Number.isFinite(node.partyHue)) {
    const h = Math.min(360, Math.max(0, node.partyHue));
    return `hsl(${h}, 72%, 58%)`;
  }
  const score =
    typeof node.riskScore === "number" && Number.isFinite(node.riskScore)
      ? node.riskScore
      : 45;
  try {
    return getRiskColor(score);
  } catch {
    return "#58a6ff";
  }
}

function LinkNeon({ from, to, warm }) {
  if (!from || !to) return null;
  const points = [from.toArray(), to.toArray()];
  const color = warm ? "#f87171" : "#93c5fd";
  return (
    <Line
      points={points}
      color={color}
      lineWidth={warm ? 2 : 1.2}
      transparent
      opacity={0.55}
    />
  );
}

function SceneContent({ graphData, onNodeClick }) {
  const groupRef = useRef(null);
  const nodes = graphData?.nodes ?? [];
  const links = graphData?.links ?? [];

  const posById = useMemo(() => layoutOrbPositions(nodes), [nodes]);

  const linkSegments = useMemo(() => {
    const out = [];
    for (const L of links) {
      const sid = typeof L.source === "object" ? L.source?.id : L.source;
      const tid = typeof L.target === "object" ? L.target?.id : L.target;
      const a = posById.get(String(sid));
      const b = posById.get(String(tid));
      if (!a || !b) continue;
      const risk = typeof L.risk === "number" ? L.risk : 40;
      out.push({ from: a.clone(), to: b.clone(), warm: risk >= 60 });
    }
    return out;
  }, [links, posById]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.06;
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
    <group ref={groupRef}>
      <ambientLight intensity={0.25} />
      <pointLight position={[18, 14, 22]} intensity={90} color="#58a6ff" distance={80} />
      <pointLight position={[-16, -10, 18]} intensity={55} color="#f87171" distance={70} />
      <pointLight position={[0, -22, 12]} intensity={40} color="#a78bfa" distance={65} />

      {linkSegments.map((seg, i) => (
        <LinkNeon key={`ln-${i}`} from={seg.from} to={seg.to} warm={seg.warm} />
      ))}

      <Instances limit={maxInstances} range={nodes.length}>
        <sphereGeometry args={[0.42, 20, 20]} />
        <meshStandardMaterial
          roughness={0.32}
          metalness={0.38}
          emissive="#0a1628"
          emissiveIntensity={0.6}
        />
        {nodes.map((node) => {
          const p = posById.get(node.id);
          if (!p) return null;
          const col = nodeColor(node);
          const sc = tierScale(node);
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
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto";
              }}
            />
          );
        })}
      </Instances>
      <OrbitControls
        enablePan={false}
        minDistance={12}
        maxDistance={42}
        enableDamping
        dampingFactor={0.08}
      />
    </group>
  );
}

/**
 * Grafo 3D InstancedMesh — sem react-force-graph / workers.
 *
 * @param {{
 *   graphData: { nodes: object[], links: object[] },
 *   onNodeClick?: (node: object) => void,
 *   empty?: boolean,
 *   className?: string,
 * }} props
 */
export default function OrbMeshScene({
  graphData,
  onNodeClick,
  empty = false,
  className = "",
}) {
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
        camera={{ position: [0, 2, 26], fov: 48 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#02040a"]} />
        <SceneContent graphData={graphData} onNodeClick={onNodeClick} />
      </Canvas>
    </div>
  );
}
