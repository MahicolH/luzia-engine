import { getKnowledgeMeta, searchKnowledge } from '../services/knowledgeEngine.js';

export async function knowledgeSearchController(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).json({ success: false, error: 'El parámetro "q" es obligatorio.' });
    const results = await searchKnowledge(q, { limit: req.query.limit });
    return res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

export async function knowledgeMetaController(req, res, next) {
  try {
    return res.json({ success: true, data: await getKnowledgeMeta() });
  } catch (error) {
    next(error);
  }
}
