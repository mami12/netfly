import { IFeedProvider, MatchEvent, OddsDelta, PitchState } from './IFeedProvider';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { BetSettler } from '../services/betSettler';
import { prisma } from '../db';
import { derivedMinute } from '../utils/minute';
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

/**
 * Sa kohe mbahet ne memorie gjendja e tregjeve te nje ndeshje (extId/emri -> treg + kuota).
 * Pa kete cache, ÇDO mesazh i feed-it bënte nje findMany me 40+ tregje dhe qindra kuota.
 */
const MARKET_CACHE_TTL_MS = 5 * 60 * 1000;
/** Sa kohe mbahet rreshti i ndeshjes (status/pezullim) ne memorie para rifreskimit nga DB. */
const MATCH_CACHE_TTL_MS = 60 * 1000;

/** Nese kuotat e nje ndeshjeje u ruajten brenda kesaj kohe, konsiderohen te freskëta. */
const PRIORITY_FRESH_MS = 4000;

/** Sa shpesh (max) perditesohet "lastOddsAt" kur kuotat nuk ndryshojne fare. */
const LAST_ODDS_TOUCH_MS = 20 * 1000;

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
  if (n.includes('full time') || n === '1x2' || n === 'match winner' || n === 'match result' || n === 'rezultati final') return '1X2';
  // "Match time result" = kush eshte duke fituar ne minutën X — NUK eshte 1X2
  if (n.includes('match time result')) return 'TIME_RESULT';
  // "Total from 1 to 10 minute" = gola brenda nje intervali kohe — NUK eshte total ekipi
  if (/from \d+ to \d+ minute/.test(n) || /\bminute\b/.test(n)) return 'INTERVAL_TOTAL';
  if (n.includes('handicap')) return 'HANDICAP';
  if (n.includes('total')) {
    if (n.startsWith('total') || n.startsWith('over') || n.startsWith('under')) return 'OVER_UNDER';
    return 'TEAM_TOTAL';
  }
  if (n.includes('foul')) return 'STATS_OTHER';
  if (n.includes('result') || n.includes('winner')) return '1X2';
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
  // Pa lojtar online, feed-i mund te fleje — por jo aq shpejt sa te ngrinë ndeshjet:
  // 15 minuta pa asnje aktivitet (ne vend te 3), sepse faqja duhet te duket e freskët
  // sapo hapet dhe disa minuta heshtjeje nuk justifikojnë ngrirjen e kuotave.
  private static readonly IDLE_TIMEOUT_MS = 15 * 60 * 1000;
  private dbActive = 0;
  private dbWaiters: (() => void)[] = [];
  // Radha prioritare: ndeshja qe lojtari ka hapur kalon para radhes normale.
  private dbWaitersHigh: (() => void)[] = [];
  private lastNamesLoad = 0;

  // Gjendja e gjumit dhe gjurmimi i përdoruesve online
  private isSleeping = false;
  private lastActiveTs = Date.now();
  private activeUsersCount = 0;
  private idleCheckTimer: NodeJS.Timeout | null = null;

  private priorityIds = new Set<number>();
  private matchOddsWaiters = new Map<number, (() => void)[]>();

  // Radha e kuotave me KOALESCIM: per cdo ndeshje mbahet vetem gjendja me e re e
  // bashkuar (grupet nuk humbin) — pa nje shkrim ne DB per çdo mesazh te feed-it.
  private pendingOdds = new Map<string, Dict>();
  private pendingInfo = new Map<string, Dict>();
  private oddsBusy = new Set<string>();
  // Diagnostike e perkohshme (aktivohet me FEED_DEBUG=1) — hiqet pas verifikimit.
  private dbg = { oddsMsgs: 0, infoMsgs: 0, oddsApplied: 0, lastLog: Date.now() };
  // Cache kuotash/tregjish (extId/emri -> treg me kuota) + rreshti i ndeshjes.
  private marketCache = new Map<string, { byExtId: Map<string, any>; byName: Map<string, any>; ts: number }>();
  private matchRowCache = new Map<string, { row: any; ts: number }>();
  // Gjendja e lidhjes WS + koha e mesazhit te fundit (watchdog + diagnostike).
  private wsState = 'idle';
  private lastWsMsgAt = 0;

  private oddsCbs: ((delta: OddsDelta) => void)[] = [];
  private statusCbs: ((matchId: string, status: string, minute: number, homeScore: number, awayScore: number, period?: string) => void)[] = [];
  private matchEventCbs: ((event: MatchEvent) => void)[] = [];

  /**
   * Prioritizon menjëherë një ndeshje kur një lojtar e hap në faqe.
   * Dërgon kërkesë abonimi të menjëhershme në WebSocket për kuotat e plota (pa pritur ciklin 20s).
   * Nëse ndeshja nuk ka kuota në DB, pret deri në `waitForOddsMs` që snapshot-i të përpunohet.
   */
  async prioritizeMatch(extId: number, waitForOddsMs = 1500): Promise<void> {
    this.touch();
    if (!Number.isFinite(extId) || extId <= 0) return;
    this.priorityIds.add(extId);

    // Bounded set size (maksimumi 100 ndeshje aktive njëkohësisht)
    if (this.priorityIds.size > 100) {
      const first = this.priorityIds.values().next().value;
      if (first !== undefined) this.priorityIds.delete(first);
    }

    this.sendPrioritySub(extId);

    if (waitForOddsMs <= 0) return;

    // Vetem nese kuotat e ruajtura jane te vjetra pritet snapshot-i i ri. Me pare kontrollohej
    // "a ka tregje" — nje treg i vjeter 3-minutash e kalonte kontrollin dhe lojtari shihte
    // kuota para-goli. Tani matet freskia (lastOddsAt).
    const dbId = `lb-${extId}`;
    const row = await prisma.match.findUnique({ where: { id: dbId }, select: { lastOddsAt: true } });
    const lastAt = row?.lastOddsAt ? new Date(row.lastOddsAt).getTime() : 0;
    if (lastAt && Date.now() - lastAt < PRIORITY_FRESH_MS) return;

    // Prit deri në waitForOddsMs që të vijë dhe ruhet snapshot-i i kuotave nga feed-i
    await new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout;
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(() => {
        const arr = this.matchOddsWaiters.get(extId);
        if (arr) {
          const idx = arr.indexOf(done);
          if (idx !== -1) arr.splice(idx, 1);
        }
        resolve();
      }, waitForOddsMs);

      const arr = this.matchOddsWaiters.get(extId) || [];
      arr.push(done);
      this.matchOddsWaiters.set(extId, arr);
    });
  }

  /**
   * Abonimi i menjëhershëm (kuota te plota + info) i ndeshjes qe lojtari sapo hapi.
   * Pas Sleep Mode lidhja WS mund te jete ende duke u hapur: pa kete riprovim,
   * mesazhi humbiste dhe lojtari priste ciklin 20s.
   */
  private sendPrioritySub(extId: number, attempt = 0) {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('42' + JSON.stringify([
        'subscribe',
        { messageType: 'subscribe-match-odds', data: { matchIds: [extId], isBaseOddsGroups: false } }
      ]));
      ws.send('42' + JSON.stringify([
        'subscribe',
        { messageType: 'subscribe-match-info', data: { matchIds: [extId] } }
      ]));
      return;
    }
    if (attempt < 4) setTimeout(() => this.sendPrioritySub(extId, attempt + 1), 500);
  }

  /** Sinjalizon aktivitet përdoruesi (kërkesë HTTP ose lidhje WebSocket) */
  touch() {
    this.lastActiveTs = Date.now();
    if (this.isSleeping) {
      this.wakeUp();
    }
  }

  /** Përditëson numrin e lojtarëve online në kohë reale */
  setActiveUsers(count: number) {
    this.activeUsersCount = Math.max(0, count);
    if (this.activeUsersCount > 0) {
      this.touch();
    }
  }

  /** Kalon feed-in në gjumë: ndalon pyetjet në API dhe shkëput WS me LuckyBet */
  sleep() {
    if (this.isSleeping) return;
    this.isSleeping = true;
    console.log(`[LuckyBetFeed] Asnjë përdorues aktiv prej ${Math.round(LuckyBetFeed.IDLE_TIMEOUT_MS / 60000)} minutash -> Feed-i kalon në SLEEP MODE (pa kërkesa API).`);
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
    if (this.subTimer) { clearInterval(this.subTimer); this.subTimer = null; }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  /** Zgjon menjëherë feed-in dhe rinis transmetimin live */
  wakeUp() {
    if (!this.isSleeping && this.running && this.ws) return;
    this.isSleeping = false;
    this.lastActiveTs = Date.now();
    console.log('[LuckyBetFeed] Lojtar aktiv u detektua -> Feed-i u ZGJUA menjëherë (Wake Up)!');
    this.connectWs();
    if (!this.syncTimer) {
      this.syncTimer = setInterval(() => this.sync().catch((e) => console.error('[LuckyBetFeed] sync:', e)), 60 * 1000);
    }
    this.sync().catch(() => {});
  }

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

    // Diagnostike: nje rresht çdo 60s (gjithmone aktiv). Tregon menjehere nese WS-ja
    // jep te dhena dhe sa kuota shkruhen — pa kete, heshtja e feed-it nuk dallohej.
    const hb = setInterval(() => {
      console.log(
        `[Feed] 60s: oddsMsgs=${this.dbg.oddsMsgs} infoMsgs=${this.dbg.infoMsgs} shkruar=${this.dbg.oddsApplied}` +
          ` live=${this.liveIds.length} pending=${this.pendingOdds.size} busy=${this.oddsBusy.size} db=${this.dbActive}` +
          ` ws=${this.ws ? (this.ws as any).readyState : 'null'}(${this.wsState})` +
          ` heshtje=${this.lastWsMsgAt ? Math.round((Date.now() - this.lastWsMsgAt) / 1000) + 's' : '-'}`
      );
      this.dbg.oddsMsgs = 0;
      this.dbg.infoMsgs = 0;
      this.dbg.oddsApplied = 0;
      this.dbg.lastLog = Date.now();
    }, 60000);
    hb.unref();

    // Diagnostike e detajuar (aktivohet vetem me FEED_DEBUG=1)
    if (process.env.FEED_DEBUG === '1') {
      const t = setInterval(() => {
        const dt = Math.round((Date.now() - this.dbg.lastLog) / 1000);
        console.log(`[DBG] ${dt}s: oddsMsgs=${this.dbg.oddsMsgs} oddsApplied=${this.dbg.oddsApplied} infoMsgs=${this.dbg.infoMsgs} pending=${this.pendingOdds.size} busy=${this.oddsBusy.size} dbActive=${this.dbActive} live=${this.liveIds.length} ws=${this.ws ? (this.ws as any).readyState : 'null'}`);
        this.dbg.oddsMsgs = 0;
        this.dbg.oddsApplied = 0;
        this.dbg.infoMsgs = 0;
        this.dbg.lastLog = Date.now();
      }, 20000);
      t.unref();
    }

    // Kontrollon çdo 30 sekonda nëse nuk ka asnjë lojtar aktiv prej 3 minutash -> sleep
    this.idleCheckTimer = setInterval(() => {
      if (!this.running || this.isSleeping) return;
      if (this.activeUsersCount === 0 && Date.now() - this.lastActiveTs > LuckyBetFeed.IDLE_TIMEOUT_MS) {
        this.sleep();
      }
    }, 30 * 1000);
  }

  stop() {
    this.running = false;
    if (this.idleCheckTimer) { clearInterval(this.idleCheckTimer); this.idleCheckTimer = null; }
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
    if (this.subTimer) { clearInterval(this.subTimer); this.subTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
    console.log('[LuckyBetFeed] U ndal.');
  }

  onMatchEvent(cb: (event: MatchEvent) => void) { this.matchEventCbs.push(cb); }
  onPitchUpdate(cb: (state: PitchState) => void) { void cb; } // nuk ka tracker ne feed-in real
  onOddsUpdate(cb: (delta: OddsDelta) => void) { this.oddsCbs.push(cb); }
  onMatchStatusChange(cb: (matchId: string, status: string, minute: number, homeScore: number, awayScore: number, period?: string) => void) { this.statusCbs.push(cb); }

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
    if (this.isSleeping) return;
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
    // Kujtesa e tregjeve/kuotave mbahet vetem per ndeshjet qe jane ende ne feed
    this.pruneCaches();
    console.log(`[LuckyBetFeed] Sync: ${keep.size} ndeshje futbolli reale (${liveNew.length} live).`);


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
    // Statusi/emrat mund te kene ndryshuar ne DB → rreshti i caches nuk vlen me
    this.matchRowCache.delete(dbId);
  }


  /** Mbyll ndeshjen me score-in e fundit te njohur dhe gjykon bastet. */
  private async endMatch(extId: number) {
    const dbId = `lb-${extId}`;
    // Nuk ka me pse mbahen ne kujtes te dhenat e nje ndeshje te mbyllur
    this.marketCache.delete(dbId);
    this.matchRowCache.delete(dbId);
    this.pendingOdds.delete(dbId);
    this.pendingInfo.delete(dbId);
    const match = await prisma.match.findUnique({ where: { id: dbId } });
    if (!match || match.status === 'ENDED') return;
    this.liveIds = this.liveIds.filter(x => x !== extId);
    await BetSettler.settleMatch(dbId, match.homeScore ?? 0, match.awayScore ?? 0);
    console.log(`[LuckyBetFeed] ENDED ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`);
  }

  /**
   * Serializon perpunimin per nje ndeshje (kuota + info) NJE PER NJE. Pa kete,
   * dy mesazhe te njekoheshme per te njejten ndeshje krijonin tregje te dublikuara.
   * `priority: true` (ndeshja qe lojtari ka hapur) kalon para radhes normale te DB-se.
   */
  private enqueue(key: unknown, task: () => Promise<void>, label: string, priority = false) {
    const k = String(key ?? 'global');
    const prev = this.oddsQueue.get(k) || Promise.resolve();
    const next = prev
      .then(() => this.withDbSlot(task, priority))
      .catch((e) => console.error(`[LuckyBetFeed] ${label}:`, e.message));
    this.oddsQueue.set(k, next);
    return next;
  }

  /**
   * Shkruan tregjet dhe kuotat e nje ndeshjeje me 2 deklarata SQL
   * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING). Me pare: nje operacion Prisma per
   * çdo treg/kuote — me ~180 ndeshje live, qindra deklarata per ndeshje, qe e mbanin
   * DB-n minuta pas feed-it (matur: 3 perditesime ne 20s kundrejt 30 mesazheve/sek).
   * Id-te e verteta kthehen me RETURNING dhe sinkronizohen ne kujtes.
   */
  private async bulkWriteOdds(
    dbId: string,
    marketRows: { id: string; extId: string | null; marketType: string; name: string; sortOrder: number }[],
    outcomeRows: { id: string; marketName: string; name: string; code: string | null; odds: number; status: string }[]
  ): Promise<boolean> {
    try {
      for (let i = 0; i < marketRows.length; i += 200) {
        const values = marketRows
          .slice(i, i + 200)
          .map((m) => `(${this.sqlLit(m.id)}::text, ${this.sqlLit(dbId)}::text, ${m.extId ? `${this.sqlLit(m.extId)}::text` : 'NULL::text'}, ${this.sqlLit(m.marketType)}::text, ${this.sqlLit(m.name)}::text, 'ACTIVE'::text, ${Math.round(Number(m.sortOrder) || 0)}::int)`)
          .join(',');
        const rows = await prisma.$queryRawUnsafe<{ id: string; name: string; extId: string | null }[]>(
          `INSERT INTO "Market" (id, "matchId", "extId", "marketType", name, status, "sortOrder")
           VALUES ${values}
           ON CONFLICT ("matchId", name) DO UPDATE
             SET "extId" = COALESCE(EXCLUDED."extId", "Market"."extId"),
                 "marketType" = EXCLUDED."marketType",
                 "sortOrder" = EXCLUDED."sortOrder",
                 status = 'ACTIVE'
           RETURNING id, name, "extId"`
        );
        const cache = this.marketCache.get(dbId);
        if (cache) {
          for (const r of rows) {
            const m = cache.byName.get(String(r.name).trim());
            if (!m) continue;
            if (m.id !== r.id) m.id = r.id; // tregu ekzistonte me id tjeter → perditesohet ne kujtes
            if (r.extId) cache.byExtId.set(String(r.extId), m);
          }
        }
      }

      for (let i = 0; i < outcomeRows.length; i += 300) {
        const values = outcomeRows
          .slice(i, i + 300)
          .map((r) => `(${this.sqlLit(r.id)}::text, ${this.sqlLit(r.marketName)}::text, ${this.sqlLit(r.name)}::text, ${r.code ? `${this.sqlLit(r.code)}::text` : 'NULL::text'}, ${Number(r.odds) || 0}::double precision, ${this.sqlLit(r.status)}::text)`)
          .join(',');
        // Tregu identifikohet me (matchId, name) ne SQL → pa FK te gabuar kur tregu sapo u krijua
        const rows = await prisma.$queryRawUnsafe<{ id: string; name: string; marketId: string }[]>(
          `INSERT INTO "Outcome" (id, "marketId", name, code, odds, status)
           SELECT v.id, m.id, v.name, v.code, v.odds, v.status
             FROM (VALUES ${values}) AS v(id, mname, name, code, odds, status)
             JOIN "Market" m ON m."matchId" = ${this.sqlLit(dbId)} AND m.name = v.mname
           ON CONFLICT ("marketId", name) DO UPDATE
             SET odds = EXCLUDED.odds, status = EXCLUDED.status, code = COALESCE(EXCLUDED.code, "Outcome".code)
           RETURNING id, name, "marketId"`
        );
        const cache = this.marketCache.get(dbId);
        if (cache) {
          const byMarketId = new Map<string, any>();
          for (const m of cache.byName.values()) byMarketId.set(String(m.id), m);
          for (const r of rows) {
            const m = byMarketId.get(String(r.marketId));
            if (!m) continue;
            const o = (m.outcomes || []).find((x: any) => x.name === r.name);
            if (o && o.id !== r.id) o.id = r.id; // kuota ekzistonte me id tjeter
          }
        }
      }
      return true;
    } catch (e: any) {
      console.error('[LuckyBetFeed] bulkWriteOdds:', e?.message || e);
      return false;
    }
  }

  /** Literal i sigurt SQL (brenda nje deklarate qe ndertohet nga te dhena tona). */
  private sqlLit(value: string) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Rruga rezerve e shkrimit (si me pare): rresht-per-rresht me Prisma. Perdoret vetem
   * nese shkrimi ne bllok deshton, qe kuotat te shkruhen ne cdo ambient.
   */
  private async fallbackWriteOdds(
    dbId: string,
    marketRows: { id: string; extId: string | null; marketType: string; name: string; sortOrder: number }[],
    outcomeRows: { id: string; marketName: string; name: string; code: string | null; odds: number; status: string }[]
  ): Promise<boolean> {
    try {
      for (const m of marketRows) {
        await prisma.market.upsert({
          where: { matchId_name: { matchId: dbId, name: m.name } },
          create: {
            id: m.id,
            matchId: dbId,
            extId: m.extId,
            marketType: m.marketType,
            name: m.name,
            status: 'ACTIVE',
            sortOrder: m.sortOrder
          },
          update: {
            extId: m.extId ?? undefined,
            marketType: m.marketType,
            sortOrder: m.sortOrder,
            status: 'ACTIVE'
          }
        });
      }
      if (!outcomeRows.length) return true;

      const markets = await prisma.market.findMany({ where: { matchId: dbId }, select: { id: true, name: true } });
      const idByName = new Map(markets.map((m) => [String(m.name).trim(), m.id]));
      for (const o of outcomeRows) {
        const marketId = idByName.get(String(o.marketName).trim());
        if (!marketId) continue;
        await prisma.outcome.upsert({
          where: { marketId_name: { marketId, name: o.name } },
          create: { id: o.id, marketId, name: o.name, code: o.code, odds: o.odds, status: o.status },
          update: { odds: o.odds, status: o.status, ...(o.code ? { code: o.code } : {}) }
        });
      }
      console.log(`[LuckyBetFeed] Shkrim rezerve: ${marketRows.length} tregje + ${outcomeRows.length} kuota (${dbId})`);
      return true;
    } catch (e: any) {
      console.error('[LuckyBetFeed] fallbackWriteOdds:', e?.message || e);
      return false;
    }
  }

   /**
   * Radhe globale mbi punen me DB: nuk lejohen me shume se MAX_DB_TASKS detyra
   * njekohesisht. Pa kete, qindra snapshot-e e mbushin pool-in e Prisma-s dhe
   * te gjitha pyetjet deshtojne me "Timed out fetching a new connection".
   */
  private async withDbSlot<T>(fn: () => Promise<T>, priority = false): Promise<T> {
    while (this.dbActive >= LuckyBetFeed.MAX_DB_TASKS) {
      await new Promise<void>((resolve) => (priority ? this.dbWaitersHigh : this.dbWaiters).push(resolve));
    }
    this.dbActive++;
    try {
      return await fn();
    } finally {
      this.dbActive--;
      // Radha prioritare (ndeshja qe lojtari ka hapur) kalon e para ne slotin e DB-se.
      const next = this.dbWaitersHigh.shift() || this.dbWaiters.shift();
      if (next) next();
    }
  }

  /** Lidhet me push-server dhe pergjigjet protokollit engine.io/socket.io. */
  private connectWs() {
    if (this.ws) return;
    const url = `wss://${HOST}/push-server-v2/?Language=${LANG}&externalPartnerId=${PARTNER}&EIO=4&transport=websocket`;
    // Lidhja qe nuk hapet kurre (SYN i bllokuar nga burimi) mbahej "CONNECTING" per ore
    // te tera pa asnje gabim e pa asnje te dhene → tani ka afat 20s dhe rifreskohet.
    let connectTimer: NodeJS.Timeout | null = setTimeout(() => {
      console.warn('[LuckyBetFeed] WS nuk u hap brenda 20s -> lidhja rifreskohet');
      try { ws.terminate(); } catch { /* ignore */ }
    }, 20000);
    connectTimer.unref?.();
    let watchdog: NodeJS.Timeout | null = null;
    const clearTimers = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
    };
    const reconnect = (why: string) => {
      if (this.ws !== ws) return; // ekziston nje lidhje me e re
      clearTimers();
      this.ws = null;
      this.wsState = `closed(${why})`;
      if (!this.running || this.isSleeping) return;
      console.log(`[LuckyBetFeed] WS u mbyll: ${why} — rilidhje pas 5s`);
      setTimeout(() => {
        if (!this.isSleeping && this.running) this.connectWs();
      }, 5000);
    };
    const ws: WebSocket = new WebSocket(url, { headers: { Origin: 'https://bitgames6205.com' } });
    this.ws = ws;
    this.wsState = 'connecting';

    ws.on('open', () => {
      this.wsState = 'open';
      this.lastWsMsgAt = Date.now();
      console.log('[LuckyBetFeed] WS OPEN — handshake i derguar, po abonohemi...');
      ws.send('40');
    });
    ws.on('message', (raw: Buffer) => {
      this.lastWsMsgAt = Date.now();
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

      const extId = Number(msg.data?.matchId);
      const dbId = Number.isFinite(extId) && extId > 0 ? `lb-${extId}` : '';
      if (msg.messageType === 'match-odds-snapshot' || msg.messageType === 'match-odds') {
        this.dbg.oddsMsgs++;
        // Koalescim: bashkohet me gjendjen e prapapërpunuar (pa humbur grupe) dhe shkruhet
        // ne DB vetem gjendja me e re. Me pare çdo mesazh hynte ne radhe → me 176 ndeshje
        // live radha mbushej dhe kuotat shfaqeshin minuta pas feed-it.
        this.mergePendingOdds(dbId || 'odds', msg.data || {});
        this.pumpMatch(dbId || 'odds');
      } else if (msg.messageType === 'match-info-snapshot' || msg.messageType === 'match-info') {
        this.dbg.infoMsgs++;
        // Koalescim edhe per info (score/minutë/status): mbahet gjendja me e re e bashkuar,
        // perndryshe çdo mesazh bënte nje lexim + nje shkrim ne DB dhe mbyste pool-in.
        this.pendingInfo.set(dbId || 'info', { ...(this.pendingInfo.get(dbId || 'info') || {}), ...(msg.data || {}) });
        this.pumpMatch(dbId || 'info');
      }
    });
    ws.on('close', (code: number) => reconnect(`close ${code}`));
    ws.on('error', (err: Error) => {
      console.error('[LuckyBetFeed] WS error:', err.message);
      try { ws.close(); } catch { /* ignore */ }
    });
    // Nese per 2 minuta nuk vjen asnje mesazh ndersa lidhja eshte "open" (lidhje zombie),
    // lidhja rifreskohet. Me pare nje lidhje e tille mbetesh bosh pa asnje gabim.
    watchdog = setInterval(() => {
      if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastWsMsgAt > 120000) {
        console.warn('[LuckyBetFeed] WS heshtje > 2 minuta -> lidhja rifreskohet');
        try { ws.terminate(); } catch { /* ignore */ }
      }
    }, 30000);
    watchdog.unref?.();

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
    if (this.isSleeping) return;
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

    const priority = Array.from(this.priorityIds);
    const fullSubs = Array.from(new Set([...live, ...priority]));

    this.sendSub(fullSubs, false);   // live + priority: te gjitha grupet + info
    this.sendSub(near, false);       // prematch i afert: te gjitha grupet
    this.sendSub(rest, true);        // pjesa tjeter: vetem grupet baze
    if (fullSubs.length) this.sendInfo(fullSubs);
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
    const cur = await this.matchRow(dbId);
    if (!cur || cur.status === 'ENDED') return;

    const raw = Number(d.matchTime ?? d.minute ?? 0);
    let minute = raw > 1000 ? Math.floor(raw / 60000) : raw;
    const isBreak = /break|half-?time|ht/i.test(st);
    if (!minute || minute <= 0) {
      if (isBreak) {
        minute = 45;
      } else {
        const curMin = cur.currentMinute ?? 0;
        minute = curMin > 0 ? curMin : 1;
      }
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
    const periodChanged = st ? st !== cur.period : false;
    const finalPeriod = st || cur.period || '';

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
    // Ruhet edhe "matchTime" i feed-it + ora e marrjes: baza e minutave te ekstrapoluara.
    const feedTimePatch = raw > 0 ? { feedMatchTimeMs: raw, feedTimeAt: new Date() } : {};
    const updated = await prisma.match.update({
      where: { id: dbId },
      data: {
        homeScore: s1,
        awayScore: s2,
        currentMinute: Number.isFinite(minute) ? minute : cur.currentMinute,
        period: finalPeriod,
        status: finalStatus,
        isSuspended: scoreChanged ? true : cur.isSuspended,
        ...feedTimePatch,
        ...sts
      }
    });
    // Rreshti i freskët ne kujtes (per applyOdds dhe per minutat e ekstrapoluara)
    this.matchRowCache.set(dbId, { row: updated, ts: Date.now() });
    // Ruaj "ts" e fundit te aplikuar — baza e renditjes per mesazhet e ardhshme
    if (ts > 0) this.infoTs.set(dbId, ts);
    if (scoreChanged) {
      this.suspendedAt.set(dbId, Date.now());
      console.log(`[LuckyBetFeed] GOL ${cur.homeTeam} ${s1}-${s2} ${cur.awayTeam} → kuotat pezulluar përkohësisht`);
    }
    if (scoreChanged || statusChanged || minuteChanged || periodChanged) {
      // Lojtaret marrin minutën e ekstrapoluar (jo vlerën e vjetër, që mbetet mes push-eve)
      const liveMin = derivedMinute(updated);
      for (const cb of this.statusCbs) cb(dbId, finalStatus, liveMin, s1, s2, finalPeriod);
    }
    if (ended) await this.endMatch(extId);
  }

  /** A eshte ndeshja ne listen prioritare (lojtari e ka hapur ne faqe)? */
  private isPriorityId(extId: number) {
    return Number.isFinite(extId) && this.priorityIds.has(extId);
  }

  private isPriorityDbId(dbId: string) {
    return this.isPriorityId(Number(dbId.slice(3)));
  }

  /** A eshte ndeshje LIVE? Kuotat e saj duhet te shkruhen PARA prematch-it (ato levizin me shpejt). */
  private isLiveDbId(dbId: string) {
    const extId = Number(dbId.slice(3));
    return Number.isFinite(extId) && this.liveIds.includes(extId);
  }

  /** Çelësi i nje grupi kuotash: id-ja e feed-it (ose emri si rezervë). */
  private groupKey(g: Dict) {
    return g?.id != null ? `id:${g.id}` : `name:${String(g?.name || '').trim()}`;
  }

  /**
   * Bashkon mesazhet e kuotave te nje ndeshjeje pa humbur asnje grup: grupet e
   * njejte zevendesohen me versionin me te re, te rejat shtohen. Keshtu nje mesazh
   * i ndermjetem mund te kalohet (koalescim) pa humbur informacion.
   */
  private mergePendingOdds(dbId: string, data: Dict) {
    const prev = this.pendingOdds.get(dbId);
    if (!prev) {
      this.pendingOdds.set(dbId, { ...data, oddsGroups: Array.from(data.oddsGroups || []) });
      return;
    }
    const groups: any[] = Array.from(prev.oddsGroups || []);
    const index = new Map<string, number>();
    groups.forEach((g, i) => index.set(this.groupKey(g), i));
    for (const g of (data.oddsGroups || []) as Dict[]) {
      const k = this.groupKey(g);
      const at = index.get(k);
      if (at === undefined) {
        index.set(k, groups.length);
        groups.push(g);
      } else {
        groups[at] = g;
      }
    }
    this.pendingOdds.set(dbId, { ...prev, ...data, oddsGroups: groups });
  }

  /**
   * Pompa per-ndeshje: perpunon NJE gjendje ne fluturim — info (score/minutë) pastaj kuotat,
   * te dyja te bashkuara. Nese gjate shkrimit vijne mesazhe te reja, ato bashkohen dhe
   * shkruhen nje here — pa radhe qe vonon minuta (me ~180 ndeshje live, ~30 mesazhe/sek).
   */
  private pumpMatch(dbId: string) {
    if (this.oddsBusy.has(dbId)) return;
    this.oddsBusy.add(dbId);
    // Kuotat LIVE (dhe ndeshja e hapur nga lojtari) kalojne PARA radhes se prematch-it:
    // pa kete, radha mbushet me prematch dhe kuotat live freskohen me vonese minutash.
    const prio = this.isPriorityDbId(dbId) || this.isLiveDbId(dbId);
    void (async () => {
      try {
        while (this.pendingInfo.has(dbId) || this.pendingOdds.has(dbId)) {
          if (this.pendingInfo.has(dbId)) {
            const info = this.pendingInfo.get(dbId)!;
            this.pendingInfo.delete(dbId);
            await this.enqueue(dbId, () => this.applyInfo(info), 'applyInfo', prio);
          }
          if (this.pendingOdds.has(dbId)) {
            const data = this.pendingOdds.get(dbId)!;
            this.pendingOdds.delete(dbId);
            await this.enqueue(dbId, () => this.applyOdds(data), 'applyOdds', prio);
          }
        }
      } catch (e: any) {
        console.error('[LuckyBetFeed] pumpMatch:', e?.message || e);
      } finally {
        this.oddsBusy.delete(dbId);
      }
    })();
  }

  /** Rreshti i ndeshjes nga kujtesa (status/pezullim) — pa nje findUnique per çdo mesazh. */
  private async matchRow(dbId: string) {
    const cached = this.matchRowCache.get(dbId);
    if (cached && Date.now() - cached.ts < MATCH_CACHE_TTL_MS) return cached.row;
    const row = await prisma.match.findUnique({ where: { id: dbId } });
    if (row) this.matchRowCache.set(dbId, { row, ts: Date.now() });
    return row;
  }

  /** Hartat e tregjeve/kuotave (extId/emri) — ngarkohen nga DB here pas here, jo per mesazh. */
  private async marketMaps(dbId: string) {
    const cached = this.marketCache.get(dbId);
    if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS) return cached;
    const markets = await prisma.market.findMany({
      where: { matchId: dbId },
      include: { outcomes: { select: { id: true, name: true, odds: true, code: true, status: true } } }
    });
    const byExtId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const m of markets) {
      if (m.extId) byExtId.set(String(m.extId), m);
      if (m.name) byName.set(String(m.name).trim(), m);
    }
    const entry = { byExtId, byName, ts: Date.now() };
    this.marketCache.set(dbId, entry);
    return entry;
  }

  /** Heq nga kujtesa te dhenat e ndeshjeve qe nuk jane me ne feed (memorie e kufizuar). */
  private pruneCaches() {
    const alive = new Set([...this.liveIds, ...this.prematchIds].map((id) => `lb-${id}`));
    for (const key of Array.from(this.marketCache.keys())) if (!alive.has(key)) this.marketCache.delete(key);
    for (const key of Array.from(this.matchRowCache.keys())) if (!alive.has(key)) this.matchRowCache.delete(key);
    for (const key of Array.from(this.pendingOdds.keys())) if (!alive.has(key)) this.pendingOdds.delete(key);
    for (const key of Array.from(this.pendingInfo.keys())) if (!alive.has(key)) this.pendingInfo.delete(key);
  }

  /**
   * Shkruan te gjitha grupet e kuotave (snapshot/update) ne DB dhe njofton lojtaret.
   *
   * RENDITJA KA RENDESI: deltat per lojtaret dergohen MENJEHERE (nga kujtesa), pastaj
   * ruhen ne DB. Keshtu faqja leviz ne çast si faqja origjinale, edhe kur shkrimi
   * ne DB zgjat (me pare delta priste shkrimin ne DB → vonese minuta).
   */
  private async applyOdds(d: Dict) {
    const extId = Number(d.matchId);
    const dbId = `lb-${extId}`;
    const match = await this.matchRow(dbId);
    if (!match || match.status === 'ENDED') return;

    const groups: Dict[] = (d.oddsGroups || []) as Dict[];
    const deltas: { outcomeId: string; oldOdds: number; newOdds: number; status: string }[] = [];

    // Tregjet/kuotat ekzistuese nga kujtesa (nje findMany per minutе, jo per mesazh)
    const cache = await this.marketMaps(dbId);
    const byExtId = cache.byExtId;
    const byName = cache.byName;
    // Grumbullohen te gjitha ndryshimet dhe shkruhen me 2 deklarata SQL (jo nje per rresht)
    const marketRows: { id: string; extId: string | null; marketType: string; name: string; sortOrder: number }[] = [];
    const outcomeRows: { id: string; marketName: string; name: string; code: string | null; odds: number; status: string }[] = [];
    let marketCount = byExtId.size;

    for (const g of groups) {
      const rawName = String(g.name || '').trim();
      if (!rawName) continue; // grup pa emer (feed-i nuk jep) — nuk mund te shfaqet
      if (isJunkGroup(rawName)) continue; // dublikatat "Early payout" nuk krijohen me

      const marketType = marketTypeOf(rawName);
      const groupExtId = g.id != null ? String(g.id) : null;

      // Identiteti: shiko sipas extId ose emrit (emri eshte unik per ndeshjen ne DB)
      let market: any = groupExtId ? byExtId.get(groupExtId) : undefined;
      if (!market) market = byName.get(rawName);

      const targetSortOrder = marketType === '1X2' ? 0 : (10 + marketCount);
      if (!market) {
        const id = randomUUID();
        marketCount++;
        market = { id, matchId: dbId, extId: groupExtId, name: rawName, marketType, status: 'ACTIVE', outcomes: [] };
        marketRows.push({ id, extId: groupExtId, marketType, name: rawName, sortOrder: targetSortOrder });
        if (groupExtId) byExtId.set(groupExtId, market);
        byName.set(rawName, market); // Kyçe: parandalon dy tregje me te njejtin emer ne te njejtin batch!
      } else {
        // Tregu ekziston: shkruhet vetem ajo qe ka ndryshuar (extId/tipi/statusi)
        let changed = false;
        if (groupExtId && !market.extId) { market.extId = groupExtId; byExtId.set(groupExtId, market); changed = true; }
        if (market.marketType !== marketType) { market.marketType = marketType; changed = true; }
        if (market.status !== 'ACTIVE') { market.status = 'ACTIVE'; changed = true; }
        if (changed) {
          marketRows.push({
            id: market.id,
            extId: market.extId ?? null,
            marketType,
            name: rawName,
            sortOrder: marketType === '1X2' ? 0 : (Number(market.sortOrder) || targetSortOrder)
          });
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
          const fresh = { id, name: outName, code: code || null, odds, status: 'ACTIVE' };
          known.set(outName, fresh);
          market.outcomes.push(fresh); // keshtu nuk rikrijohet ne mesazhin e ardhshem
          outcomeRows.push({ id, marketName: market.name, name: outName, code: code || null, odds, status: 'ACTIVE' });
        } else if (!hasOdds) {
          if (outcome.status !== 'SUSPENDED') {
            outcomeRows.push({ id: outcome.id, marketName: market.name, name: outName, code: null, odds: outcome.odds, status: 'SUSPENDED' });
            deltas.push({ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: outcome.odds, status: 'SUSPENDED' });
            outcome.status = 'SUSPENDED';
          }
        } else if (outcome.status !== 'ACTIVE') {
          outcomeRows.push({ id: outcome.id, marketName: market.name, name: outName, code: code && !outcome.code ? code : null, odds, status: 'ACTIVE' });
          deltas.push({ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: odds, status: 'ACTIVE' });
          outcome.status = 'ACTIVE';
          outcome.odds = odds;
          if (code) outcome.code = code;
        } else if (outcome.odds !== odds || (!outcome.code && code)) {
          // Rifresko kuoten DHE ploteso kodin nese mungon (backfill i rreshtave te vjeter)
          outcomeRows.push({ id: outcome.id, marketName: market.name, name: outName, code: code && !outcome.code ? code : null, odds, status: 'ACTIVE' });
          if (outcome.odds !== odds) {
            deltas.push({ outcomeId: outcome.id, oldOdds: outcome.odds, newOdds: odds, status: 'ACTIVE' });
          }
          outcome.odds = odds;
          if (code) outcome.code = code;
        }
      }
    }

    // 1) Lojtaret njoftohen MENJEHERE (nga kujtesa) — pa pritur shkrimin ne DB.
    if (deltas.length) {
      const delta = { matchId: dbId, outcomes: deltas } as OddsDelta;
      for (const cb of this.oddsCbs) cb(delta);
    }

    // Nese nuk ka asnje ndryshim (dhe kuotat jane prekur se fundmi) → pa asnje deklarate SQL.
    // Me 200 ndeshje live, shumica e mesazheve perserisin gjendjen e njejte.
    const hasChanges = marketRows.length > 0 || outcomeRows.length > 0;
    const lastTouch = match.lastOddsAt ? new Date(match.lastOddsAt).getTime() : 0;
    if (!hasChanges && Date.now() - lastTouch < LAST_ODDS_TOUCH_MS) {
      this.notifyOddsWaiters(extId);
      return;
    }

    // 2) Shkrimi ne DB: tregjet + kuotat me nga NJE deklarate SQL (pa nje operacion per rresht).
    //    Nese shkrimi ne bllok deshton (problem lidhjeje ne hosting), kalon ne rrugen e
    //    vjeter rresht-per-rresht — kuotat NUK humbin kurre.
    let savedOk = await this.bulkWriteOdds(dbId, marketRows, outcomeRows);
    if (!savedOk) {
      savedOk = await this.fallbackWriteOdds(dbId, marketRows, outcomeRows);
      this.marketCache.delete(dbId); // id-te mund te kene ndryshuar -> ringarkohen
    }

    // Freskia (lastOddsAt) + ç-pezullimi nese ishte pezulluar per gol — PËRVEÇ nese admini
    // e ka pezulluar manualisht (bllokimi i adminit mbetet derisa ai vetë ta heqë).
    const needUnsuspend = match.isSuspended && !match.manualSuspended;
    try {
      await prisma.match.update({
        where: { id: dbId },
        data: { lastOddsAt: new Date(), ...(needUnsuspend ? { isSuspended: false } : {}) }
      });
    } catch { /* ndeshja mund te jete mbyllur nderkohe nga procesi tjeter */ }

    if (needUnsuspend) {
      match.isSuspended = false;
      this.suspendedAt.delete(dbId);
    }
    match.lastOddsAt = new Date();
    this.dbg.oddsApplied++;

    // Njofto kërkesat që po prisnin në HTTP (prioritizeMatch) — DB-ja tani i ka kuotat e reja
    this.notifyOddsWaiters(extId);
  }

  /** Zgjon kerkesat HTTP qe presin kuotat e freskëta te nje ndeshjeje (prioritizeMatch). */
  private notifyOddsWaiters(extId: number) {
    const waiters = this.matchOddsWaiters.get(extId);
    if (waiters && waiters.length) {
      this.matchOddsWaiters.delete(extId);
      waiters.forEach((w) => w());
    }
  }
}
