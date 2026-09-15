import { IFeedProvider, MatchEvent, OddsDelta, PitchState } from './IFeedProvider';
import { PrismaClient } from '@prisma/client';
import WebSocket from 'ws';
import { BetSettler } from '../services/betSettler';

const prisma = new PrismaClient();
const PARTNER = process.env.LUCKYBET_PARTNER_ID || 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f';
const HOST = process.env.LUCKYBET_API_HOST || 'api-gateway.gw-lucky-bet.com';
const LANG = process.env.LUCKYBET_LANGUAGE || 'en-001';
const BASE = `https://${HOST}`;
const HTTP_HEADERS = {
  Accept: 'application/json',
  Origin: 'https://bitgames6205.com',
  Referer: 'https://bitgames6205.com/'
};

type Dict = any;

// Kategorite virtuale/simulimore te feed-it (cyberfifa, replays, esports...) - PA SIMULIME
const VIRTUAL_HINTS = ['cyber', 'replay', 'esport', 'fifa', 'nba2k', 'e-soccer', 'e-football', 'virtual', 'simulated', 'shorts', 'battles'];
const isVirtualSlug = (s: string) => VIRTUAL_HINTS.some(v => (s || '').toLowerCase().includes(v));

const STATS_HINTS = ['corner', 'card', 'shot', 'offside'];
/** Emri i grupit nga feed-i -> marketType i brendshem (per gjykim + shfaqje). */
function marketTypeOf(name: string): string {
  const n = (name || '').toLowerCase();
  if (STATS_HINTS.some(h => n.includes(h))) {
    if (n.includes('handicap')) return 'STATS_HANDICAP';
    if (n.includes('total') || n.includes('over') || n.includes('under')) return 'STATS_TOTAL';
    return 'STATS_OTHER';
  }
  if (n.includes('player')) return 'PLAYER_PROP';
  if (n.includes('1st half') || n.includes('2nd half') || n.includes('halftime')) {
    if (n.includes('double chance')) return 'HALF_DOUBLE_CHANCE';
    if (n.includes('both teams')) return 'HALF_BTTS';
    if (n.includes('total')) return 'HALF_TOTAL';
    if (n.includes('result')) return 'HALF_RESULT';
    return 'HALF_OTHER';
  }
  if (n.includes('both teams')) return n.includes('total') || n.includes('over') || n.includes('under') ? 'BTTS_TOTAL' : 'BOTH_TEAMS_SCORE';
  if (n.includes('double chance')) return 'DOUBLE_CHANCE';
  if (n.includes('correct score')) return 'CORRECT_SCORE';
  if (n.includes('exact number of goals')) return 'EXACT_GOALS';
  if (n.includes('odd/even') || n.includes('even/odd')) return 'ODD_EVEN';
  if (n.includes('handicap')) return 'HANDICAP';
  if (n.includes('total')) {
    if (n.startsWith('total') || n.startsWith('over') || n.startsWith('under')) return 'OVER_UNDER';
    return 'TEAM_TOTAL';
  }
  if (n.includes('result')) return '1X2';
  return 'OTHER';
}

async function api(path: string, body?: Dict): Promise<Dict> {
  const fullUrl = `${BASE}${path}${path.includes('?') ? '&' : '?'}l=${LANG}&p=${PARTNER}`;
  const res = await fetch(fullUrl, {
    method: body ? 'POST' : 'GET',
    headers: { ...HTTP_HEADERS, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`LuckyBet ${body ? 'POST' : 'GET'} ${path} -> HTTP ${res.status}`);
  return res.json();
}


export class LuckyBetFeed implements IFeedProvider {
  private syncTimer: NodeJS.Timeout | null = null;
  private subTimer: NodeJS.Timeout | null = null;
  private ws: WebSocket | null = null;
  private running = false;
  private cleaned = false;
  private syncInFlight: Promise<void> | null = null;

  private liveIds: number[] = [];
  private catNames = new Map<number, string>();
  private catSlugs = new Map<number, string>();

  private oddsCbs: ((delta: OddsDelta) => void)[] = [];
  private statusCbs: ((matchId: string, status: string, minute: number, homeScore: number, awayScore: number) => void)[] = [];
  private matchEventCbs: ((event: MatchEvent) => void)[] = [];

  start() {
    this.running = true;
    console.log('[LuckyBetFeed] Duke nisur feed-in real te futbollit (LuckyBet / gw-lucky-bet)...');
    if (!this.cleaned) {
      this.cleaned = true;
      this.cleanupSimulated().then(() => this.cleanupEndedOld()).catch((e) => console.error('[LuckyBetFeed] cleanup:', e));
    }
    this.sync().catch((e) => console.error('[LuckyBetFeed] sync fillestar deshtoi:', e));
    this.syncTimer = setInterval(() => this.sync().catch((e) => console.error('[LuckyBetFeed] sync:', e)), 60 * 1000);
    this.connectWs();
  }

  stop() {
    this.running = false;
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
    if (this.subTimer) { clearInterval(this.subTimer); this.subTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
    console.log('[LuckyBetFeed] U ndal.');
  }

  onMatchEvent(cb: (event: MatchEvent) => void) { this.matchEventCbs.push(cb); }
  onPitchUpdate(cb: (state: PitchState) => void) { void cb; } // nuk ka tracker ne feed-in real
  onOddsUpdate(cb: (delta: OddsDelta) => void) { this.oddsCbs.push(cb); }
  onMatchStatusChange(cb: (matchId: string, status: string, minute: number, homeScore: number, awayScore: number) => void) { this.statusCbs.push(cb); }

  /** Fshin ndeshjet/tregjet simulimore te vjetra (pa simulime fare). */
  private async cleanupSimulated() {
    const matchIds = (await prisma.match.findMany({ where: { isSimulated: true }, select: { id: true } })).map(m => m.id);
    if (!matchIds.length) return;
    await prisma.ticketLine.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.outcome.deleteMany({ where: { market: { matchId: { in: matchIds } } } });
    await prisma.market.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    console.log(`[LuckyBetFeed] U fshine ${matchIds.length} ndeshje simulimore.`);
  }

  /** Fshin ndeshjet ENDED te vjetra (>7 dite) per te mbajtur DB te lehte. */
  private async cleanupEndedOld() {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const old = (await prisma.match.findMany({
      where: { id: { startsWith: 'lb-' }, status: 'ENDED', startTime: { lt: cutoff } },
      select: { id: true }
    })).map(m => m.id);
    if (!old.length) return;
    await prisma.ticketLine.deleteMany({ where: { matchId: { in: old } } });
    await prisma.outcome.deleteMany({ where: { market: { matchId: { in: old } } } });
    await prisma.market.deleteMany({ where: { matchId: { in: old } } });
    await prisma.match.deleteMany({ where: { id: { in: old } } });
    console.log(`[LuckyBetFeed] U fshine ${old.length} ndeshje te vjetera.`);
  }


  /** Merr listat LIVE + PREMATCH (vetem futboll real) dhe i sinkronizon ne DB. */
  /** Gardë mbivendosjeje: me DB remote sinkronizimi mund të zgjasë mbi 60s — kurrë dy njëkohësisht. */
  private sync(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.doSync().finally(() => { this.syncInFlight = null; });
    return this.syncInFlight;
  }

  private async doSync() {
    const [live, pre] = await Promise.all([
      api('/matches/get-many', { sportId: 18, service: 'live', limit: 2000 }),
      api('/matches/get-many', { sportId: 18, service: 'prematch', limit: 2000 })
    ]);
    await this.loadNames();
    const items: Dict[] = [...(live?.result?.items || []), ...(pre?.result?.items || [])];
    const keep = new Set<number>();
    const liveNew: number[] = [];

    for (const it of items) {
      if (Number(it.sportId) !== 18) continue;
      const catId = Number(it.category?.id || 0);
      const catSlug = this.catSlugs.get(catId) || String(it.category?.slug || '');
      if (isVirtualSlug(catSlug)) continue; // cyberfifa/replays/esports -> HUQ (pa simulime)
      const id = Number(it.id);
      keep.add(id);
      if (String(it.service || '').toUpperCase() === 'LIVE') liveNew.push(id);
      await this.upsertMatch(it, catSlug);
    }

    const added = liveNew.filter(x => !this.liveIds.includes(x));
    this.liveIds = liveNew;
    if (added.length) this.subscribeNow(added);

    // Ndeshjet qe ra nga lista -> mbylli me score-in e fundit te njohur
    const open = await prisma.match.findMany({
      where: { id: { startsWith: 'lb-' }, status: { in: ['PREMATCH', 'LIVE'] } },
      select: { id: true }
    });
    for (const m of open) {
      const ext = Number(m.id.slice(3));
      if (Number.isFinite(ext) && !keep.has(ext)) await this.endMatch(ext);
    }
    console.log(`[LuckyBetFeed] Sync: ${keep.size} ndeshje futbolli reale (${liveNew.length} live).`);
  }

  /** Emrat + slug-et e kategorive (per filtrim virtual dhe shfaqje). */
  private async loadNames() {
    try {
      const cats = await api('/categories/get-many', { sportId: 18 });
      for (const it of cats?.result?.items || []) {
        const c = it.category || it;
        if (c?.id) {
          this.catNames.set(Number(c.id), String(c.name || ''));
          this.catSlugs.set(Number(c.id), String(c.slug || ''));
        }
      }
    } catch { /* pÃ«rdor slug-et nga items */ }
  }

  private prettySlug(slug: string) {
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Tournament';
  }

  private async upsertMatch(it: Dict, catSlug: string) {
    const extId = Number(it.id);
    const dbId = `lb-${extId}`;
    const nameStr = String(it.name || '');
    const parts = nameStr.split(/\s+vs\s+/i);
    const str = (v: any) => (v !== null && typeof v === 'object' ? String(v.name || v.title || '') : String(v ?? ''));
    const home = str(it.homeTeam ?? it.t1Name) || str(parts[0]) || 'Home';
    const away = str(it.awayTeam ?? it.t2Name) || str(parts[1]) || 'Away';
    const startAt = new Date(Number(it.startAt) * 1000);
    const service = String(it.service || '').toUpperCase();
    const catId = Number(it.category?.id || 0);
    const tourId = Number(it.tournament?.id || 0);

    let dbSport = await prisma.sport.findUnique({ where: { slug: 'football' } });
    if (!dbSport) {
      dbSport = await prisma.sport.create({ data: { name: 'Football', slug: 'football', iconName: 'soccer', sortOrder: 1, isActive: true } });
    }

    const catName = this.catNames.get(catId) || this.prettySlug(catSlug) || 'International';
    let dbCat = await prisma.category.findFirst({ where: { sportId: dbSport.id, name: catName } });
    if (!dbCat) {
      dbCat = await prisma.category.create({
        data: { sportId: dbSport.id, name: catName, slug: `${catSlug || 'cat'}-${catId}`, sortOrder: 1 }
      });
    }

    const tourSlug = String(it.tournament?.slug || `tournament-${tourId}`);
    let dbTour = await prisma.tournament.findFirst({ where: { categoryId: dbCat.id, slug: tourSlug } });
    if (!dbTour) {
      dbTour = await prisma.tournament.create({
        data: { categoryId: dbCat.id, name: this.prettySlug(tourSlug), slug: tourSlug, sortOrder: 1 }
      });
    }

    const status = service === 'LIVE' ? 'LIVE' : 'PREMATCH';
    const existing = await prisma.match.findUnique({ where: { id: dbId } });
    if (existing) {
      await prisma.match.update({
        where: { id: dbId },
        data: {
          tournamentId: dbTour.id,
          homeTeam: home,
          awayTeam: away,
          startTime: startAt,
          status: existing.status === 'LIVE' && status === 'PREMATCH' ? 'LIVE' : status
        }
      });
    } else {
      await prisma.match.create({
        data: {
          id: dbId,
          tournamentId: dbTour.id,
          homeTeam: home,
          awayTeam: away,
          startTime: startAt,
          status,
          currentMinute: 0,
          homeScore: 0,
          awayScore: 0,
          isSimulated: false,
          isSuspended: false
        }
      });
    }
  }


  /** Mbyll ndeshjen me score-in e fundit te njohur dhe gjykon bastet. */
  private async endMatch(extId: number) {
    const dbId = `lb-${extId}`;
    const match = await prisma.match.findUnique({ where: { id: dbId } });
    if (!match || match.status === 'ENDED') return;
    this.liveIds = this.liveIds.filter(x => x !== extId);
    await BetSettler.settleMatch(dbId, match.homeScore ?? 0, match.awayScore ?? 0);
    console.log(`[LuckyBetFeed] ENDED ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`);
  }

  /** Lidhet me push-server dhe pergjigjet protokollit engine.io/socket.io. */
  private connectWs() {
    if (this.ws) return;
    const url = `wss://${HOST}/push-server-v2/?Language=${LANG}&externalPartnerId=${PARTNER}&EIO=4&transport=websocket`;
    const reconnect = () => {
      this.ws = null;
      if (!this.running) return;
      setTimeout(() => this.connectWs(), 5000);
    };
    const ws: WebSocket = new WebSocket(url, { headers: { Origin: 'https://bitgames6205.com' } });
    this.ws = ws;

    ws.on('open', () => { ws.send('40'); });
    ws.on('message', (raw: Buffer) => {
      const frame = raw.toString();
      if (frame === '2') { ws.send('3'); return; }
      if (frame.startsWith('0')) { ws.send('40'); return; }
      if (!frame.startsWith('42')) return;
      let payload: any[];
      try { payload = JSON.parse(frame.slice(2)); } catch { return; }
      const msg = Array.isArray(payload) && payload[0] === 'u' ? payload[1] : payload[0];
      if (!msg || typeof msg.messageType !== 'string') return;

      if (msg.messageType === 'match-odds-snapshot' || msg.messageType === 'match-odds') {
        this.applyOdds(msg.data || {}).catch((e) => console.error('[LuckyBetFeed] applyOdds:', e.message));
      } else if (msg.messageType === 'match-info-snapshot' || msg.messageType === 'match-info') {
        this.applyInfo(msg.data || {}).catch((e) => console.error('[LuckyBetFeed] applyInfo:', e.message));
      }
    });
    ws.on('close', reconnect);
    ws.on('error', (err: Error) => {
      console.error('[LuckyBetFeed] WS error:', err.message);
      try { ws.close(); } catch { /* ignore */ }
    });

    // Rifresko abonimet Ã§do 30s me ID-tÃ« live aktuale
    this.subTimer = setInterval(() => this.subscribeNow(this.liveIds), 30000);
  }

  /** Abonon ID-te e dhena per kuota (te gjitha grupet) + info live. */
  private subscribeNow(ids: number[]) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !ids.length) return;
    ws.send('42' + JSON.stringify(['subscribe', { messageType: 'subscribe-match-odds', data: { matchIds: ids, isBaseOddsGroups: false } }]));
    ws.send('42' + JSON.stringify(['subscribe', { messageType: 'subscribe-match-info', data: { matchIds: ids } }]));
  }


  private async applyInfo(d: Dict) {
    const extId = Number(d.matchId);
    const dbId = `lb-${extId}`;
    const ms = (d.matchScore || d.score || {}) as Dict;
    const st = String(d.status || '');
    const r1 = Number(ms.t1 ?? ms.home);
    const r2 = Number(ms.t2 ?? ms.away);
    const hasScore = Number.isFinite(r1) && Number.isFinite(r2);
    const cur = await prisma.match.findUnique({ where: { id: dbId } });
    if (!cur || cur.status === 'ENDED') return;

    const raw = Number(d.matchTime ?? d.minute ?? 0);
    // API dërgon matchTime në milisekonda (shih docs) -> kthe në minuta
    const minute = raw > 1000 ? Math.floor(raw / 60000) : raw;
    const ended = st === 'Ended' || st === 'ENDED' || st === 'finished';

    // Golat nuk zvogëlohen: snapshot-et stale (p.sh. 0-0 pas 2-1) hidhen poshtë.
    const s1 = hasScore ? Math.max(r1, cur.homeScore ?? 0) : (cur.homeScore ?? 0);
    const s2 = hasScore ? Math.max(r2, cur.awayScore ?? 0) : (cur.awayScore ?? 0);
    const scoreChanged = s1 !== cur.homeScore || s2 !== cur.awayScore;

    // Bllokimi i golit: sahere ndryshon score → pezullo bastet (🔒 te frontend,
    // serveri refuzon betet) deri sa te vije push-i i pare me kuota te reja (applyOdds).
    await prisma.match.update({
      where: { id: dbId },
      data: {
        homeScore: s1,
        awayScore: s2,
        currentMinute: Number.isFinite(minute) ? minute : cur.currentMinute,
        status: ended ? 'ENDED' : 'LIVE',
        isSuspended: scoreChanged ? true : cur.isSuspended
      }
    });
    if (scoreChanged) {
      console.log(`[LuckyBetFeed] GOL ${cur.homeTeam} ${s1}-${s2} ${cur.awayTeam} → kuotat pezulluar përkohësisht`);
      for (const cb of this.statusCbs) cb(dbId, 'LIVE', Number.isFinite(minute) ? minute : (cur.currentMinute ?? 0), s1, s2);
    }
    if (ended) await this.endMatch(extId);
  }

  /** Shkruan te gjitha grupet e kuotave (snapshot/update) ne DB. */
  private async applyOdds(d: Dict) {
    const extId = Number(d.matchId);
    const dbId = `lb-${extId}`;
    const match = await prisma.match.findUnique({ where: { id: dbId } });
    if (!match || match.status === 'ENDED') return;

    const groups: Dict[] = (d.oddsGroups || []) as Dict[];
    for (const g of groups) {
      const marketName = String(g.name || '').trim() || 'Market';
      const marketType = marketTypeOf(marketName);

      let market = await prisma.market.findFirst({ where: { matchId: dbId, name: marketName } });
      if (!market) {
        const cnt = await prisma.market.count({ where: { matchId: dbId } });
        market = await prisma.market.create({
          data: { matchId: dbId, marketType, name: marketName, status: 'ACTIVE', sortOrder: 10 + cnt }
        });
      } else if (market.status !== 'ACTIVE') {
        await prisma.market.update({ where: { id: market.id }, data: { status: 'ACTIVE' } });
      }

      for (const o of (g.oddsList || []) as Dict[]) {
        const cf = Number(o.cf);
        if (!Number.isFinite(cf) || cf <= 0) continue; // kuote e fshir/e pezulluar
        const odds = Math.max(1.01, Math.round(cf * 100) / 100);
        const outName = String(o.name || o.outcome || '').trim();
        if (!outName) continue;

        const outcome = await prisma.outcome.findFirst({ where: { marketId: market.id, name: outName } });
        if (!outcome) {
          await prisma.outcome.create({ data: { marketId: market.id, name: outName, odds, status: 'ACTIVE' } });
        } else if (outcome.status !== 'ACTIVE') {
          await prisma.outcome.update({ where: { id: outcome.id }, data: { status: 'ACTIVE', odds } });
        } else if (outcome.odds !== odds) {
          await prisma.outcome.update({ where: { id: outcome.id }, data: { odds } });
          const delta: OddsDelta = { matchId: dbId, outcomes: [{ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: odds }] };
          for (const cb of this.oddsCbs) cb(delta);
        }
      }
    }

    // Ç-pezullo pas ardhjes së kuotave të reja — PËRVEÇ nëse admini e ka pezulluar manualisht
    // (manualSuspended: bllokimi i adminit mbetet derisa ai vetë ta heqë).
    if (match.isSuspended && !match.manualSuspended) {
      await prisma.match.update({ where: { id: dbId }, data: { isSuspended: false } });
    }
  }
}
