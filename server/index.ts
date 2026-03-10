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

  // Maintenance mode redirect (before Next.js handler)
  expressApp.use((req, res, nextMiddleware) => {
    if (!isMaintenanceActive()) return nextMiddleware();

    const url = req.url;

    // Allow through: API routes, maintenance page, static assets, _next
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

    // Detect locale from URL or default to 'en'
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

  // Graceful shutdown - use maintenance drain to let games finish
  const gracefulShutdown = (signal: string) => {
    console.log(`> ${signal} received. Starting maintenance drain...`);

    // If maintenance drain was already triggered via API, let it continue
    if (isMaintenanceActive()) {
      console.log('> Maintenance already active, waiting for drain to complete.');
      return;
    }

    // Start the drain (blocks new games, waits up to 5 min for active games)
    startMaintenanceDrain(io);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
});
