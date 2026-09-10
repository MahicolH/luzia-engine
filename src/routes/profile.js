import { Router } from 'express';
import { recommendController } from '../controllers/profileController.js';

const router = Router();
router.post('/recommend', recommendController);

export default router;
