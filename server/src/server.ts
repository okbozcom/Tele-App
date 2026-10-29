import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { connectDB } from './config/db';
import { schedulerService } from './services/scheduler.service';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Global process-level safety guards to prevent unhandled errors from terminating Node.js
process.on('uncaughtException', (err: Error) => {
  console.error('[Process] Uncaught Exception trapped (server kept alive):', err.message, err.stack);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Process] Unhandled Promise Rejection trapped (server kept alive):', reason);
});

const startServer = async (): Promise<void> => {
  // Connect to MongoDB first
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`[Server] Tele App Server listening on port ${PORT}`);
    console.log(`[Server] Health check endpoint: http://localhost:${PORT}/api/health`);

    // Notify PM2 that server is fully ready to receive traffic (required for wait_ready in cluster/fork)
    if (process.send) {
      process.send('ready');
      console.log('[Server] PM2 ready signal sent successfully.');
    }
  });

  // Start background schedulers (follow-up checks, inactive agent reassignments)
  schedulerService.start();

  const shutdown = (): void => {
    console.log('[Server] Gracefully shutting down...');
    schedulerService.stop();
    server.close(() => {
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer().catch((error) => {
  console.error('[Server] Failed to start server:', error);
  process.exit(1);
});
