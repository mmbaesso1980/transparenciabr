import { createContext, useCallback, useContext, useMemo, useState } from "react";

const CameraFocusContext = createContext(null);

/**
 * Pedido de rastreamento orbital (Home): o universo 3D interpola a câmera
 * antes da navegação para o dossiê.
 */
export function CameraFocusProvider({ children }) {
  const [focusRequest, setFocusRequest] = useState(null);

  const requestTrackToPolitician = useCallback((politicianDocumentId) => {
    const id = String(politicianDocumentId ?? "").trim();
    if (!id) return;
    setFocusRequest({ politicianId: id, nonce: Date.now() });
  }, []);

  const clearFocusRequest = useCallback(() => setFocusRequest(null), []);

  const value = useMemo(
    () => ({
      focusRequest,
      requestTrackToPolitician,
      clearFocusRequest,
    }),
    [focusRequest, requestTrackToPolitician, clearFocusRequest],
  );

  return (
    <CameraFocusContext.Provider value={value}>
      {children}
    </CameraFocusContext.Provider>
  );
}

export function useCameraFocus() {
  const ctx = useContext(CameraFocusContext);
  if (!ctx) {
    throw new Error("useCameraFocus must be used within CameraFocusProvider");
  }
  return ctx;
}
