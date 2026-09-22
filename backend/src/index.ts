import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { PORT, CORS_ORIGINS } from './config';
import { prisma } from './db';
import { WSService } from './services/wsService';
import { LuckyBetFeed } from './feeds/LuckyBetFeed';
import { auth, requireAdmin } from './middleware/auth';

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import managerRoutes from './routes/manager';
import sportsRoutes, { clearMatchesCache, setSportsFeed } from './routes/sports';
import betsRoutes from './routes/bets';

const app = express();
const server = createServer(app);
const wsService = new WSService(server);

// CORS: "*" = te gjitha origjinat (frontend ne GitHub Pages / Render / lokal).
// Per kufizim: CORS_ORIGINS=https://mami12.github.io,https://netfly.onrender.com
const allowedOrigins: boolean | string[] =
  CORS_ORIGINS.trim() === '*'
    ? true
    : CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

// Feed-i i vetëm: futboll real nga LuckyBet (pa simulime)
const feed = new LuckyBetFeed();
setSportsFeed(feed);

// Çdo kërkesë HTTP nga përdoruesi zgjon dhe mban zgjuar feed-in
app.use((req, res, next) => {
  feed.touch();
  next();
});

// Kur lidhen/shkëputen përdorues në WebSocket, feed-i e di në kohë reale
wsService.onClientCountChange((count) => {
  feed.setActiveUsers(count);
});

app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(compression());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', auth, requireAdmin, adminRoutes);
app.use('/api/manager', auth, managerRoutes);
app.use('/api', sportsRoutes); // sports, matches, booking (publicly viewable)
app.use('/api/bets', betsRoutes);

feed.onOddsUpdate((delta) => {
  clearMatchesCache();
  wsService.broadcast('odds', delta);
});
feed.onMatchEvent((event) => {
  wsService.broadcast(`match:${event.matchId}`, event);
});
feed.onMatchStatusChange((matchId, status, minute, homeScore, awayScore, period) => {
  clearMatchesCache(matchId);
  wsService.broadcast('matches', { type: 'STATUS', matchId, status, minute, homeScore, awayScore, period });
  wsService.broadcast(`match:${matchId}`, { type: 'STATUS', matchId, status, minute, homeScore, awayScore, period });
});

feed.start();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Mbyllje e paster kur Render-i rinis/zhvendos instancen (SIGTERM) ose Ctrl+C lokalisht (SIGINT).
// Pa kete, lidhjet e Prisma-s dhe WSS-i mbeten te hapura dhe deploy-i i ri vonohet.
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Netfly] ${signal}: duke u mbyllur...`);
  try { feed.stop(); } catch { /* ignore */ }
  try { wsService.close(); } catch { /* ignore */ }
  server.close(() => {
    prisma.$disconnect().catch(() => {}).finally(() => process.exit(0));
  });
  // Rruge rezerve: mos lejo procesin te varet pergjithmone
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

