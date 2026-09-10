import { Router } from 'express';
import { calculateController, compareController, catalogController, estimateController } from '../controllers/tariffController.js';

const router = Router();
router.get('/catalog', catalogController);
router.post('/calculate', calculateController);
router.post('/compare', compareController);
router.post('/estimate', estimateController);

export default router;
