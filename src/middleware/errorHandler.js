export function errorHandler(error, req, res, next) {
  console.error('[LuzIA Engine]', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ success: false, error: 'Error interno del LuzIA Engine.', detail: process.env.NODE_ENV === 'development' ? error.message : undefined });
}
