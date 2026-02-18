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
  // In production, use NEXTAUTH_URL or default to the Railway URL
  return process.env.NEXTAUTH_URL || process.env.RAILWAY_PUBLIC_DOMAIN || '*';
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

  expressApp.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${process.env.NODE_ENV || 'development'}`);
  });
});
