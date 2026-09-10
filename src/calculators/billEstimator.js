import { calculateTariffEstimate } from './energyCalculator.js';

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function round4(n) {
  return Number(Number(n).toFixed(4));
}

function cleanMoney(value) {
  const n = num(value, 0);
  return round4(n);
}

export function estimateElectricityBill({
  tariff,
  kwh,
  powerKw,
  powerKwP1,
  powerKwP2,
  days = 30,
  periods = {},
  useDiscountedPrices = true,
  includePower = true,
  taxRate = null,
  otherCharges = 0
} = {}) {
  if (!tariff) throw new Error('tariff es obligatorio.');

  const totalKwh = num(kwh, null);
  if (totalKwh === null || totalKwh < 0) throw new Error('kwh debe ser un número mayor o igual a 0.');

  const nDays = num(days, 30);
  if (!nDays || nDays <= 0) throw new Error('days debe ser mayor que 0.');

  const prices = useDiscountedPrices && tariff.discountedEnergyPrices && Object.keys(tariff.discountedEnergyPrices).length
    ? tariff.discountedEnergyPrices
    : tariff.energyPrices;

  const hasBase = num(prices?.base, null) !== null;
  const hasPeriods = ['punta', 'llano', 'valle'].some((key) => num(prices?.[key], null) !== null);

  let energyCost = 0;
  let energyBreakdown;

  if (hasBase) {
    const price = num(prices.base, null);
    energyCost = totalKwh * price;
    energyBreakdown = {
      mode: 'flat',
      kwh: totalKwh,
      pricePerKwh: price,
      cost: round4(energyCost),
      source: useDiscountedPrices && tariff.discountedEnergyPrices?.base != null ? 'discountedEnergyPrices.base' : 'energyPrices.base'
    };
  } else if (hasPeriods) {
    const puntaKwh = num(periods.punta, null);
    const llanoKwh = num(periods.llano, null);
    const valleKwh = num(periods.valle, null);

    if (puntaKwh === null || llanoKwh === null || valleKwh === null) {
      return {
        status: 'needs_period_breakdown',
        reason: 'La tarifa tiene precios por periodos y el Engine necesita el reparto del consumo entre punta, llano y valle para estimar el término de energía con precisión.',
        tariff: { id: tariff.id, company: tariff.company, name: tariff.name },
        required: ['periods.punta', 'periods.llano', 'periods.valle']
      };
    }

    const periodTotal = puntaKwh + llanoKwh + valleKwh;
    if (Math.abs(periodTotal - totalKwh) > Math.max(0.01, totalKwh * 0.005)) {
      throw new Error(`La suma de periodos (${periodTotal} kWh) no coincide con kwh (${totalKwh} kWh).`);
    }

    const costs = {
      punta: puntaKwh * num(prices.punta, 0),
      llano: llanoKwh * num(prices.llano, 0),
      valle: valleKwh * num(prices.valle, 0)
    };
    energyCost = Object.values(costs).reduce((a, b) => a + b, 0);
    energyBreakdown = {
      mode: 'time_of_use',
      kwh: { punta: puntaKwh, llano: llanoKwh, valle: valleKwh, total: periodTotal },
      prices: { punta: num(prices.punta), llano: num(prices.llano), valle: num(prices.valle) },
      costs: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, round4(v)])),
      cost: round4(energyCost),
      source: useDiscountedPrices && tariff.discountedEnergyPrices ? 'discountedEnergyPrices' : 'energyPrices'
    };
  } else {
    return {
      status: 'insufficient_tariff_data',
      reason: 'La tarifa no tiene un precio energético estructurado utilizable para esta estimación.',
      tariff: { id: tariff.id, company: tariff.company, name: tariff.name }
    };
  }

  const p1 = num(powerKwP1, num(powerKw, 0));
  const p2 = num(powerKwP2, num(powerKw, 0));
  const powerP1Price = num(tariff.powerPrices?.P1, null);
  const powerP2Price = num(tariff.powerPrices?.P2, null);

  let powerCostP1 = 0;
  let powerCostP2 = 0;
  const warnings = [];

  if (includePower) {
    if (powerP1Price !== null) powerCostP1 = p1 * powerP1Price * nDays;
    else warnings.push('No hay precio estructurado de potencia P1 para esta tarifa.');

    if (powerP2Price !== null) powerCostP2 = p2 * powerP2Price * nDays;
    else warnings.push('No hay precio estructurado de potencia P2 para esta tarifa.');
  }

  const powerCost = powerCostP1 + powerCostP2;
  const subtotal = energyCost + powerCost;

  const normalizedTaxRate = taxRate === null || taxRate === undefined || taxRate === '' ? null : num(taxRate, null);
  if (normalizedTaxRate !== null && (normalizedTaxRate < 0 || normalizedTaxRate > 100)) {
    throw new Error('taxRate debe estar entre 0 y 100.');
  }

  const extra = num(otherCharges, 0);
  const tax = normalizedTaxRate === null ? 0 : (subtotal + extra) * (normalizedTaxRate / 100);
  const total = subtotal + extra + tax;

  return {
    status: 'ok',
    tariff: {
      id: tariff.id,
      company: tariff.company,
      name: tariff.name,
      planCode: tariff.planCode,
      permanence: tariff.permanence,
      source: tariff.source,
      requiresVerification: tariff.requiresVerification
    },
    inputs: {
      kwh: totalKwh,
      days: nDays,
      powerKwP1: p1,
      powerKwP2: p2,
      useDiscountedPrices,
      includePower,
      taxRate: normalizedTaxRate,
      otherCharges: extra
    },
    energy: energyBreakdown,
    power: {
      priceP1PerKwDay: powerP1Price,
      priceP2PerKwDay: powerP2Price,
      costP1: round4(powerCostP1),
      costP2: round4(powerCostP2),
      total: round4(powerCost)
    },
    summary: {
      energy: cleanMoney(energyCost),
      power: cleanMoney(powerCost),
      otherCharges: cleanMoney(extra),
      tax: cleanMoney(tax),
      subtotal: cleanMoney(subtotal),
      total: cleanMoney(total)
    },
    currency: 'EUR',
    warnings,
    excluded: [
      'Impuestos no proporcionados (si taxRate es null)',
      'alquiler de equipos',
      'servicios de mantenimiento',
      'cargos regulados adicionales',
      'ajustes y otros conceptos de factura'
    ],
    disclaimer: 'Estimación orientativa basada en los datos estructurados disponibles. Verificar vigencia, impuestos y condiciones antes de contratar.'
  };
}

export function compareEstimatedBills(estimates = []) {
  return [...estimates]
    .filter((item) => item?.status === 'ok')
    .sort((a, b) => (a.summary?.total ?? a.subtotal) - (b.summary?.total ?? b.subtotal))
    .map((item, index) => ({ rank: index + 1, ...item }));
}
