import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import chatRouter from './routes/chat.js';
import healthRouter from './routes/health.js';
import knowledgeRouter from './routes/knowledge.js';
import { errorHandler } from './middleware/errorHandler.js';
import tariffsRouter from './routes/tariffs.js';
import profileRouter from './routes/profile.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    engine: 'LuzIA Engine',
    version: '1.0.0',
    message: 'Motor de IA especializado en energía activo.'
  });
});

app.use('/health', healthRouter);
app.use('/chat', chatRouter);
app.use('/knowledge', knowledgeRouter);
app.use('/tariffs', tariffsRouter);
app.use('/profile', profileRouter);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`LuzIA Engine escuchando en http://localhost:${env.port}`);
  console.log(`Proveedor IA: ${env.aiProvider}`);
  console.log(`Modelo IA: ${env.aiModel}`);
});
