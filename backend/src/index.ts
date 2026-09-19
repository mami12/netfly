import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { PORT } from './config';
import { WSService } from './services/wsService';
import { LuckyBetFeed } from './feeds/LuckyBetFeed';
import { auth, requireAdmin } from './middleware/auth';

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import managerRoutes from './routes/manager';
import sportsRoutes from './routes/sports';
import betsRoutes from './routes/bets';

const app = express();
const server = createServer(app);
const wsService = new WSService(server);

app.use(cors());
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

// Feed-i i vetëm: futboll real nga LuckyBet (pa simulime)
const feed = new LuckyBetFeed();

feed.onOddsUpdate((delta) => {
  wsService.broadcast('odds', delta);
});
feed.onMatchEvent((event) => {
  wsService.broadcast(`match:${event.matchId}`, event);
});
feed.onMatchStatusChange((matchId, status, minute, homeScore, awayScore) => {
  wsService.broadcast('matches', { type: 'STATUS', matchId, status, minute, homeScore, awayScore });
  wsService.broadcast(`match:${matchId}`, { type: 'STATUS', matchId, status, minute, homeScore, awayScore });
});

feed.start();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
