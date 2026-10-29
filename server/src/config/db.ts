import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoURI) {
    console.warn('[Database] Warning: MONGO_URI is not defined in environment variables.');
    return;
  }

  // Register persistent event listeners to prevent unhandled EventEmitter crashes
  mongoose.connection.on('error', (err) => {
    console.error('[Database] MongoDB connection error trapped:', err.message || err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database] MongoDB disconnected. Mongoose will automatically reconnect.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[Database] MongoDB reconnected successfully.');
  });

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 25, // Prevent connection explosion on Hostinger VPS RAM
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(
      '[Database] MongoDB Initial Connection Error: Could not connect to MongoDB.',
      error instanceof Error ? error.message : error,
    );
    console.warn('[Database] Continuing server execution. Set a valid MONGO_URI in .env to use database features.');
  }
};
