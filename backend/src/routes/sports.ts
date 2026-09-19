import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

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

// Universal Shared Memory Cache
// Kur 100 lojtarë janë online, ata marrin të njëjtin rezultat nga RAM-i në 1ms
// pa bërë 100 pyetje në bazën e të dhënave ose në API
interface CacheEntry {
  data: any;
  ts: number;
}
const matchesCache = new Map<string, CacheEntry>();
const matchDetailCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3000; // 3 sekonda
const DETAIL_TTL_MS = 2500; // 2.5 sekonda

export function clearMatchesCache(matchId?: string) {
  matchesCache.clear();
  if (matchId) {
    matchDetailCache.delete(matchId);
  } else {
    matchDetailCache.clear();
  }
}

const cleanTeamName = (s: string) =>
  String(s || '').toLowerCase().replace(/[\s\.\-_]/g, '').replace(/fc|sc|cf|ac|as|fk/g, '');

router.get('/matches', async (req, res) => {
  const { tournamentId, sportId, categoryId, status } = req.query;
  const cacheKey = JSON.stringify({ tournamentId, sportId, categoryId, status });
  const cached = matchesCache.get(cacheKey);
  const now = Date.now();

  // Nëse ka të dhëna të freskëta në RAM (< 3s), ktheji direkt për të gjithë lojtarët
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

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

  const rawMatches = await prisma.match.findMany({
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

  const validMatches: typeof rawMatches = [];

  for (const m of rawMatches) {
    const h = (m.homeTeam || '').toLowerCase();
    const a = (m.awayTeam || '').toLowerCase();
    // Filtro outrights (bastet e fituesit te kampionatit qe feed-i i nxjerr gabimisht si ndeshje)
    if (h.includes('outright') || a.includes('outright') || h.includes('winner') || a.includes('winner')) {
      continue;
    }

    // Ndeshjet LIVE: llogarit minutën reale dhe mbyll ato që kanë kaluar > 130 minuta
    if (m.status === 'LIVE' && m.startTime) {
      const elapsed = Math.floor((now - new Date(m.startTime).getTime()) / 60000);
      if (elapsed > 130) {
        // Ndeshja ka perfunduar ne realitet
        prisma.match.update({ where: { id: m.id }, data: { status: 'ENDED', currentMinute: 90 } }).catch(() => {});
        continue;
      }
      if (elapsed >= 1) {
        m.currentMinute = Math.min(120, Math.max(m.currentMinute || 0, elapsed));
      }
    }

    validMatches.push(m);
  }

  // Deduplikimi i ndeshjeve (kur feed-i dergon te njejten ndeshje dy here me kuota te ndryshme)
  const matchMap = new Map<string, typeof rawMatches[0]>();
  for (const m of validMatches) {
    const key = `${cleanTeamName(m.homeTeam)}:::${cleanTeamName(m.awayTeam)}`;
    const existing = matchMap.get(key);
    if (!existing) {
      matchMap.set(key, m);
    } else {
      // Nese njera eshte LIVE dhe tjetra PREMATCH -> zgjidh LIVE
      if (existing.status !== 'LIVE' && m.status === 'LIVE') {
        matchMap.set(key, m);
      } else if (existing.status === m.status) {
        // Nese kane te njejtin status -> zgjidh ate me me shume tregje/kuota
        if ((m._count?.markets || 0) > (existing._count?.markets || 0)) {
          matchMap.set(key, m);
        }
      }
    }
  }

  const result = Array.from(matchMap.values());
  matchesCache.set(cacheKey, { data: result, ts: now });
  res.json(result);
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
  const matchId = req.params.id;
  const cached = matchDetailCache.get(matchId);
  const now = Date.now();
  if (cached && now - cached.ts < DETAIL_TTL_MS) {
    return res.json(cached.data);
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      markets: {
        include: { outcomes: { orderBy: { id: 'asc' } } },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  if (!match) return res.status(404).json({ error: 'Match not found' });

  // Ndeshjet LIVE: llogaritje dinamike e minutës nga ora e fillimit
  if (match.status === 'LIVE' && match.startTime) {
    const elapsed = Math.floor((Date.now() - new Date(match.startTime).getTime()) / 60000);
    if (elapsed > 130) {
      match.status = 'ENDED';
      prisma.match.update({ where: { id: match.id }, data: { status: 'ENDED', currentMinute: 90 } }).catch(() => {});
    } else if (elapsed >= 1) {
      match.currentMinute = Math.min(120, Math.max(match.currentMinute || 0, elapsed));
    }
  }

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
  matchDetailCache.set(matchId, { data: match, ts: Date.now() });
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
