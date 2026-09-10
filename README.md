# LuzIA Engine v1.0.0

Motor de IA especializado en energía eléctrica y contratos energéticos para LuzIA.

## v1.0.0 — Perfil energético y recomendaciones
- Perfil energético sin estado persistente para hogar, pyme/autónomo o empresa.
- Consumo mensual, potencia, días y preferencias.
- Preferencia de no permanencia.
- Preferencia de orientación renovable.
- Patrón de consumo, incluido consumo nocturno.
- `POST /profile/recommend` para obtener recomendaciones.
- `/chat` detecta preguntas de recomendación y usa el Profile & Recommendation Engine.
- El resultado del motor se entrega a Qwen3 como autoridad.
- `fitScore` es un indicador interno de adecuación y no una garantía de ahorro.

## v0.9.2
- Filtrado eléctrico estricto y deduplicación.
- Comparación por coste estimado.
- Resultado numérico autoritativo para Qwen3.

## v0.9
- Comparador de tarifas.
- Comparación por coste mensual estimado.
- Filtro opcional de tarifas sin permanencia.
- Ollama + Qwen3 con `think: false` y sin timeout externo por defecto.

## Instalación

```powershell
npm install
```

`.env`:

```env
PORT=3000
NODE_ENV=development
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=qwen3:8b
AI_TEMPERATURE=0.2
AI_TIMEOUT_MS=0
KNOWLEDGE_PATH=knowledge/energy-knowledge.json
STRUCTURED_TARIFF_PATH=knowledge/tariffs-structured.json
KNOWLEDGE_TOP_K=6
TARIFF_DEFAULT_DAYS=30
ENGINE_API_KEY=
```

```powershell
npm start
```

Endpoints principales: `GET /health`, `GET /knowledge/meta`, `GET /knowledge/search`, `GET /tariffs/catalog`, `POST /tariffs/estimate`, `POST /tariffs/compare`, `POST /profile/recommend`, `POST /chat`.

La información de tarifas depende del catálogo estructurado de `PRECIOS AGOSTO`; verificar vigencia, impuestos y condiciones antes de contratar.
