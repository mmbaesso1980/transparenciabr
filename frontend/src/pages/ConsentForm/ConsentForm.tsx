import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import styles from "./ConsentForm.module.css";
import { postConsent } from "./api";

const ESPECIES = [
  { value: "auxilio_doenca", label: "Auxílio-doença / incapacidade" },
  { value: "bpc_loas", label: "BPC / LOAS" },
  { value: "aposentadoria_invalidez", label: "Aposentadoria por invalidez" },
  { value: "auxilio_acidente", label: "Auxílio-acidente" },
  { value: "outro", label: "Outro benefício indeferido" },
];

type Uf = { id: number; sigla: string; nome: string };

export default function ConsentForm() {
  const [ufs, setUfs] = useState<Uf[]>([]);
  const [municipios, setMunicipios] = useState<{ id: number; nome: string }[]>([]);
  const [loadingMun, setLoadingMun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [especie, setEspecie] = useState("");
  const [lgpd, setLgpd] = useState(false);
  const [comAdv, setComAdv] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      lgpd &&
      cpf.replace(/\D/g, "").length === 11 &&
      nome.trim().length >= 3 &&
      telefone.trim().startsWith("+") &&
      uf.length === 2 &&
      municipio.trim().length > 1 &&
      especie.length > 0
    );
  }, [lgpd, cpf, nome, telefone, uf, municipio, especie]);

  useEffect(() => {
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome")
      .then((r) => r.json())
      .then((data) => setUfs(data))
      .catch(() => setUfs([]));
  }, []);

  useEffect(() => {
    if (!uf) {
      setMunicipios([]);
      setMunicipio("");
      return;
    }
    const row = ufs.find((u) => u.sigla === uf);
    if (!row) {
      setMunicipios([]);
      return;
    }
    setLoadingMun(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${row.id}/municipios`)
      .then((r) => r.json())
      .then((rows) => {
        setMunicipios(rows.map((m: { id: number; nome: string }) => ({ id: m.id, nome: m.nome })));
      })
      .catch(() => setMunicipios([]))
      .finally(() => setLoadingMun(false));
  }, [uf, ufs]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await postConsent({
        cpf,
        nome,
        telefone,
        email: email || undefined,
        uf,
        municipio,
        especie_beneficio_indeferido: especie,
        consent_checkboxes: { lgpd_art7_i: lgpd, comunicacao_advogado: comAdv },
      });
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const nomeUf = ufs.find((u) => u.sigla === uf)?.nome;
  const headlineLocal = uf && nomeUf ? `no estado de ${nomeUf}` : "no seu estado";

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Sou indeferido — TransparênciaBR</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </Helmet>
      <div className={styles.inner}>
        <p className={styles.badge}>Motor AURORA · LGPD-first</p>
        <h1 className={styles.title}>
          Você teve um benefício INSS indeferido {headlineLocal}? Nossos especialistas podem avaliar sua chance de
          reversão judicial — sem custo inicial.
        </h1>
        <p className={styles.lead}>
          Comandante Baesso: este formulário é informativo. Os dados serão tratados apenas para avaliação jurídica do
          seu caso, com registo de auditoria, e poderão ser revogados a qualquer momento.
        </p>

        {done ? (
          <div className={styles.success}>
            <h2>Registo recebido</h2>
            <p className={styles.muted}>
              O motor AURORA confirmou o consentimento. A equipa contactá-lo-á apenas para a finalidade declarada. Em
              caso de dúvidas:{" "}
              <a className={styles.link} href="mailto:contato@transparenciabr.com.br">
                contato@transparenciabr.com.br
              </a>
              .
            </p>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.label}>
              <span>CPF</span>
              <input className={styles.input} value={cpf} onChange={(e) => setCpf(e.target.value)} required />
            </label>
            <label className={styles.label}>
              <span>Nome completo</span>
              <input className={styles.input} value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            <label className={styles.label}>
              <span>Telefone (WhatsApp) — formato E.164, ex.: +5511999998888</span>
              <input className={styles.input} value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
            </label>
            <label className={styles.label}>
              <span>E-mail (opcional)</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              <span>UF</span>
              <select className={styles.select} value={uf} onChange={(e) => setUf(e.target.value)} required>
                <option value="">Selecione</option>
                {ufs.map((u) => (
                  <option key={u.id} value={u.sigla}>
                    {u.sigla} — {u.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              <span>Município {loadingMun ? "(a carregar…)" : ""}</span>
              <select
                className={styles.select}
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                required
                disabled={!uf || loadingMun}
              >
                <option value="">Selecione</option>
                {municipios.map((m) => (
                  <option key={m.id} value={m.nome}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              <span>Espécie indeferida</span>
              <select className={styles.select} value={especie} onChange={(e) => setEspecie(e.target.value)} required>
                <option value="">Selecione</option>
                {ESPECIES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.checkboxRow}>
              <input id="lgpd" type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} />
              <label htmlFor="lgpd">
                Autorizo o tratamento dos meus dados pessoais para finalidade exclusiva de avaliação jurídica de meu
                benefício INSS indeferido, podendo revogar a qualquer tempo via contato@transparenciabr.com.br (LGPD
                art. 7º I).
              </label>
            </div>
            <div className={styles.checkboxRow}>
              <input id="adv" type="checkbox" checked={comAdv} onChange={(e) => setComAdv(e.target.checked)} />
              <label htmlFor="adv">Autorizo contacto pelo advogado responsável pela análise do meu caso.</label>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <div className={styles.actions}>
              <button type="submit" className={styles.submit} disabled={!canSubmit || submitting}>
                {submitting ? "A enviar…" : "Avaliar meu caso"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
