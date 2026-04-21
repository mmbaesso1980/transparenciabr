import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

/**
 * Registo único do protocolo PMTiles no MapLibre (ciclo de vida da aplicação).
 * Não remover em unmount — evita corrida entre vários mapas.
 */
let protocolSingleton = null;
let registered = false;

export function registerPmtilesProtocolOnce() {
  if (registered && protocolSingleton) return protocolSingleton;
  protocolSingleton = new Protocol();
  maplibregl.addProtocol("pmtiles", protocolSingleton.tile);
  registered = true;
  return protocolSingleton;
}
