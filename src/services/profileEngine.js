import { findTariffs } from './tariffEngine.js';
import { estimateElectricityBill } from '../calculators/billEstimator.js';

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProfile(input = {}) {
  const consumptionKwh = num(input.consumptionKwh ?? input.kwh, null);
  const powerKw = num(input.powerKw, null);
  const days = num(input.days, 30);
  const type = normalize(input.customerType ?? input.type ?? 'hogar');
  const schedule = normalize(input.schedule ?? input.consumptionPattern ?? '');
  const noPermanence = Boolean(input.noPermanence ?? input.requireNoPermanence ?? false);
  const renewable = Boolean(input.renewable ?? input.wantsRenewable ?? false);

  if (consumptionKwh !== null && consumptionKwh < 0) throw new Error('consumptionKwh debe ser mayor o igual a 0.');
  if (powerKw !== null && powerKw < 0) throw new Error('powerKw debe ser mayor o igual a 0.');
  if (!days || days <= 0) throw new Error('days debe ser mayor que 0.');

  return {
    consumptionKwh,
    powerKw,
    days,
    customerType: type,
    schedule,
    noPermanence,
    renewable
  };
}

function preferenceSignals(tariff) {
  const text = normalize([
    tariff.name,
    tariff.segment,
    tariff.discounts,
    tariff.notes,
    tariff.source
  ].join(' '));
  const permanence = tariff.permanence?.status;
  return {
    renewable: /renovab|verde|solar|autoconsumo/.test(text),
    nightFriendly: /valle|horari|nocturn|discriminacion/.test(text),
    flat: tariff.flatEnergyPrice != null,
    permanence
  };
}

function fitScore(tariff, profile, estimatedTotal) {
  const signals = preferenceSignals(tariff);
  let score = 100;
  const reasons = [];
  const penalties = [];

  if (estimatedTotal != null) {
    score -= Math.min(45, estimatedTotal);
  }

  if (profile.noPermanence) {
    if (signals.permanence === 'no') {
      score += 15;
      reasons.push('Cumple la preferencia de no permanencia.');
    } else if (signals.permanence === 'yes') {
      score -= 25;
      penalties.push('Tiene permanencia y el perfil pide evitarla.');
    } else {
      score -= 8;
      penalties.push('La permanencia no está suficientemente especificada.');
    }
  }

  if (profile.renewable) {
    if (signals.renewable) {
      score += 12;
      reasons.push('El nombre o la información disponible indica una orientación renovable.');
    } else {
      penalties.push('No hay una señal estructurada clara de atributo renovable.');
    }
  }

  if (profile.schedule.includes('noche') || profile.schedule.includes('nocturn')) {
    if (signals.nightFriendly) {
      score += 8;
      reasons.push('Presenta señales compatibles con consumo nocturno/por periodos.');
    } else {
      reasons.push('Es una tarifa plana; no se puede afirmar una ventaja específica por consumo nocturno.');
    }
  }

  if (profile.customerType.includes('empresa') || profile.customerType.includes('pyme') || profile.customerType.includes('autonom')) {
    if (/empresa|pyme|autonom/.test(normalize(tariff.segment))) {
      score += 5;
      reasons.push('El segmento declarado incluye empresa, pyme o autónomos.');
    }
  }

  score = Math.max(0, Math.min(100, Number(score.toFixed(2))));
  return { score, reasons, penalties };
}

export async function recommendTariffs(profileInput = {}, options = {}) {
  const profile = normalizeProfile(profileInput);
  const company = profileInput.company ?? null;
  const limit = Math.min(Math.max(Number(options.limit ?? 5), 1), 10);
  const searchQuery = options.query || 'tarifas electricidad';

  let tariffs = await findTariffs(searchQuery, {
    company,
    limit: Math.max(limit * 8, 30),
    type: 'electricity'
  });

  tariffs = tariffs
    .filter((t) => t.type === 'electricity' && t.category === 'electricidad' && t.comparable)
    .filter((t) => profile.powerKw === null || t.maxPowerKw == null || profile.powerKw <= Number(t.maxPowerKw));

  if (profile.noPermanence) {
    const strict = tariffs.filter((t) => t.permanence?.status === 'no');
    if (strict.length) tariffs = strict;
  }

  const evaluated = tariffs.map((tariff) => {
    const estimate = profile.consumptionKwh === null
      ? null
      : estimateElectricityBill({
          tariff,
          kwh: profile.consumptionKwh,
          powerKw: profile.powerKw,
          days: profile.days,
          includePower: profile.powerKw !== null,
          useDiscountedPrices: true
        });

    const total = estimate?.status === 'ok' ? estimate.summary.total : null;
    const fit = fitScore(tariff, profile, total);

    return {
      id: tariff.id,
      company: tariff.company,
      name: tariff.name,
      planCode: tariff.planCode,
      estimatedTotal: total,
      flatEnergyPrice: tariff.flatEnergyPrice,
      permanence: tariff.permanence,
      maxPowerKw: tariff.maxPowerKw,
      requiresVerification: tariff.requiresVerification,
      source: tariff.source,
      fitScore: fit.score,
      reasons: fit.reasons,
      penalties: fit.penalties,
      estimateStatus: estimate?.status ?? 'needs_consumption'
    };
  });

  const usable = evaluated.filter((x) => x.estimateStatus === 'ok' || profile.consumptionKwh === null);
  usable.sort((a, b) =>
    (b.fitScore - a.fitScore) ||
    ((a.estimatedTotal ?? Infinity) - (b.estimatedTotal ?? Infinity)) ||
    normalize(a.name).localeCompare(normalize(b.name))
  );

  const ranked = usable.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    ...item
  }));

  return {
    profile,
    company,
    recommendationMode: profile.consumptionKwh === null ? 'profile_fit_without_bill_estimate' : 'profile_fit_with_estimated_monthly_cost',
    best: ranked[0] ?? null,
    recommendations: ranked,
    excluded: evaluated.slice(limit).map((x) => ({ id: x.id, company: x.company, name: x.name, estimateStatus: x.estimateStatus })),
    authority: 'LuzIA Engine Profile & Recommendation Engine',
    disclaimer: 'Recomendación orientativa basada en los datos estructurados disponibles. El fit score es un indicador interno, no una garantía de ahorro. Verificar vigencia, impuestos y condiciones antes de contratar.'
  };
}
