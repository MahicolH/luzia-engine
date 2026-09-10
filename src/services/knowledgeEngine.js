import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cache = null;

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/€/g, ' euro ')
    .replace(/[^a-z0-9./\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value = '') {
  return [...new Set(normalize(value).split(/\s+/).filter((t) => t.length >= 3))];
}

async function loadKnowledge() {
  if (cache) return cache;
  const filePath = path.resolve(__dirname, '..', '..', env.knowledgePath);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.records)) throw new Error('La base de conocimiento no contiene records válidos.');
  cache = parsed;
  return cache;
}

function scoreRecord(record, queryTokens, normalizedQuery) {
  const haystack = normalize([
    record.company,
    record.section,
    record.text,
    record.sheet,
    ...(Object.values(record.columns ?? {}))
  ].join(' '));

  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += token.length >= 7 ? 3 : 2;
  }

  const company = normalize(record.company);
  if (normalizedQuery.includes(company)) score += 6;
  if (normalizedQuery.includes(normalize(record.section))) score += 3;
  if (!record.isHeader) score += 1;

  return score;
}

export async function searchKnowledge(query, options = {}) {
  const knowledge = await loadKnowledge();
  const limit = Math.min(Math.max(Number(options.limit ?? env.knowledgeTopK), 1), 20);
  const queryTokens = tokenize(query);
  const normalizedQuery = normalize(query);

  if (!queryTokens.length) return [];

  return knowledge.records
    .map((record) => ({ record, score: scoreRecord(record, queryTokens, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ record, score }) => ({
      id: record.id,
      company: record.company,
      section: record.section,
      source: `${record.sheet} fila ${record.row}`,
      text: record.text,
      requiresVerification: Boolean(record.requiresVerification),
      score
    }));
}

export async function getKnowledgeMeta() {
  const knowledge = await loadKnowledge();
  return {
    knowledgeVersion: knowledge.knowledgeVersion,
    source: knowledge.source,
    records: knowledge.records.length
  };
}

export function clearKnowledgeCache() {
  cache = null;
}
