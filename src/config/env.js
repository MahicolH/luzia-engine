import 'dotenv/config';

const port = Number(process.env.PORT ?? 3000);
const temperature = Number(process.env.AI_TEMPERATURE ?? 0.2);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error('AI_TEMPERATURE inválida.');

const clean = (value, fallback = undefined) => {
  const v = value?.trim();
  return v || fallback;
};

export const env = Object.freeze({
  nodeEnv: clean(process.env.NODE_ENV, 'development'),
  port,
  aiProvider: clean(process.env.AI_PROVIDER, 'ollama').toLowerCase(),
  aiBaseUrl: clean(process.env.AI_BASE_URL, 'http://localhost:11434').replace(/\/$/, ''),
  aiModel: clean(process.env.AI_MODEL, 'qwen3:8b'),
  aiTemperature: temperature,
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 0),
  knowledgePath: clean(process.env.KNOWLEDGE_PATH, 'knowledge/energy-knowledge.json'),
  structuredTariffPath: clean(process.env.STRUCTURED_TARIFF_PATH, 'knowledge/tariffs-structured.json'),
  knowledgeTopK: Number(process.env.KNOWLEDGE_TOP_K ?? 6),
  tariffDefaultDays: Number(process.env.TARIFF_DEFAULT_DAYS ?? 30),
  engineApiKey: clean(process.env.ENGINE_API_KEY)
});
