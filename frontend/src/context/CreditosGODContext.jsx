import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DEFAULT_SALDO = 300;
const CUSTO_AUDITORIA_CONEXAO = 100;

const CreditosGODContext = createContext({
  saldo: DEFAULT_SALDO,
  custoAuditoriaConexao: CUSTO_AUDITORIA_CONEXAO,
  canAuditar: false,
  consumirAuditoria: () => false,
  resetDemo: () => {},
});

export function CreditosGODProvider({ children }) {
  const [saldo, setSaldo] = useState(DEFAULT_SALDO);
  const saldoRef = useRef(DEFAULT_SALDO);

  useEffect(() => {
    saldoRef.current = saldo;
  }, [saldo]);

  const consumirAuditoria = useCallback(() => {
    if (saldoRef.current < CUSTO_AUDITORIA_CONEXAO) return false;
    const next = saldoRef.current - CUSTO_AUDITORIA_CONEXAO;
    saldoRef.current = next;
    setSaldo(next);
    return true;
  }, []);

  const resetDemo = useCallback(() => {
    saldoRef.current = DEFAULT_SALDO;
    setSaldo(DEFAULT_SALDO);
  }, []);

  const value = useMemo(
    () => ({
      saldo,
      custoAuditoriaConexao: CUSTO_AUDITORIA_CONEXAO,
      canAuditar: saldo >= CUSTO_AUDITORIA_CONEXAO,
      consumirAuditoria,
      resetDemo,
    }),
    [saldo, consumirAuditoria, resetDemo],
  );

  return <CreditosGODContext.Provider value={value}>{children}</CreditosGODContext.Provider>;
}

export function useCreditosGOD() {
  return useContext(CreditosGODContext);
}
