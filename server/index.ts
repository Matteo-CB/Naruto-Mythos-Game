import express from 'express';
import { createServer } from 'http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketHandlers, startMaintenanceDrain } from '@/lib/socket/server';
import { setIO } from '@/lib/socket/io';
import { isMaintenanceActive } from '@/lib/socket/maintenance';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);


const getAllowedOrigin = () => {
  if (dev) {
    return 'http://localhost:3000';
  }
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }
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
    pingTimeout: 60_000,
    pingInterval: 25_000,
    connectTimeout: 45_000,
    maxHttpBufferSize: 5_000_000,
  });

  setIO(io);
  setupSocketHandlers(io);

  
  expressApp.get('/api/health', (req, res) => {
    if (isMaintenanceActive()) {
      res.status(503).json({ status: 'maintenance', timestamp: new Date().toISOString() });
      return;
    }
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  
  expressApp.use((req, res, nextMiddleware) => {
    if (!isMaintenanceActive()) return nextMiddleware();

    const url = req.url;

    
    if (
      url.startsWith('/api/') ||
      url.includes('/maintenance') ||
      url.startsWith('/_next/') ||
      url.startsWith('/images/') ||
      url.startsWith('/fonts/') ||
      /\.(ico|png|jpg|webp|svg|css|js|woff2?)(\?|$)/.test(url)
    ) {
      return nextMiddleware();
    }

    
    const localeMatch = url.match(/^\/(en|fr)(\/|$)/);
    const locale = localeMatch ? localeMatch[1] : 'en';

    res.redirect(302, `/${locale}/maintenance`);
  });

  expressApp.all(/.*/, (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  
  const gracefulShutdown = (signal: string) => {
    console.log(`> ${signal} received. Starting maintenance drain...`);

    
    if (isMaintenanceActive()) {
      console.log('> Maintenance already active, waiting for drain to complete.');
      return;
    }

    
    startMaintenanceDrain(io);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
});
