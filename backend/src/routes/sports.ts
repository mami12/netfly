import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/sports', async (req, res) => {
  const sports = await prisma.sport.findMany({
    where: { isActive: true },
    include: { categories: { include: { tournaments: true } } }
  });
  res.json(sports);
});

router.get('/sports/tree', async (req, res) => {
  const sports = await prisma.sport.findMany({
    where: { isActive: true },
    include: { categories: { include: { tournaments: true } } }
  });
  res.json(sports);
});

router.get('/matches', async (req, res) => {
  const { tournamentId, sportId, categoryId, status } = req.query;
  const whereClause: any = {};

  if (tournamentId) {
    whereClause.tournamentId = parseInt(String(tournamentId));
  } else if (categoryId) {
    whereClause.tournament = { category: { id: parseInt(String(categoryId)) } };
  } else if (sportId) {
    whereClause.tournament = { category: { sportId: parseInt(String(sportId)) } };
  }
  if (status) {
    whereClause.status = String(status);
  } else {
    whereClause.status = { in: ['PREMATCH', 'LIVE'] };
  }

  const matches = await prisma.match.findMany({
    where: whereClause,
    include: {
      tournament: { include: { category: { include: { sport: true } } } },
      markets: {
        where: { marketType: '1X2' }, // lista: vetem tregu kryesor (pergjigje e lehte)
        include: { outcomes: true },
        orderBy: { sortOrder: 'asc' }
      },
      _count: { select: { markets: true } } // numri total per butonin "+N"
    },
    orderBy: [
      { isSimulated: 'asc' },
      { status: 'asc' }, // LIVE first
      { startTime: 'asc' }
    ]
  });
  res.json(matches);
});

router.get('/sports/:sportId/matches', async (req, res) => {
  const { status } = req.query;
  const matches = await prisma.match.findMany({
    where: {
      tournament: { category: { sportId: parseInt(req.params.sportId) } },
      ...(status ? { status: String(status) } : { status: { in: ['PREMATCH', 'LIVE'] } })
    },
    include: { markets: { include: { outcomes: true } } }
  });
  res.json(matches);
});

router.get('/matches/:id', async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: {
      markets: {
        include: { outcomes: { orderBy: { id: 'asc' } } },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  if (!match) return res.status(404).json({ error: 'Match not found' });

  // Deduplicate markets by normalized name, preference for market with more outcomes
  const seen = new Map<string, any>();
  const cleanMarkets: any[] = [];
  for (const m of match.markets) {
    if (!m.name || /early\s*payout/i.test(m.name)) continue;
    const norm = m.name.trim().toLowerCase();
    const existing = seen.get(norm);
    if (!existing) {
      seen.set(norm, m);
      cleanMarkets.push(m);
    } else if ((m.outcomes?.length || 0) > (existing.outcomes?.length || 0)) {
      const idx = cleanMarkets.indexOf(existing);
      if (idx !== -1) cleanMarkets[idx] = m;
      seen.set(norm, m);
    }
  }
  (match as any).markets = cleanMarkets;
  res.json(match);
});

router.get('/matches/:id/tracker', async (req, res) => {
  res.json({
    matchId: req.params.id,
    message: "Subscribe to websocket 'tracker:' channel for real-time updates."
  });
});

router.get('/booking/:code', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { bookingCode: req.params.code },
    include: { lines: true }
  });
  res.json(ticket);
});

router.get('/tickets/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query required' });

  const query = String(q).trim().toUpperCase();

  // Search by booking code (exact match) or ticket ID (partial match)
  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [
        { bookingCode: query },
        { id: { contains: query.toLowerCase() } }
      ]
    },
    include: { lines: true, user: { select: { username: true } } }
  });

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

export default router;
