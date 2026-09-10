import { searchStructuredTariffs, summarizeTariff } from './structuredTariffEngine.js';
import { estimateElectricityBill } from '../calculators/billEstimator.js';

function isFlatComparable(tariff) {
  return tariff.flatEnergyPrice != null
    && tariff.powerPriceUnit === 'eur_per_kw_day'
    && tariff.type === 'electricity'
    && tariff.category === 'electricidad';
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function semanticKey(row) {
  return [
    normalizeText(row.company),
    normalizeText(row.name),
    normalizeText(row.planCode),
    row.flatEnergyPrice ?? '',
    row.powerP1Price ?? '',
    row.powerP2Price ?? ''
  ].join('|');
}

function dedupeTariffs(rows = []) {
  const seenIds = new Set();
  const seenSemantic = new Set();
  const result = [];

  for (const row of rows) {
    if (row.id && seenIds.has(row.id)) continue;
    const key = semanticKey(row);
    if (seenSemantic.has(key)) continue;
    if (row.id) seenIds.add(row.id);
    seenSemantic.add(key);
    result.push(row);
  }

  return result;
}

function filterElectricityCandidates(rows, { powerKw, requireNoPermanence = false } = {}) {
  const normalizedPower = Number(powerKw);
  const hasPower = Number.isFinite(normalizedPower);

  return rows
    .filter((t) => t.type === 'electricity')
    .filter((t) => t.category === 'electricidad')
    .filter((t) => !hasPower || t.maxPowerKw == null || normalizedPower <= Number(t.maxPowerKw))
    .filter((t) => !requireNoPermanence || t.permanence?.status === 'no');
}

export async function findTariffs(query = '', { company, limit = 20, type = 'electricity' } = {}) {
  const requestedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const searchLimit = Math.max(requestedLimit * 3, 30);
  let tariffs = await searchStructuredTariffs({ query, company, type, limit: searchLimit });

  if (company) {
    const wantedCompany = normalizeText(company);
    tariffs = tariffs.filter((t) => normalizeText(t.company) === wantedCompany);
  }

  const rows = tariffs.map((t) => ({
    ...summarizeTariff(t),
    type: t.type,
    category: t.category,
    comparable: isFlatComparable(t),
    flatEnergyPrice: t.flatEnergyPrice,
    powerP1Price: t.powerP1Price,
    powerP2Price: t.powerP2Price,
    score: t.score
  }));

  return dedupeTariffs(rows).slice(0, requestedLimit);
}

function buildEstimate(tariff, { kwh, powerKw, powerKwP1, powerKwP2, days }) {
  if (kwh == null) return null;
  return estimateElectricityBill({
    tariff,
    kwh,
    powerKw,
    powerKwP1,
    powerKwP2,
    days,
    useDiscountedPrices: true,
    includePower: powerKw != null || powerKwP1 != null || powerKwP2 != null
  });
}

export async function compareTariffs({
  query = '',
  company,
  kwh,
  powerKw,
  powerKwP1,
  powerKwP2,
  days = 30,
  limit = 5,
  requireNoPermanence = false
} = {}) {
  const requestedLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const searchQuery = query || (company ? '' : 'tarifas electricidad');
  const rows = await findTariffs(searchQuery, {
    company,
    limit: Math.max(requestedLimit * 6, 30),
    type: 'electricity'
  });

  const candidates = filterElectricityCandidates(rows, { powerKw, requireNoPermanence });

  const comparable = candidates
    .filter((t) => t.comparable)
    .map((tariff) => {
      const estimate = buildEstimate(tariff, {
        kwh,
        powerKw,
        powerKwP1,
        powerKwP2,
        days
      });

      const calculationOk = estimate?.status === 'ok';
      const sortableTotal = calculationOk
        ? estimate.summary.total
        : kwh != null
          ? Number.POSITIVE_INFINITY
          : tariff.flatEnergyPrice ?? Number.POSITIVE_INFINITY;

      return { ...tariff, estimate, sortableTotal, calculationOk };
    })
    .filter((t) => kwh == null || t.calculationOk)
    .sort((a, b) =>
      (a.sortableTotal - b.sortableTotal) ||
      ((a.flatEnergyPrice ?? Infinity) - (b.flatEnergyPrice ?? Infinity)) ||
      normalizeText(a.name).localeCompare(normalizeText(b.name))
    );

  const best = comparable[0] ?? null;
  const bestTotal = best?.estimate?.summary?.total ?? null;

  const ranked = comparable.slice(0, requestedLimit).map((tariff, index) => {
    const total = tariff.estimate?.summary?.total ?? null;
    const { sortableTotal, calculationOk, estimate, ...clean } = tariff;

    return {
      rank: index + 1,
      ...clean,
      estimatedTotal: total,
      estimateStatus: estimate?.status ?? null,
      savingVsBest: total != null && bestTotal != null
        ? Number((total - bestTotal).toFixed(4))
        : null,
      savingLabel: index === 0 ? 'mejor_opcion' : 'diferencia_vs_mejor'
    };
  });

  const includedIds = new Set(ranked.map((t) => t.id));
  const excluded = dedupeTariffs(rows)
    .filter((t) => !includedIds.has(t.id))
    .filter((t) => t.type === 'electricity')
    .map((t) => {
      let reason = 'No se pudo incluir en la comparación.';
      if (t.category !== 'electricidad') {
        reason = 'La categoría eléctrica no corresponde al perfil 2.0TD/comparable de esta comparación.';
      } else if (!t.comparable) {
        reason = 'La tarifa requiere datos horarios u otra lógica no soportada por esta comparación.';
      } else if (requireNoPermanence && t.permanence?.status !== 'no') {
        reason = 'No cumple el filtro de permanencia solicitado.';
      } else if (kwh != null) {
        reason = 'No se pudo calcular con los datos disponibles.';
      }
      return {
        id: t.id,
        company: t.company,
        name: t.name,
        reason
      };
    });

  return {
    criteria: {
      company: company ?? null,
      kwh: kwh ?? null,
      powerKw: powerKw ?? null,
      powerKwP1: powerKwP1 ?? null,
      powerKwP2: powerKwP2 ?? null,
      days,
      requireNoPermanence
    },
    best: best ? {
      id: best.id,
      company: best.company,
      name: best.name,
      flatEnergyPrice: best.flatEnergyPrice,
      estimatedTotal: bestTotal,
      currency: 'EUR'
    } : null,
    tariffs: ranked,
    excluded,
    comparisonMode: kwh != null ? 'estimated_monthly_cost' : 'energy_price_only',
    authority: 'LuzIA Engine Calculator & Comparison Engine',
    disclaimer: 'Comparación orientativa basada en el catálogo estructurado de PRECIOS AGOSTO. No incluye automáticamente impuestos, alquileres, servicios, ajustes ni condiciones particulares. Verificar vigencia y condiciones antes de contratar.'
  };
}

export async function estimateTariffById(tariffId, options = {}) {
  const all = await findTariffs('', { type: 'electricity', limit: 100 });
  const tariff = all.find((item) => item.id === tariffId);
  if (!tariff) throw new Error(`No se encontró la tarifa ${tariffId}.`);
  return estimateElectricityBill({
    tariff,
    kwh: options.kwh,
    powerKw: options.powerKw,
    powerKwP1: options.powerKwP1,
    powerKwP2: options.powerKwP2,
    days: options.days ?? 30,
    periods: options.periods,
    useDiscountedPrices: options.useDiscountedPrices ?? true,
    includePower: options.includePower ?? true,
    taxRate: options.taxRate,
    otherCharges: options.otherCharges
  });
}
