# Templates de petição

O caminho **D** (`peticao_template`) descarrega o modelo a partir do bucket configurado em `GCS_BUCKET` (padrão `tbr-leads-staging`), objecto `templates/peticoes/template_universal.docx` — o mesmo contrato usado por `generateInitialPetition`.

Não versionar DOCX com dados reais. Envie o ficheiro para o GCS e valide placeholders (`LEAD_NOME`, `LEAD_CPF`, `MOTIVO_INDEFERIMENTO`, etc.).
