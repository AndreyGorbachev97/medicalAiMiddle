import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';
import './config/auth';
import authRoutes from './routes/auth';
import analysisRoutes from './routes/analysis';
import paymentRoutes, { paymentService } from './routes/payment';
import feedbackRoutes from './routes/feedback';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', analysisRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/feedback', feedbackRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Восстанавливаем polling для незавершённых платежей
  paymentService.recoverPendingPayments().catch((err) => {
    console.error('Failed to recover pending payments:', err);
  });
});

// Увеличиваем таймаут для обработки больших файлов (5 минут)
server.timeout = 300000; // 5 минут
server.keepAliveTimeout = 305000; // Чуть больше чем timeout

export default app;

