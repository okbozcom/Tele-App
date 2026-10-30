import express, { Application, Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { compressionMiddleware } from './middleware/compression.middleware';
import { sanitizeNoSql } from './middleware/sanitize.middleware';
import { AppError } from './utils/AppError';

const app: Application = express();

// Trust reverse proxy (Render, Cloudflare, Heroku) to correctly identify client IP
app.set('trust proxy', 1);

// Security and utility middlewares
app.use(compressionMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeNoSql);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Public static assets & pages (Landing page, Privacy Policy, Terms)
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Hi Talk Telecalling CRM API Server is Live & Running!',
    health: '/api/health',
    timestamp: new Date().toISOString(),
  });
});

app.get('/privacy', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'privacy.html'));
});

app.get('/terms', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'terms.html'));
});

app.get('/landing', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'landing.html'));
});

app.get('/about', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'landing.html'));
});

app.get(['/admin', '/admin/*'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin/index.html'));
});

// Apply API rate limiter to protect against abuse and DDOS
app.use('/api', apiLimiter);

// API Routes (supports both /api and /api/api to handle any duplicate prefixes gracefully)
app.use('/api/api', apiRoutes);
app.use('/api', apiRoutes);

// Catch-all for undefined routes
app.all('*', (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Global error handling middleware
app.use(errorHandler);

export default app;
