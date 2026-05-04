/**
 * galaxyLayout.js — Layout galáctico clusterizado por partido.
 *
 * Em vez de cascas concêntricas ("cebola"), posiciona:
 *   • Partidos   → núcleos gravitacionais em Fibonacci sphere de raio 38
 *   • Políticos  → orbitam o núcleo do seu partido (distribuição gaussiana)
 *   • Fornecedores → satélites em mini-órbita ao redor do político
 *   • Políticos órfãos → casca interna raio 18
 *   • Garantia: todo nó recebe uma posição
 *
 * Determinístico: jitter/gaussiana baseados em hash FNV-1a do node.id.
 * Complexidade: O(N + E) — itera nodes e links uma vez cada.
 *
 * @module galaxyLayout
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Fibonacci sphere — distribui N pontos uniformemente na esfera de raio R
// ---------------------------------------------------------------------------

/**
 * Ponto i de n na Fibonacci sphere de raio `radius`.
 * Implementação matematicamente correta que cobre os pólos.
 *
 * @param {number} i       - índice do ponto (0-based)
 * @param {number} n       - total de pontos
 * @param {number} radius  - raio da esfera
 * @returns {THREE.Vector3}
 */
export function fibonacciPoint(i, n, radius) {
  if (n < 1) return new THREE.Vector3(0, 0, radius);
  const y = 1 - (2 * i) / Math.max(n - 1, 1); // -1..+1 garantido
  const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = goldenAngle * i;
  return new THREE.Vector3(
    radius * radiusAtY * Math.cos(theta),
    radius * y,
    radius * radiusAtY * Math.sin(theta),
  );
}

// ---------------------------------------------------------------------------
// PRNG determinístico — hash FNV-1a 32-bit → [0, 1)
// ---------------------------------------------------------------------------

/**
 * Gera um float determinístico em [0, 1) a partir de uma string.
 * Mesmo input sempre produz o mesmo output.
 *
 * @param {string} str
 * @returns {number}
 */
function hash01(str) {
  let h = 0x811c9dc5;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Gaussiana Box-Muller a partir de duas amostras [0, 1).
 *
 * @param {number} u1
 * @param {number} u2
 * @returns {number}
 */
function gauss(u1, u2) {
  const a = Math.sqrt(-2 * Math.log(Math.max(1e-9, u1)));
  return a * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Índices auxiliares derivados dos links
// ---------------------------------------------------------------------------

/**
 * Constrói mapas de adjacência a partir do array de links.
 *
 * @param {object[]} nodes
 * @param {object[]} links
 * @returns {{ polToParty: Map<string,string>, polToSuppliers: Map<string,string[]> }}
 */
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

// ---------------------------------------------------------------------------
// layoutGalaxyPositions — função principal exportada
// ---------------------------------------------------------------------------

/**
 * LAYOUT GALÁCTICO POR PARTIDO
 *
 * Cada partido vira uma "galáxia": um anchor 3D distribuído por Fibonacci numa
 * casca esférica. Parlamentares são pontos gaussianos em torno do anchor (cluster
 * cósmico). Fornecedores ficam em pequena órbita ao redor do político.
 *
 * Não há mais anel rígido — a sensação é de aglomerados galácticos no espaço.
 *
 * @param {Array<{
 *   id: string,
 *   tipo: 'partido' | 'politico' | 'fornecedor' | string,
 *   politicoId?: string,
 *   supplierOf?: string,
 * }>} nodes
 *
 * @param {Array<{
 *   source: string | { id: string },
 *   target: string | { id: string },
 *   kind?: string,
 * }>} links
 *
 * @returns {Map<string, THREE.Vector3>}  posById  — chave: node.id
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
        const tmp =
          Math.abs(dirOut.y) > 0.9
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

  // Políticos órfãos (sem partido conhecido) — campo disperso em casca interna.
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
      const tmp =
        Math.abs(dirOut.y) > 0.9
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
