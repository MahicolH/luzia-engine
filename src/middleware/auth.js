import { env } from '../config/env.js';

export function apiKeyAuth(req, res, next) {
  if (!env.engineApiKey) return next();
  const provided = req.get('x-engine-key');
  if (!provided || provided !== env.engineApiKey) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  return next();
}

export const requireEngineKey = apiKeyAuth;
