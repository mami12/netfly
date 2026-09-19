import { IFeedProvider, MatchEvent, OddsDelta, PitchState } from './IFeedProvider';
import { PrismaClient } from '@prisma/client';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
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
const VIRTUAL_HINTS = ['cyber', 'replay', 'esport', 'fifa', 'nba2k', 'e-soccer', 'e-football', 'virtual', 'simulated', 'short', 'battles'];
const isVirtualSlug = (s: string) => VIRTUAL_HINTS.some(v => (s || '').toLowerCase().includes(v));

/**
 * Grupet "Early payout" e perseritin 1X2 (te njejtat 3 opsione) dhe emri i tyre
 * përmban score-in live ("Full time result (Early payout 2:0)") → sahere ndryshon
 * score-i krijohej nje treg i ri identik = dublikata ne faqe. Hiqen fare.
 */
const isJunkGroup = (name: string) => /early\s*payout/i.test(name || '');

/** Sa milisekonda qendrojne kuotat e pezulluara pas nje goli, ne rast se feed-i nuk dergon update. */
const SUSPEND_GRACE_MS = 25 * 1000;

/** Minutat 1..120 (0 = e panjohur). Ndeshjet live nuk shfaqen me "0'". */
const clampMinute = (m: number) => (Number.isFinite(m) && m > 0 ? Math.min(120, Math.max(1, Math.round(m))) : 0);

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
  // "Match time result" = kush eshte duke fituar ne minutën X — NUK eshte 1X2
  if (n.includes('match time result')) return 'TIME_RESULT';
  // "Total from 1 to 10 minute" = gola brenda nje intervali kohe — NUK eshte total ekipi
  if (/from \d+ to \d+ minute/.test(n)) return 'INTERVAL_TOTAL';
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
  private prematchIds: number[] = [];              // jo-live, sipas fillimit (me te afertat te parat)
  private subOffset = 0;                            // dritare rrotulluese mbi prematch
  private catNames = new Map<number, string>();
  private catSlugs = new Map<number, string>();
  // Cache ne memorie: me DB remote (Supabase) shmangen ~5 pyetje/ndeshje
  private sportId: number | null = null;
  private catIds = new Map<string, number>();      // catName -> id
  private tourIds = new Map<string, number>();     // catId|tourSlug -> id
  private matchSig = new Map<string, string>();    // dbId -> "home|away|start|status"
  private suspendedAt = new Map<string, number>(); // dbId -> kur u pezullua pas golit
  // dbId -> "ts" i mesazhit te fundit te aplikuar. Feed-i dergon nje timestamp (ms)
  // ne çdo match-info: mesazhet me ts me te vjeter hidhen poshtë (renditje e sakte),
  // keshtu korrigjimet e score-it (p.sh. gol i anuluar 0-1 -> 0-0) pranohen.
  private infoTs = new Map<string, number>();
  private teamIdMap = new Map<string, { homeId: number; awayId: number }>();
  // Radha per-ndeshje: kuotat perpunojne NJE PER NJE (pa kjo, dy mesazhe te njekoheshme
  // krijonin tregje te dublikuara, sepse te dyja nuk e gjenin tregun ekzistues).
  private oddsQueue = new Map<string, Promise<void>>();
  // Kufi global: sa detyra njekohesisht prekin DB-ne. Pa te, qindra snapshot-e
  // e mbushin pool-in e lidhjeve (limit 5) dhe te gjitha deshtojne me timeout.
  private static readonly MAX_DB_TASKS = 5;
  private dbActive = 0;
  private dbWaiters: (() => void)[] = [];
  private lastNamesLoad = 0;

  private oddsCbs: ((delta: OddsDelta) => void)[] = [];
  private statusCbs: ((matchId: string, status: string, minute: number, homeScore: number, awayScore: number) => void)[] = [];
  private matchEventCbs: ((event: MatchEvent) => void)[] = [];

  start() {
    this.running = true;
    console.log('[LuckyBetFeed] Duke nisur feed-in real te futbollit (LuckyBet / gw-lucky-bet)...');
    if (!this.cleaned) {
      this.cleaned = true;
      this.cleanupSimulated()
        .then(() => this.cleanupEndedOld())
        .then(() => this.cleanupDuplicateMarkets())
        .then(() => this.cleanupVirtualMatches())
        .then(() => this.cleanupUnnamedMarkets())
        .catch((e) => console.error('[LuckyBetFeed] cleanup:', e));
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
    if (Date.now() - this.lastNamesLoad > 10 * 60 * 1000) {
      await this.loadNames();
      this.lastNamesLoad = Date.now();
    }
    const items: Dict[] = [...(live?.result?.items || []), ...(pre?.result?.items || [])];

    // 1) Mblidh ID-te MENJEHERE (pa asnje pyetje DB) — keshtu abonimi i kuotave nis
    //    brenda sekondave, jo pasi mbaron sinkronizimi i 1700+ ndeshjeve (qe zgjat minuta).
    const keep = new Set<number>();
    const liveNew: number[] = [];
    const preNew: { id: number; at: number }[] = [];
    const todo: { it: Dict; catSlug: string }[] = [];

    for (const it of items) {
      if (Number(it.sportId) !== 18) continue;
      const catId = Number(it.category?.id || 0);
      const catSlug = this.catSlugs.get(catId) || String(it.category?.slug || '');
      if (isVirtualSlug(catSlug)) continue; // cyberfifa/replays/esports -> HUQ (pa simulime)

      const homeName = String(it.homeTeam?.name || it.home || '').toLowerCase();
      const awayName = String(it.awayTeam?.name || it.away || '').toLowerCase();
      if (homeName.includes('outright') || awayName.includes('outright') || homeName.includes('winner') || awayName.includes('winner')) continue;

      const id = Number(it.id);
      keep.add(id);
      if (String(it.service || '').toUpperCase() === 'LIVE') liveNew.push(id);
      else preNew.push({ id, at: Number(it.startAt) || 0 });
      todo.push({ it, catSlug });
    }

    this.liveIds = liveNew;
    // PREMATCH: me te afertat ne fillim — ato shihen me shume nga lojtaret
    preNew.sort((a, b) => a.at - b.at);
    this.prematchIds = preNew.map((p) => p.id);
    if (this.subOffset >= this.prematchIds.length) this.subOffset = 0;

    // Abono menjehere: kuotat fillojne te vijne pa pritur sinkronizimin e DB-se
    this.subscribeCycle();

    // 2) Sinkronizimi ne DB (i ngadalte me DB remote) — kryhet tani qe abonimi ka nisur
    for (const t of todo) {
      await this.upsertMatch(t.it, t.catSlug);
    }

    // Ndeshjet qe ra nga lista -> mbylli me score-in e fundit te njohur
    const open = await prisma.match.findMany({
      where: { id: { startsWith: 'lb-' }, status: { in: ['PREMATCH', 'LIVE'] } },
      select: { id: true, status: true, startTime: true }
    });
    const nowTs = Date.now();
    for (const m of open) {
      const ext = Number(m.id.slice(3));
      // Mbyll nese nuk eshte me ne feed OSE nese eshte LIVE por ka kaluar 130 min nga nisja
      const isExpiredLive = m.status === 'LIVE' && m.startTime && (nowTs - m.startTime.getTime() > 130 * 60 * 1000);
      if (Number.isFinite(ext) && (!keep.has(ext) || isExpiredLive)) {
        await this.endMatch(ext);
      }
    }
    console.log(`[LuckyBetFeed] Sync: ${keep.size} ndeshje futbolli reale (${liveNew.length} live).`);

    // Përditëso minutat dinamikisht për TË GJITHA ndeshjet LIVE që luhen aktualisht
    try {
      const fixed = await prisma.$executeRaw`
        UPDATE "Match"
        SET "currentMinute" = LEAST(120, GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - "startTime")) / 60)::int))
        WHERE "status" = 'LIVE' AND "startTime" < NOW() AND "startTime" > NOW() - INTERVAL '135 minutes'`;
      if (fixed > 0) console.log(`[LuckyBetFeed] Minutat u sinkronizuan për ${fixed} ndeshje live.`);
    } catch (e: any) {
      console.error('[LuckyBetFeed] Sinkronizimi i minutave dështoi:', e?.message);
    }

    // Rrjetë sigurie: nëse pas një goli feed-i nuk dërgoi kuota të reja, ç-pezullo pas 25s
    // (përveç pezullimit manual të adminit).
    for (const [dbId, at] of Array.from(this.suspendedAt.entries())) {
      if (Date.now() - at < SUSPEND_GRACE_MS) continue;
      this.suspendedAt.delete(dbId);
      await prisma.match.updateMany({
        where: { id: dbId, isSuspended: true, manualSuspended: false },
        data: { isSuspended: false }
      });
    }
  }

  /**
   * Pastron tregjet e dublikuara (krijuar para serializimit) dhe tregjet bosh.
   * Kontroll i lirë fillimisht; puna e rende behet vetem nese ka vertet dublikata.
   */
  private async cleanupDuplicateMarkets() {
    const dupRow = await prisma.$queryRaw<{ c: number }[]>`
      SELECT COALESCE(SUM(c - 1), 0)::int AS c FROM (
        SELECT COUNT(*) AS c FROM "Market"
        WHERE "matchId" LIKE 'lb-%'
        GROUP BY "matchId", "name"
        HAVING COUNT(*) > 1
      ) t`;
    const dupCount = Number(dupRow?.[0]?.c || 0);
    if (dupCount === 0) return;

    console.log(`[LuckyBetFeed] Pastrim: ${dupCount} tregje te dublikuara — po pastrohen...`);

    const rows = await prisma.$queryRaw<{ id: string; matchId: string; name: string; outcomes: number }[]>`
      SELECT m."id" AS id, m."matchId" AS matchId, m."name" AS name,
             (SELECT COUNT(*)::int FROM "Outcome" o WHERE o."marketId" = m."id") AS outcomes
      FROM "Market" m
      JOIN "Match" mt ON mt."id" = m."matchId"
      WHERE m."matchId" LIKE 'lb-%' AND mt."status" IN ('PREMATCH', 'LIVE')`;

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.matchId}|${r.name}`;
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }

    const doomed: string[] = [];
    for (const arr of groups.values()) {
      // Tregje pa asnje kuote -> hiqen
      for (const m of arr) if (Number(m.outcomes) === 0) doomed.push(m.id);
      // Dublikata me te njejtin emer -> mbahet ai me shume kuota
      const withOutcomes = arr.filter((m) => Number(m.outcomes) > 0);
      if (withOutcomes.length > 1) {
        withOutcomes.sort((a, b) => Number(b.outcomes) - Number(a.outcomes));
        for (const extra of withOutcomes.slice(1)) doomed.push(extra.id);
      }
    }
    if (!doomed.length) return;

    // Mos fshi tregjet qe kane baste te lojtareve (siguri per skedinat ekzistuese)
    const used = await prisma.ticketLine.findMany({ where: { marketId: { in: doomed } }, select: { marketId: true } });
    const keep = new Set(used.map((u) => u.marketId));
    const toDelete = Array.from(new Set(doomed.filter((id) => !keep.has(id))));
    if (!toDelete.length) return;

    for (let i = 0; i < toDelete.length; i += 200) {
      const chunk = toDelete.slice(i, i + 200);
      await prisma.outcome.deleteMany({ where: { marketId: { in: chunk } } });
      await prisma.market.deleteMany({ where: { id: { in: chunk } } });
    }
    console.log(`[LuckyBetFeed] Pastrim: u fshine ${toDelete.length} tregje te dublikuara/bosh.`);
  }

  /** Fshin tregjet pa emer te vertete ("Market") qe nuk mund te shfaqen ne faqe. */
  private async cleanupUnnamedMarkets() {
    const junk = await prisma.market.findMany({
      where: { name: 'Market', matchId: { startsWith: 'lb-' } },
      select: { id: true }
    });
    if (!junk.length) return;

    const ids = junk.map((m) => m.id);
    const used = await prisma.ticketLine.findMany({ where: { marketId: { in: ids } }, select: { marketId: true } });
    const keep = new Set(used.map((u) => u.marketId));
    const toDelete = ids.filter((id) => !keep.has(id));
    if (!toDelete.length) return;

    for (let i = 0; i < toDelete.length; i += 200) {
      const chunk = toDelete.slice(i, i + 200);
      await prisma.outcome.deleteMany({ where: { marketId: { in: chunk } } });
      await prisma.market.deleteMany({ where: { id: { in: chunk } } });
    }
    console.log(`[LuckyBetFeed] U fshine ${toDelete.length} tregje pa emer.`);
  }

  /**
   * Fshin ndeshjet qe i perkasin kategorive virtuale (short-football, cyberfifa,
   * replays...) — keto kishin kaluar filtrin e vjeter dhe shfaqeshin si ndeshje
   * reale me score te gabuar. Ndeshjet me baste te lojtareve nuk preken.
   */
  private async cleanupVirtualMatches() {
    const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
    const badCatIds = cats.filter((c) => isVirtualSlug(c.slug)).map((c) => c.id);
    if (!badCatIds.length) return;

    const tours = await prisma.tournament.findMany({ where: { categoryId: { in: badCatIds } }, select: { id: true } });
    if (!tours.length) return;

    const found = await prisma.match.findMany({
      where: { tournamentId: { in: tours.map((t) => t.id) }, id: { startsWith: 'lb-' } },
      select: { id: true, _count: { select: { ticketLines: true } } }
    });
    const ids = found.filter((m) => m._count.ticketLines === 0).map((m) => m.id);
    if (!ids.length) return;

    await prisma.outcome.deleteMany({ where: { market: { matchId: { in: ids } } } });
    await prisma.market.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.match.deleteMany({ where: { id: { in: ids } } });
    console.log(`[LuckyBetFeed] U fshine ${ids.length} ndeshje virtuale (short-football/replays/cyberfifa).`);
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
    // ID-te e ekipeve ne feed (per te lidhur statistikat scoreBoard: kornera/kartona)
    const extHomeId = Number(it.homeTeam?.id) || Number(it.competitors?.find((c: any) => c.position === 1)?.id) || null;
    const extAwayId = Number(it.awayTeam?.id) || Number(it.competitors?.find((c: any) => c.position === 2)?.id) || null;
    if (extHomeId && extAwayId) {
      this.teamIdMap.set(dbId, { homeId: extHomeId, awayId: extAwayId });
    }

    // Kalim i shpejte: nese asnje fushe e dukshme nuk ka ndryshuar, s'prekim DB fare
    const sig = `${home}|${away}|${startAt.getTime()}|${service}|${extHomeId}|${extAwayId}`;
    if (this.matchSig.get(dbId) === sig) return;

    // Sport (1 here per proces)
    if (!this.sportId) {
      let dbSport = await prisma.sport.findUnique({ where: { slug: 'football' } });
      if (!dbSport) {
        dbSport = await prisma.sport.create({ data: { name: 'Football', slug: 'football', iconName: 'soccer', sortOrder: 1, isActive: true } });
      }
      this.sportId = dbSport.id;
    }

    // Kategoria (cache emri -> id)
    const catName = this.catNames.get(catId) || this.prettySlug(catSlug) || 'International';
    let dbCatId = this.catIds.get(catName);
    if (!dbCatId) {
      let dbCat = await prisma.category.findFirst({ where: { sportId: this.sportId, name: catName } });
      if (!dbCat) {
        dbCat = await prisma.category.create({
          data: { sportId: this.sportId, name: catName, slug: `${catSlug || 'cat'}-${catId}`, sortOrder: 1 }
        });
      }
      dbCatId = dbCat.id;
      this.catIds.set(catName, dbCatId);
    }

    // Turneu (cache catId|slug -> id)
    const tourSlug = String(it.tournament?.slug || `tournament-${tourId}`);
    const tourKey = `${dbCatId}|${tourSlug}`;
    let dbTourId = this.tourIds.get(tourKey);
    if (!dbTourId) {
      let dbTour = await prisma.tournament.findFirst({ where: { categoryId: dbCatId, slug: tourSlug } });
      if (!dbTour) {
        dbTour = await prisma.tournament.create({
          data: { categoryId: dbCatId, name: this.prettySlug(tourSlug), slug: tourSlug, sortOrder: 1 }
        });
      }
      dbTourId = dbTour.id;
      this.tourIds.set(tourKey, dbTourId);
    }

    const status = service === 'LIVE' ? 'LIVE' : 'PREMATCH';
    const existing = await prisma.match.findUnique({ where: { id: dbId }, select: { status: true } });
    if (existing) {
      await prisma.match.update({
        where: { id: dbId },
        data: {
          tournamentId: dbTourId,
          homeTeam: home,
          awayTeam: away,
          startTime: startAt,
          extHomeId,
          extAwayId,
          status: existing.status === 'LIVE' && status === 'PREMATCH' ? 'LIVE' : status
        }
      });
    } else {
      await prisma.match.create({
        data: {
          id: dbId,
          tournamentId: dbTourId,
          homeTeam: home,
          awayTeam: away,
          startTime: startAt,
          status,
          // LIVE: nis me minutën e llogaritur nga ora e fillimit — faqja nuk
          // shfaq "0'" derisa te vije push-i i pare i informacionit te feed-it.
          currentMinute: status === 'LIVE' ? clampMinute((Date.now() - startAt.getTime()) / 60000) : 0,
          homeScore: 0,
          awayScore: 0,
          extHomeId,
          extAwayId,
          isSimulated: false,
          isSuspended: false
        }
      });
    }
    this.matchSig.set(dbId, sig);
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

  /**
   * Serializon perpunimin per nje ndeshje: mesazhet e kuotave/info perpunohen
   * NJE PER NJE. Pa kete, dy mesazhe te njekoheshme per te njejten ndeshje
   * krijonin tregje te dublikuara (asnjera nuk e gjente tregun ekzistues).
   */
  private enqueue(key: unknown, task: () => Promise<void>, label: string) {
    const k = String(key ?? 'global');
    const prev = this.oddsQueue.get(k) || Promise.resolve();
    const next = prev
      .then(() => this.withDbSlot(task))
      .catch((e) => console.error(`[LuckyBetFeed] ${label}:`, e.message));
    this.oddsQueue.set(k, next);
    return next;
  }

  /**
   * Zbaton operacionet ne blloqe (nje round-trip per bllok). Nese nje bllok
   * deshton (p.sh. konflikt unik sepse nje proces tjeter shkruan ne te njejten DB),
   * provohen nje nga nje duke i shperfillur konfliktet — pa humbur pjesa tjeter.
   */
  private async flushOps(ops: (() => any)[]) {
    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400);
      try {
        await prisma.$transaction(chunk.map((f) => f()));
      } catch {
        for (const f of chunk) {
          try { await f(); } catch { /* konflikt/garë: injoro, rregullohet cikli tjeter */ }
        }
      }
    }
  }

   /**
   * Radhe globale mbi punen me DB: nuk lejohen me shume se MAX_DB_TASKS detyra
   * njekohesisht. Pa kete, qindra snapshot-e e mbushin pool-in e Prisma-s dhe
   * te gjitha pyetjet deshtojne me "Timed out fetching a new connection".
   */
  private async withDbSlot<T>(fn: () => Promise<T>): Promise<T> {
    while (this.dbActive >= LuckyBetFeed.MAX_DB_TASKS) {
      await new Promise<void>((resolve) => this.dbWaiters.push(resolve));
    }
    this.dbActive++;
    try {
      return await fn();
    } finally {
      this.dbActive--;
      const next = this.dbWaiters.shift();
      if (next) next();
    }
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
      // Serveri konfirmon lidhjen (40{...}) -> nis abonimin menjehere
      if (frame.startsWith('40')) { this.subscribeCycle(); return; }
      if (!frame.startsWith('42')) return;
      let payload: any[];
      try { payload = JSON.parse(frame.slice(2)); } catch { return; }
      const msg = Array.isArray(payload) && payload[0] === 'u' ? payload[1] : payload[0];
      if (!msg || typeof msg.messageType !== 'string') return;

      if (msg.messageType === 'match-odds-snapshot' || msg.messageType === 'match-odds') {
        const mid = msg.data?.matchId ? `match-${msg.data.matchId}` : 'odds';
        this.enqueue(mid, () => this.applyOdds(msg.data || {}), 'applyOdds');
      } else if (msg.messageType === 'match-info-snapshot' || msg.messageType === 'match-info') {
        const mid = msg.data?.matchId ? `match-${msg.data.matchId}` : 'info';
        this.enqueue(mid, () => this.applyInfo(msg.data || {}), 'applyInfo');
      }
    });
    ws.on('close', reconnect);
    ws.on('error', (err: Error) => {
      console.error('[LuckyBetFeed] WS error:', err.message);
      try { ws.close(); } catch { /* ignore */ }
    });

    // Rifresko abonimet Ã§do 30s me ID-tÃ« live aktuale
    this.subTimer = setInterval(() => this.subscribeCycle(), 20000);
  }

  /**
   * Abonimi: LIVE me te gjitha grupet + nje dritare rrotulluese PREMATCH.
   * Me pare abonoheshin VETEM ndeshjet live — prematch nuk merrte kurre kuota.
   *
   * Prematch-i ndahet ne dy nivele qe volumi i shkrimit ne DB te mbetet i menaxhueshem:
   *   - me te afertat (NEAR) -> te gjitha grupet (faqja e detajeve e pasur)
   *   - pjesa tjeter e dritares -> vetem grupet baze (1X2, Handicap, Total)
   * Dritarja rrotullohet, keshtu qe me kalimin e kohes te gjitha marrin kuota.
   */
  private subscribeCycle() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const live = this.liveIds;
    const pre = this.prematchIds;
    const liveSet = new Set(live);

    const NEAR = 25;     // me te afertat: te gjitha grupet
    const WINDOW = 90;   // dritarja prematch: grupet baze

    const near: number[] = [];
    for (let i = 0; i < Math.min(NEAR, pre.length); i++) {
      const id = pre[i];
      if (!liveSet.has(id)) near.push(id);
    }

    const rest: number[] = [];
    if (pre.length) {
      for (let i = 0; i < Math.min(WINDOW, pre.length); i++) {
        const id = pre[(this.subOffset + i) % pre.length];
        if (!liveSet.has(id) && !near.includes(id)) rest.push(id);
      }
      this.subOffset = (this.subOffset + WINDOW) % pre.length;
    }

    this.sendSub(live, false);       // live: te gjitha grupet + info
    this.sendSub(near, false);       // prematch i afert: te gjitha grupet
    this.sendSub(rest, true);        // pjesa tjeter: vetem grupet baze
    if (live.length) this.sendInfo(live);
    if (near.length) this.sendInfo(near);
  }

  /** Dergon abonimin e kuotave ne blloqe (mesazhe te medha nuk pranohen). */
  private sendSub(ids: number[], baseOnly: boolean) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !ids.length) return;
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      ws.send('42' + JSON.stringify([
        'subscribe',
        { messageType: 'subscribe-match-odds', data: { matchIds: chunk, isBaseOddsGroups: baseOnly } }
      ]));
    }
  }

  /** Abonimi i informacionit live (score, minute, status). */
  private sendInfo(ids: number[]) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !ids.length) return;
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      ws.send('42' + JSON.stringify([
        'subscribe',
        { messageType: 'subscribe-match-info', data: { matchIds: ids.slice(i, i + CHUNK) } }
      ]));
    }
  }


  private async applyInfo(d: Dict) {
    const extId = Number(d.matchId);
    const dbId = `lb-${extId}`;

    // Renditja: feed-i dergon "ts" (ms) ne çdo match-info. Nje mesazh me ts me te
    // vjeter se i fundit i aplikuar = ardhje jashte radhe -> hidhet poshte.
    const ts = Number(d.ts || 0);
    const lastTs = this.infoTs.get(dbId) ?? 0;
    if (ts > 0 && lastTs > 0 && ts < lastTs) return;

    const ms = (d.matchScore || d.score || {}) as Dict;
    const st = String(d.status || '');
    const r1 = Number(ms.t1 ?? ms.home);
    const r2 = Number(ms.t2 ?? ms.away);
    const hasScore = Number.isFinite(r1) && Number.isFinite(r2);
    const cur = await prisma.match.findUnique({ where: { id: dbId } });
    if (!cur || cur.status === 'ENDED') return;

    const raw = Number(d.matchTime ?? d.minute ?? 0);
    let minute = raw > 1000 ? Math.floor(raw / 60000) : raw;
    // Fallback: nese feed-i nuk dergon minute (0), llogarite nga ora e fillimit (kurre 0 per ndeshje live).
    if (!minute || minute <= 0) {
      const elapsed = Math.floor((Date.now() - cur.startTime.getTime()) / 60000);
      minute = Math.max(1, Math.min(120, elapsed));
    }
    const ended = /end|finish/i.test(st);
    // Feed-i i liston si "live" edhe ndeshjet qe S'KANE FILLUAR ("About to start",
    // "Not started yet") -> ato duhet te mbeten PREMATCH, jo te shfaqen si LIVE.
    const notStarted = /about to start|not started|scheduled|postpon|delay|cancel/i.test(st);

    // Score-i merret ASHTU SI ESHTE: feed-i eshte burimi i se vertetes. NUK perdoret
    // Math.max (qe e bllokonte uijen e score-it) — keshtu pranohen korrigjimet:
    // gol i anuluar (0-1 -> 0-0), ose push i gabuar i korrigjuar nga feed-i.
    const s1 = hasScore ? r1 : (cur.homeScore ?? 0);
    const s2 = hasScore ? r2 : (cur.awayScore ?? 0);
    const scoreChanged = s1 !== cur.homeScore || s2 !== cur.awayScore;
    const finalStatus = ended ? 'ENDED' : notStarted ? 'PREMATCH' : 'LIVE';
    const statusChanged = finalStatus !== cur.status;
    const minuteChanged = minute !== cur.currentMinute;

    // Statistikat live: scoreBoard.results eshte keyed nga id e ekipit ne feed,
    // prandaj kerkohen me extHomeId/extAwayId (ruajtur gjate sinkronizimit).
    const sts: any = {};
    const sb = (d.scoreBoard?.results || {}) as Dict;
    const homeId = cur.extHomeId || this.teamIdMap.get(dbId)?.homeId;
    const awayId = cur.extAwayId || this.teamIdMap.get(dbId)?.awayId;
    if (homeId && !cur.extHomeId) sts.extHomeId = homeId;
    if (awayId && !cur.extAwayId) sts.extAwayId = awayId;

    const pick = (tid: number | null | undefined, key: string): number | undefined => {
      if (!tid || !sb[String(tid)]) return undefined;
      const v = Number(sb[String(tid)][key]);
      return Number.isFinite(v) ? v : undefined;
    };
    const hc = pick(homeId, 'corners'); if (hc !== undefined) sts.homeCorners = hc;
    const ac = pick(awayId, 'corners'); if (ac !== undefined) sts.awayCorners = ac;
    const hy = pick(homeId, 'yellowCards'); if (hy !== undefined) sts.homeYellow = hy;
    const ay = pick(awayId, 'yellowCards'); if (ay !== undefined) sts.awayYellow = ay;
    const hr = pick(homeId, 'redCards'); if (hr !== undefined) sts.homeRed = hr;
    const ar = pick(awayId, 'redCards'); if (ar !== undefined) sts.awayRed = ar;
    const hp = pick(homeId, 'possession'); if (hp !== undefined) sts.homePossession = hp;
    const ap = pick(awayId, 'possession'); if (ap !== undefined) sts.awayPossession = ap;
    const hs = pick(homeId, 'shots'); if (hs !== undefined) sts.homeShots = hs;
    const as = pick(awayId, 'shots'); if (as !== undefined) sts.awayShots = as;

    // Bllokimi i golit: sahere ndryshon score → pezullo bastet (🔒 te frontend,
    // serveri refuzon betet) deri sa te vije push-i i pare me kuota te reja (applyOdds).
    await prisma.match.update({
      where: { id: dbId },
      data: {
        homeScore: s1,
        awayScore: s2,
        currentMinute: Number.isFinite(minute) ? minute : cur.currentMinute,
        period: st || cur.period,
        status: finalStatus,
        isSuspended: scoreChanged ? true : cur.isSuspended,
        ...sts
      }
    });
    // Ruaj "ts" e fundit te aplikuar — baza e renditjes per mesazhet e ardhshme
    if (ts > 0) this.infoTs.set(dbId, ts);
    if (scoreChanged) {
      this.suspendedAt.set(dbId, Date.now());
      console.log(`[LuckyBetFeed] GOL ${cur.homeTeam} ${s1}-${s2} ${cur.awayTeam} → kuotat pezulluar përkohësisht`);
    }
    if (scoreChanged || statusChanged || minuteChanged) {
      const liveMin = Number.isFinite(minute) ? minute : (cur.currentMinute ?? 0);
      for (const cb of this.statusCbs) cb(dbId, finalStatus, liveMin, s1, s2);
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
    const deltas: { outcomeId: string; oldOdds: number; newOdds: number; status: string }[] = [];

    // 1) Ngarko ekzistueset me NJE pyetje (jo nje pyetje per çdo outcome!)
    const existingMarkets = await prisma.market.findMany({
      where: { matchId: dbId },
      include: { outcomes: { select: { id: true, name: true, odds: true, code: true, status: true } } }
    });
    const byExtId = new Map<string, any>(existingMarkets.filter((m) => m.extId).map((m) => [m.extId as string, m]));
    const byName = new Map<string, any>(existingMarkets.filter((m) => !m.extId).map((m) => [m.name, m]));
    const ops: (() => any)[] = [];
    let marketCount = existingMarkets.length;

    for (const g of groups) {
      const rawName = String(g.name || '').trim();
      if (!rawName) continue; // grup pa emer (feed-i nuk jep) — nuk mund te shfaqet
      if (isJunkGroup(rawName)) continue; // dublikatat "Early payout" nuk krijohen me

      const marketType = marketTypeOf(rawName);
      const groupExtId = g.id != null ? String(g.id) : null;

      // Identiteti = id e grupit te feed-it; tregjet e vjetra pa extId lidhen nje here.
      let market: any = groupExtId ? byExtId.get(groupExtId) : undefined;
      if (!market) {
        const legacy = byName.get(rawName);
        if (legacy) {
          market = legacy;
          if (groupExtId) {
            ops.push(() => prisma.market.update({ where: { id: legacy.id }, data: { extId: groupExtId } }));
            byExtId.set(groupExtId, legacy);
            byName.delete(rawName);
          }
        }
      }
      if (!market) {
        const id = randomUUID();
        ops.push(() => prisma.market.create({
          data: { id, matchId: dbId, extId: groupExtId, marketType, name: rawName, status: 'ACTIVE', sortOrder: 10 + marketCount }
        }));
        marketCount++;
        market = { id, matchId: dbId, extId: groupExtId, name: rawName, marketType, status: 'ACTIVE', outcomes: [] };
        if (groupExtId) byExtId.set(groupExtId, market);
      } else {
        // Tipi i tregut mund te kete ndryshuar (p.sh. "Match time result" tani eshte
        // TIME_RESULT, jo 1X2) — mbahet i sinkronizuar, pa krijuar treg te ri.
        if (market.marketType !== marketType) {
          ops.push(() => prisma.market.update({ where: { id: market.id }, data: { marketType } }));
          market.marketType = marketType;
        }
        if (market.status !== 'ACTIVE') {
          ops.push(() => prisma.market.update({ where: { id: market.id }, data: { status: 'ACTIVE' } }));
        }
      }

      // Outcome-et ekzistuese te ketij tregu (in-memory — pa pyetje shtese DB)
      const known: Map<string, any> = new Map((market.outcomes || []).map((o: any) => [o.name, o]));

      for (const o of (g.oddsList || []) as Dict[]) {
        const outName = String(o.name || o.outcome || '').trim();
        if (!outName) continue;
        const code = String(o.outcome ?? '').trim();

        // cf <= 0 = kuote e hequr/pezulluar nga burimi → SUSPENDED (e dukshme + e bllokuar)
        const cf = Number(o.cf);
        const hasOdds = Number.isFinite(cf) && cf > 0;
        const odds = hasOdds ? Math.max(1.01, Math.round(cf * 100) / 100) : 0;

        const outcome = known.get(outName);
        if (!outcome) {
          if (!hasOdds) continue; // mos krijo outcome pa kuote
          const id = randomUUID();
          ops.push(() => prisma.outcome.create({ data: { id, marketId: market.id, name: outName, code: code || null, odds, status: 'ACTIVE' } }));
          known.set(outName, { id, name: outName, odds, code: code || null, status: 'ACTIVE' });
        } else if (!hasOdds) {
          if (outcome.status !== 'SUSPENDED') {
            ops.push(() => prisma.outcome.update({ where: { id: outcome.id }, data: { status: 'SUSPENDED' } }));
            deltas.push({ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: outcome.odds, status: 'SUSPENDED' });
            outcome.status = 'SUSPENDED';
          }
        } else if (outcome.status !== 'ACTIVE') {
          ops.push(() => prisma.outcome.update({ where: { id: outcome.id }, data: { status: 'ACTIVE', odds, ...(code && !outcome.code ? { code } : {}) } }));
          deltas.push({ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: odds, status: 'ACTIVE' });
          outcome.status = 'ACTIVE';
          outcome.odds = odds;
          if (code) outcome.code = code;
        } else if (outcome.odds !== odds || (!outcome.code && code)) {
          // Rifresko kuoten DHE ploteso kodin nese mungon (backfill i rreshtave te vjeter)
          ops.push(() => prisma.outcome.update({ where: { id: outcome.id }, data: { odds, ...(code && !outcome.code ? { code } : {}) } }));
          if (outcome.odds !== odds) {
            deltas.push({ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: odds, status: 'ACTIVE' });
          }
          outcome.odds = odds;
          if (code) outcome.code = code;
        }
      }
    }

    // 2) Zbato te gjitha ndryshimet ne blloqe: nje round-trip ne vend te nje pyetjeje per kuote
    await this.flushOps(ops);

    // Nje mesazh i vetem per te gjitha kuotat e ndryshuara (me pak trafik WS).
    if (deltas.length) {
      const delta = { matchId: dbId, outcomes: deltas } as OddsDelta;
      for (const cb of this.oddsCbs) cb(delta);
    }

    // Ç-pezullo pas ardhjes së kuotave të reja — PËRVEÇ nëse admini e ka pezulluar manualisht
    // (manualSuspended: bllokimi i adminit mbetet derisa ai vetë ta heqë).
    if (match.isSuspended && !match.manualSuspended) {
      await prisma.match.update({ where: { id: dbId }, data: { isSuspended: false } });
      this.suspendedAt.delete(dbId);
    }
  }
}
