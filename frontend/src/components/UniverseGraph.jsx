import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { OrbitControls } from "@react-three/drei";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";

import { useCameraFocus } from "../context/CameraFocusContext.jsx";
import { getRiskColor } from "../utils/colorUtils.js";

const MAX_NODES = 1000;
const GLOBE_RADIUS = 45;

/** @param {Record<string, unknown>} p */
function extractPoliticoScore(p) {
  if (!p || typeof p !== "object") return 0;
  const keys = [
    "score_forense",
    "indice_risco",
    "score",
    "risk_score",
    "score_risco",
    "score_exposicao",
  ];
  for (const k of keys) {
    const n = Number(p[k]);
    if (Number.isFinite(n)) {
      return Math.round(Math.min(100, Math.max(0, n)));
    }
  }
  return 0;
}

/** Mapeia ID de documento para índice de instância (determinístico). */
export function politicianIdToSlot(docId, nodeCount) {
  const n = Math.max(1, Math.min(nodeCount, MAX_NODES));
  let h = 2166136261;
  const s = String(docId ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

function fibonacciSpherePoint(i, count, R) {
  const phi = Math.acos(-1 + (2 * i) / count);
  const theta = Math.sqrt(count * Math.PI) * phi;
  const sinPhi = Math.sin(phi);
  const x = R * Math.cos(theta) * sinPhi;
  const y = R * Math.sin(theta) * sinPhi;
  const z = R * Math.cos(phi);
  return { x, y, z };
}

function baseScaleForScore(score) {
  const t = score / 100;
  return 0.68 + t * 0.52;
}

function VoidBackground() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-void")
      .trim();
    const col = new THREE.Color(raw || "#080b14");
    scene.background = col;
    gl.setClearColor(col, 1);
  }, [gl, scene]);
  return null;
}

function InstancedSpheres({
  meshRef,
  count,
  positions,
  scores,
  baseScales,
  dadosPorInstancia,
  onOrbSelect,
}) {
  const temp = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []); // Bolt: Reusable color instance
  const hoveredRef = useRef(null); // Bolt: Track hover locally without re-renders

  // Update a single instance's scale directly
  const updateInstanceScale = useCallback(
    (index, scaleFactor) => {
      const mesh = meshRef.current;
      if (!mesh || index == null) return;
      const s = baseScales[index] * scaleFactor;
      temp.position.set(
        positions[index * 3],
        positions[index * 3 + 1],
        positions[index * 3 + 2],
      );
      temp.scale.set(s, s, s);
      temp.updateMatrix();
      mesh.setMatrixAt(index, temp.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    },
    [baseScales, meshRef, positions, temp]
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count < 1) return;

    for (let i = 0; i < count; i++) {
      const hx = hoveredRef.current === i ? 1.14 : 1;
      const s = baseScales[i] * hx;
      temp.position.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      );
      temp.scale.set(s, s, s);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);

      tempColor.setStyle(getRiskColor(scores[i])); // Bolt: Reuse instead of instantiating new color
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [
    meshRef,
    count,
    positions,
    scores,
    baseScales,
    temp,
    tempColor,
  ]);

  if (count < 1) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled
      onClick={(e) => {
        e.stopPropagation();
        const instanceId = e.instanceId;
        const row = dadosPorInstancia[instanceId];
        const id = row?.docId;
        if (!id || instanceId == null) return;
        const wx = positions[instanceId * 3];
        const wy = positions[instanceId * 3 + 1];
        const wz = positions[instanceId * 3 + 2];
        const worldPos = new THREE.Vector3(wx, wy, wz);
        onOrbSelect?.(worldPos, id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (e.instanceId != null) {
          // Reset previous hovered if necessary
          if (hoveredRef.current != null && hoveredRef.current !== e.instanceId) {
             updateInstanceScale(hoveredRef.current, 1);
          }
          hoveredRef.current = e.instanceId;
          updateInstanceScale(e.instanceId, 1.14);
          document.body.style.cursor = "pointer";
        }
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (hoveredRef.current != null) {
          updateInstanceScale(hoveredRef.current, 1);
          hoveredRef.current = null;
          document.body.style.cursor = "auto";
        }
      }}
    >
      <sphereGeometry args={[0.5, 24, 24]} />
      <meshBasicMaterial vertexColors={true} toneMapped={false} />
    </instancedMesh>
  );
}

function CameraTargetRig({ controlsRef, trackingRef }) {
  const { camera } = useThree();

  useFrame((_, delta) => {
    const tr = trackingRef.current;
    if (!tr.active || !controlsRef.current) return;

    const camDest = tr.camDestination;
    const lookTarget = tr.lookTarget;
    const damping = 1 - Math.exp(-3.8 * delta);

    camera.position.lerp(camDest, damping);
    controlsRef.current.target.lerp(lookTarget, damping);
    controlsRef.current.update();

    const elapsed = performance.now() - (tr.startedAt ?? 0);
    const settled =
      camera.position.distanceTo(camDest) < 0.12 &&
      controlsRef.current.target.distanceTo(lookTarget) < 0.12;

    if (elapsed > 380 && settled) {
      tr.active = false;
      const id = tr.pendingNavigateId;
      tr.pendingNavigateId = null;
      tr.startedAt = null;
      if (id && tr.navigateFn) {
        tr.navigateFn(`/dossie/${encodeURIComponent(id)}`);
      }
    }
  });

  return null;
}

/**
 * @param {{ politicos: Array<{ id: string } & Record<string, unknown>> }} props
 */
export default function UniverseGraph({ politicos = [] }) {
  const navigate = useNavigate();
  const meshRef = useRef(null);
  const controlsRef = useRef(null);
  // Bolt: Remove hoveredInstanceId state to prevent re-renders
  // const [hoveredInstanceId, setHoveredInstanceId] = useState(null);
  const trackingRef = useRef({
    active: false,
    startedAt: null,
    lookTarget: new THREE.Vector3(),
    camDestination: new THREE.Vector3(),
    pendingNavigateId: null,
    navigateFn: null,
  });

  const { focusRequest, clearFocusRequest } = useCameraFocus();

  const sceneSignature = useMemo(
    () => politicos.slice(0, MAX_NODES).map((p) => p.id).join("|"),
    [politicos],
  );

  const sceneBundle = useMemo(() => {
    const count = Math.min(politicos.length, MAX_NODES);
    const positionsArr = new Float32Array(Math.max(count, 1) * 3);
    const scoresArr = new Int32Array(Math.max(count, 1));
    const baseScalesArr = new Float32Array(Math.max(count, 1));
    const dadosPorInstancia = [];

    if (count < 1) {
      return {
        count: 0,
        positions: positionsArr,
        scores: scoresArr,
        baseScales: baseScalesArr,
        dadosPorInstancia,
      };
    }

    for (let i = 0; i < count; i++) {
      const p = politicos[i];
      const { x, y, z } = fibonacciSpherePoint(i, count, GLOBE_RADIUS);
      positionsArr[i * 3] = x;
      positionsArr[i * 3 + 1] = y;
      positionsArr[i * 3 + 2] = z;

      const sc = extractPoliticoScore(p);
      scoresArr[i] = sc;
      baseScalesArr[i] = baseScaleForScore(sc);
      dadosPorInstancia.push({ docId: p.id });
    }

    return {
      count,
      positions: positionsArr,
      scores: scoresArr,
      baseScales: baseScalesArr,
      dadosPorInstancia,
    };
  }, [politicos]);

  const beginTrackingToWorldPoint = useCallback(
    (worldPos, navigateToDocId) => {
      const look = worldPos.clone();
      const camDest = look.clone().add(new THREE.Vector3(0, 1.6, 11.5));
      const tr = trackingRef.current;
      tr.lookTarget.copy(look);
      tr.camDestination.copy(camDest);
      tr.pendingNavigateId = navigateToDocId;
      tr.navigateFn = navigate;
      tr.startedAt = performance.now();
      tr.active = true;
    },
    [navigate],
  );

  useEffect(() => {
    if (!focusRequest?.politicianId || sceneBundle.count < 1) return;
    const pid = focusRequest.politicianId;
    const slot = politicianIdToSlot(pid, sceneBundle.count);
    const x = sceneBundle.positions[slot * 3];
    const y = sceneBundle.positions[slot * 3 + 1];
    const z = sceneBundle.positions[slot * 3 + 2];
    const worldPos = new THREE.Vector3(x, y, z);
    beginTrackingToWorldPoint(worldPos, pid);
    clearFocusRequest();
  }, [
    focusRequest,
    sceneBundle.count,
    sceneBundle.positions,
    beginTrackingToWorldPoint,
    clearFocusRequest,
  ]);

  return (
    <>
      <VoidBackground />
      <InstancedSpheres
        key={sceneSignature || "empty"}
        meshRef={meshRef}
        count={sceneBundle.count}
        positions={sceneBundle.positions}
        scores={sceneBundle.scores}
        baseScales={sceneBundle.baseScales}
        dadosPorInstancia={sceneBundle.dadosPorInstancia}
        onOrbSelect={beginTrackingToWorldPoint}

      />
      <CameraTargetRig controlsRef={controlsRef} trackingRef={trackingRef} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={140}
      />
      <EffectComposer disableNormalPass>
        <Bloom luminanceThreshold={0.1} mipmapBlur intensity={1.5} />
      </EffectComposer>
    </>
  );
}
