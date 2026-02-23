import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport';
import './config/auth';
import authRoutes from './routes/auth';
import analysisRoutes from './routes/analysis';
import paymentRoutes, { paymentService } from './routes/payment';
import feedbackRoutes from './routes/feedback';

dotenv.config();

const app: Application = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const ALLOWED_ORIGINS = [
  'https://medicalaitgbot.ru',
  'https://www.medicalaitgbot.ru',
  'http://localhost:3000',
];

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', analysisRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/feedback', feedbackRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler — must have 4 params for Express to recognize it
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server — bind to 127.0.0.1 so port 3001 is not publicly accessible
const server = app.listen(PORT, '127.0.0.1', () => {
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

