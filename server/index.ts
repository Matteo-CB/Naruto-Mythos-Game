import express from 'express';
import { createServer } from 'http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketHandlers } from '@/lib/socket/server';
import { setIO } from '@/lib/socket/io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Get the allowed origin for CORS
const getAllowedOrigin = () => {
  if (dev) {
    return 'http://localhost:3000';
  }
  // In production, prefer RAILWAY_PUBLIC_DOMAIN (the actual deployed URL)
  // NEXTAUTH_URL may be set to localhost in .env and shouldn't be used for CORS
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }
  // Fallback: allow all origins (safe since we're behind Railway's proxy)
  return '*';
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  const allowedOrigin = getAllowedOrigin();
  console.log(`> Socket.io CORS allowed origin: ${allowedOrigin}`);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  setIO(io);
  setupSocketHandlers(io);

  // Health check endpoint for Railway
  expressApp.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  expressApp.all(/.*/, (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown - warn clients before going down
  const gracefulShutdown = async (signal: string) => {
    console.log(`> ${signal} received. Starting graceful shutdown...`);

    // 1. Warn all connected clients
    try {
      io.emit('server:maintenance', { timestamp: Date.now() });
      console.log('> Maintenance warning sent to all connected clients');
    } catch (err) {
      console.error('> Failed to emit maintenance warning:', err);
    }

    // 2. Wait so clients receive the message
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Disconnect all sockets
    try {
      io.disconnectSockets(true);
      console.log('> All sockets disconnected');
    } catch (err) {
      console.error('> Error disconnecting sockets:', err);
    }

    // 4. Close HTTP server
    httpServer.close(() => {
      console.log('> HTTP server closed');
      process.exit(0);
    });

    // 5. Force exit after 10s if close hangs
    setTimeout(() => {
      console.error('> Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
});
