import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cache = null;

async function loadCatalog() {
  if (cache) return cache;
  const filePath = path.resolve(__dirname, '..', '..', env.structuredTariffPath);
  const raw = await fs.readFile(filePath, 'utf8');
  cache = JSON.parse(raw);
  return cache;
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getFlatEnergyPrice(tariff) {
  const p = tariff.discountedEnergyPrices?.base ?? tariff.energyPrices?.base ?? null;
  return Number.isFinite(p) ? p : null;
}

function getPowerPrice(tariff, period) {
  const value = tariff.powerPrices?.[period];
  return Number.isFinite(value) ? value : null;
}

function catalogScore(tariff, query = '', company = '') {
  const q = normalize([query, company].filter(Boolean).join(' '));
  const haystack = normalize([
    tariff.company,
    tariff.name,
    tariff.planCode,
    tariff.segment,
    tariff.region,
    tariff.notes
  ].join(' '));

  let score = 0;
  if (company && normalize(tariff.company) === normalize(company)) score += 10;
  for (const token of q.split(/\s+/).filter(t => t.length >= 3)) {
    if (haystack.includes(token)) score += token.length >= 7 ? 3 : 2;
  }
  return score;
}

export async function getStructuredMeta() {
  const catalog = await loadCatalog();
  return {
    version: catalog.knowledgeVersion,
    source: catalog.source,
    electricityTariffs: catalog.electricityTariffs.length,
    gasTariffs: catalog.gasTariffs.length,
    solarTariffs: catalog.solarTariffs.length,
    maintenance: catalog.maintenance.length
  };
}

export async function searchStructuredTariffs({ query = '', company, type = 'electricity', limit = 10 } = {}) {
  const catalog = await loadCatalog();
  let rows = type === 'gas' ? catalog.gasTariffs : catalog.electricityTariffs;
  if (type === 'solar') rows = catalog.solarTariffs;

  return rows
    .map(tariff => ({ tariff, score: catalogScore(tariff, query, company) }))
    .filter(({ score }) => score > 0 || (!query && !company))
    .sort((a, b) => b.score - a.score || (getFlatEnergyPrice(a.tariff) ?? Number.POSITIVE_INFINITY) - (getFlatEnergyPrice(b.tariff) ?? Number.POSITIVE_INFINITY))
    .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 50))
    .map(({ tariff, score }) => ({
      ...tariff,
      flatEnergyPrice: getFlatEnergyPrice(tariff),
      powerP1Price: getPowerPrice(tariff, 'P1'),
      powerP2Price: getPowerPrice(tariff, 'P2'),
      score
    }));
}

export function summarizeTariff(tariff) {
  return {
    id: tariff.id,
    company: tariff.company,
    name: tariff.name,
    planCode: tariff.planCode,
    flatEnergyPrice: getFlatEnergyPrice(tariff),
    energyPrices: tariff.discountedEnergyPrices && Object.keys(tariff.discountedEnergyPrices).length
      ? tariff.discountedEnergyPrices
      : tariff.energyPrices,
    powerPrices: tariff.powerPrices,
    powerPriceUnit: tariff.powerPriceUnit,
    permanence: tariff.permanence,
    segment: tariff.segment,
    maxPowerKw: tariff.maxPowerKw,
    region: tariff.region,
    discounts: tariff.discounts,
    requiresVerification: tariff.requiresVerification,
    source: tariff.source
  };
}
