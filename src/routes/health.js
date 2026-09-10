import { Router } from 'express';
const router = Router();
router.get('/', (req, res) => res.json({ success: true, engine: 'LuzIA Engine', version: '0.9.2', status: 'online', timestamp: new Date().toISOString() }));
export default router;
