import { env } from '../config/env.js';
import { Agent } from 'undici';

const SYSTEM_PROMPT = `
Eres LuzIA Engine, el motor de inteligencia especializado que alimenta a LuzIA.
Tu dominio principal es la energía eléctrica y los contratos energéticos.
Responde siempre en español, con claridad, precisión y profesionalismo.

Reglas fundamentales:
1. No inventes precios, tarifas, contratos, condiciones, descuentos ni normativa.
2. Cuando la información disponible no sea suficiente, indícalo claramente.
3. Distingue entre datos proporcionados, cálculos realizados y estimaciones.
4. Respeta la fecha de vigencia de cualquier dato recibido.
5. Cuando existan datos estructurados sobre tarifas o contratos, úsalos como fuente prioritaria.
6. No afirmes que consultaste una fuente externa si no lo hiciste.
7. Para cálculos y comparaciones, usa el resultado calculado por el Engine como autoridad numérica.
8. En una comparación, respeta exactamente los nombres, IDs, puestos y valores de toolContext.comparison.
   No dupliques tarifas ni inventes filas.
   El campo toolContext.comparison.best es la autoridad para identificar la mejor opción.
   savingVsBest/savingLabel son la autoridad para las diferencias.
9. Cuando exista toolContext.recommendation, trátalo como resultado autoritativo del Profile & Recommendation Engine:
   respeta best, fitScore, estimatedTotal, reasons y penalties.
   Explica que fitScore es un indicador interno y no una garantía de ahorro.
10. Si una tarifa requiere datos que no están disponibles, dilo y no inventes el dato.
    No conviertas tarifas excluidas en tarifas comparables.
11. Si la pregunta no pertenece al dominio energético, responde brevemente y señala que tu especialidad es energía.
`.trim();

function buildContext(userContext = {}, knowledgeContext = [], toolContext = null) {
  return JSON.stringify(
    { userContext, knowledgeContext, toolContext },
    null,
    2
  );
}

const dispatcher = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 10_000
});

async function requestJson(url, options, timeoutMs = 0) {
  const controller = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch(url, {
      ...options,
      signal: timeoutMs > 0 ? controller.signal : undefined,
      dispatcher
    });

    const text = await response.text();

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      throw new Error(
        body?.error?.message ||
        body?.error ||
        body?.message ||
        body?.raw ||
        `Proveedor respondió HTTP ${response.status}`
      );
    }

    return body;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildMessages({ message, userContext, knowledgeContext, toolContext }) {
  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'user',
      content:
        `Consulta del usuario:\n${message}\n\n` +
        `Contexto estructurado disponible:\n` +
        buildContext(userContext, knowledgeContext, toolContext)
    }
  ];
}

async function generateWithOllama({
  message,
  userContext,
  knowledgeContext,
  toolContext
}) {
  const payload = {
    model: env.aiModel,
    stream: false,
    think: false,
    options: {
      temperature: env.aiTemperature,
      num_predict: 512
    },
    messages: buildMessages({
      message,
      userContext,
      knowledgeContext,
      toolContext
    })
  };

  const body = await requestJson(
    `${env.aiBaseUrl}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    },
    env.aiTimeoutMs
  );

  const answer = body?.message?.content;

  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('Ollama no devolvió una respuesta válida.');
  }

  return {
    answer: answer.trim(),
    provider: 'ollama',
    model: body?.model ?? env.aiModel
  };
}

async function generateWithOpenRouter({
  message,
  userContext,
  knowledgeContext,
  toolContext
}) {
  if (!env.openRouterApiKey) {
    throw new Error(
      'OPENROUTER_API_KEY no está configurada en el entorno.'
    );
  }

  const payload = {
    model: env.aiModel,
    messages: buildMessages({
      message,
      userContext,
      knowledgeContext,
      toolContext
    }),
    temperature: env.aiTemperature,
    max_tokens: 512,
    stream: false
  };

  const body = await requestJson(
    `${env.aiBaseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openRouterApiKey}`
      },
      body: JSON.stringify(payload)
    },
    env.aiTimeoutMs
  );

  const answer = body?.choices?.[0]?.message?.content;

  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('OpenRouter no devolvió una respuesta válida.');
  }

  return {
    answer: answer.trim(),
    provider: 'openrouter',
    model: body?.model ?? env.aiModel
  };
}

export async function generateAnswer(params) {
  switch (env.aiProvider) {
    case 'ollama':
      return generateWithOllama(params);

    case 'openrouter':
      return generateWithOpenRouter(params);

    default:
      throw new Error(
        `AI_PROVIDER no soportado: ${env.aiProvider}.`
      );
  }
}
