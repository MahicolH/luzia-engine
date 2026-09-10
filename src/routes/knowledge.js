import { Router } from 'express';
import { knowledgeMetaController, knowledgeSearchController } from '../controllers/knowledgeController.js';
import { requireEngineKey } from '../middleware/auth.js';

const router = Router();
router.get('/search', requireEngineKey, knowledgeSearchController);
router.get('/meta', requireEngineKey, knowledgeMetaController);

export default router;
