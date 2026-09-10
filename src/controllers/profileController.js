import { recommendTariffs } from '../services/profileEngine.js';

export async function recommendController(req, res, next) {
  try {
    const body = req.body ?? {};
    const result = await recommendTariffs(body, {
      limit: body.limit ?? 5,
      query: body.query ?? 'tarifas electricidad'
    });
    return res.json({
      success: true,
      engine: 'LuzIA Engine',
      version: '1.0.0',
      profileUsed: true,
      recommendationUsed: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}
