/**
 * searchByName.js — Busca de parlamentares por nome no Firestore
 * Implementa busca fuzzy com normalização de diacríticos
 */

import { getFirestoreDb } from "./firebase.js";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

/**
 * Normaliza string removendo acentos e convertendo para minúsculas
 */
function normalizeString(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Busca parlamentares por nome (fuzzy match)
 * @param {string} searchTerm - Nome a buscar
 * @param {number} maxResults - Máximo de resultados (padrão 10)
 * @returns {Promise<Array>} Array de parlamentares encontrados
 */
export async function searchParlamentaresByName(searchTerm, maxResults = 10) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) {
      console.warn("Firestore não configurado");
      return [];
    }

    const normalizedTerm = normalizeString(searchTerm);
    const parlamentaresRef = collection(db, "politicos");

    // Estratégia 1: Busca exata no campo normalizado
    const q1 = query(
      parlamentaresRef,
      where("nome_normalizado", ">=", normalizedTerm),
      where("nome_normalizado", "<=", normalizedTerm + "\uf8ff"),
      limit(maxResults)
    );

    let results = [];
    try {
      const snapshot = await getDocs(q1);
      results = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (e) {
      // Índice pode não existir ainda
      console.warn("Índice de busca por nome não disponível", e.message);
    }

    // Estratégia 2: Fallback para busca no campo nome original (sem índice)
    if (results.length === 0) {
      const parlamentaresSnapshot = await getDocs(parlamentaresRef);
      const allParlamentares = parlamentaresSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Fuzzy match local
      results = allParlamentares
        .filter((p) => {
          const nome = normalizeString(p.nome || p.nome_civil || "");
          return nome.includes(normalizedTerm);
        })
        .slice(0, maxResults);
    }

    return results;
  } catch (error) {
    console.error("Erro ao buscar parlamentares por nome:", error);
    return [];
  }
}

/**
 * Busca por ID ou nome (tenta ID primeiro, depois nome)
 */
export async function searchPolitico(query) {
  if (!query || query.trim().length === 0) {
    return null;
  }

  // Tenta como ID primeiro
  if (/^\d+$/.test(query.trim())) {
    try {
      const db = getFirestoreDb();
      if (db) {
        const politicoRef = collection(db, "politicos");
        const q = query(politicoRef, where("id", "==", query.trim()), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          return {
            id: snapshot.docs[0].id,
            ...snapshot.docs[0].data(),
          };
        }
      }
    } catch (e) {
      // Continua para busca por nome
    }
  }

  // Busca por nome
  const results = await searchParlamentaresByName(query, 1);
  return results.length > 0 ? results[0] : null;
}

/**
 * Cria índice de normalização para busca
 * Deve ser chamado ao popular dados no Firestore
 */
export function createNormalizedIndex(politico) {
  return {
    ...politico,
    nome_normalizado: normalizeString(politico.nome || politico.nome_civil || ""),
  };
}
