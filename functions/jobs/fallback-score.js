exports.fallbackCalculate = function (parlamentar) {
  const flags = [];
  const breakdown = { ceap: 0, emendas: 0, nepotismo: 0, votos: 0, flavio: 0 };

  const totalCEAP = parlamentar.totalCEAP || 0;
  const totalEmendas = parlamentar.totalEmendasGeral || 0;
  const presenca = parlamentar.percentualPresenca;

  if (totalCEAP > 1_500_000) { breakdown.ceap = 20; flags.push('CEAP_ELEVADO'); }
  else if (totalCEAP > 1_000_000) breakdown.ceap = 15;
  else if (totalCEAP > 500_000) breakdown.ceap = 10;
  else if (totalCEAP > 100_000) breakdown.ceap = 5;

  if (totalEmendas > 50_000_000) { breakdown.emendas = 20; flags.push('EMENDAS_CONCENTRADAS'); }
  else if (totalEmendas > 20_000_000) breakdown.emendas = 15;
  else if (totalEmendas > 10_000_000) breakdown.emendas = 10;
  else if (totalEmendas > 2_000_000) breakdown.emendas = 5;

  if (presenca != null) {
    if (presenca < 50) { breakdown.votos = 20; flags.push('AUSENCIA_CRONICA'); }
    else if (presenca < 70) breakdown.votos = 12;
    else if (presenca < 85) breakdown.votos = 5;
  }

  breakdown.nepotismo = parlamentar._nepotismoScore || 0;
  breakdown.flavio = parlamentar._flavioScore || 0;
  if (breakdown.nepotismo >= 15) flags.push('NEPOTISMO_SUSPEITO');
  if (breakdown.flavio >= 15) flags.push('RACHADINHA_SUSPEITA');

  const total =
    breakdown.ceap + breakdown.emendas + breakdown.nepotismo + breakdown.votos + breakdown.flavio;

  return { total: Math.min(100, total), breakdown, flags, engine: 'fallback-v1' };
};
