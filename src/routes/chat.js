import { Router } from 'express';
import { chatController } from '../controllers/chatController.js';
import { apiKeyAuth } from '../middleware/auth.js';

const router = Router();
router.post('/', apiKeyAuth, chatController);

export default router;
