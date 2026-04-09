import path from 'path';
import express from 'express';
import uploadRouter from './modules/upload/upload';

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/upload', uploadRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

export default app;
