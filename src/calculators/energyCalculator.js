function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function calculateEnergyCost({ kwh, energyPrice, powerKw = 0, powerPricePerKwDay = 0, days = 30 }) {
  return calculateTariffEstimate({ kwh, energyPrice, powerKw, days, powerPriceP1PerKwDay: powerPricePerKwDay, powerPriceP2PerKwDay: 0 });
}

export function calculateTariffEstimate({
  kwh,
  energyPrice,
  powerKw = 0,
  powerKwP1 = null,
  powerKwP2 = null,
  powerPriceP1PerKwDay = 0,
  powerPriceP2PerKwDay = 0,
  days = 30
}) {
  const usage = toNumber(kwh);
  const ePrice = toNumber(energyPrice);
  const sharedPower = toNumber(powerKw) ?? 0;
  const p1Kw = powerKwP1 == null ? sharedPower : (toNumber(powerKwP1) ?? 0);
  const p2Kw = powerKwP2 == null ? sharedPower : (toNumber(powerKwP2) ?? 0);
  const p1Price = toNumber(powerPriceP1PerKwDay) ?? 0;
  const p2Price = toNumber(powerPriceP2PerKwDay) ?? 0;
  const nDays = toNumber(days) ?? 30;

  if (usage === null || usage < 0) throw new Error('kwh debe ser un número mayor o igual a 0.');
  if (ePrice === null || ePrice < 0) throw new Error('energyPrice debe ser un número mayor o igual a 0.');
  if (p1Kw < 0 || p2Kw < 0 || p1Price < 0 || p2Price < 0 || nDays <= 0) throw new Error('Los parámetros de potencia/días no son válidos.');

  const energyCost = usage * ePrice;
  const powerCostP1 = p1Kw * p1Price * nDays;
  const powerCostP2 = p2Kw * p2Price * nDays;
  const powerCost = powerCostP1 + powerCostP2;

  return {
    kwh: usage,
    energyPrice: ePrice,
    powerKwP1: p1Kw,
    powerKwP2: p2Kw,
    powerPriceP1PerKwDay: p1Price,
    powerPriceP2PerKwDay: p2Price,
    days: nDays,
    energyCost: Number(energyCost.toFixed(4)),
    powerCostP1: Number(powerCostP1.toFixed(4)),
    powerCostP2: Number(powerCostP2.toFixed(4)),
    powerCost: Number(powerCost.toFixed(4)),
    subtotal: Number((energyCost + powerCost).toFixed(4)),
    currency: 'EUR',
    note: 'Estimación del término de energía + términos de potencia P1/P2. No incluye impuestos, alquileres, servicios u otros conceptos.'
  };
}

export function extractPrice(text = '') {
  const matches = [...String(text).matchAll(/(\d+[\.,]\d+)\s*€\s*\/\s*kWh/gi)];
  const values = matches.map((m) => Number(m[1].replace(',', '.'))).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}
