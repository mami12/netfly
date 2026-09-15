/**
 * LUCKYBET FEED PROBE  (gw-lucky-bet / api-gateway.gw-lucky-bet.com)
 * ------------------------------------------------------------------
 * Provon live feed-in që ushqen bitgames6205.com:
 *   1) POST /matches/get-many   -> lista e ndeshjeve (ID-të) për FUTBOLL VETËM
 *   2) wss  /push-server-v2/    -> kuotat live (match-odds-snapshot) + score (match-info-snapshot)
 *
 * Ekzekutimi:   npx tsx luckybet-probe.ts
 * Opsionale:    LUCKYBET_PARTNER_ID=...  LUCKYBET_API_HOST=...  LUCKYBET_LANGUAGE=en-001
 *               LUCKYBET_WATCH_MS=20000  (sa ms të dëgjohet websocket-i)
 *
 * Dokumentimi i plotë: ../docs/LUCKYBET-FEED-API.md
 */
import https from 'https';
import WebSocket from 'ws';

const API_HOST = process.env.LUCKYBET_API_HOST || 'api-gateway.gw-lucky-bet.com';
const PARTNER_ID = process.env.LUCKYBET_PARTNER_ID || 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f';
const LANGUAGE = process.env.LUCKYBET_LANGUAGE || 'en-001';
const WATCH_MS = Number(process.env.LUCKYBET_WATCH_MS || 20000);

const FOOTBALL_SPORT_ID = 18;
/** Kategoritë e futbollit që NUK janë futboll real (virtuale / replay / long-term). */
const BLOCKED_CATEGORIES = new Set(['cyberfifa', 'replays', 'ereplays', 'short-football', 'world']);

type Dict = Record<string, any>;

interface FootballMatch {
  id: number;
  name: string;
  slug: string;
  sportId: number;
  service: string;
  startAt: number;
  category: { id: number; slug: string };
  tournament: { id: number; slug: string };
  homeTeam?: { name: string };
  awayTeam?: { name: string };
  isHot?: boolean;
}

function request(method: 'GET' | 'POST', path: string, body?: Dict): Promise<Dict> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Dict = {
      accept: 'application/json',
      'x-lang': LANGUAGE,
      'x-external-partner-id': PARTNER_ID
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request(
      { host: API_HOST, path: `${path}${path.includes('?') ? '&' : '?'}l=${LANGUAGE}&p=${PARTNER_ID}`, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`${method} ${path} -> HTTP ${res.statusCode} ${raw.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`${method} ${path} -> përgjigje jo-JSON: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const apiGet = (path: string) => request('GET', path);
const apiPost = (path: string, body: Dict = {}) => request('POST', path, body);

function isRealFootball(m: FootballMatch): boolean {
  return m.sportId === FOOTBALL_SPORT_ID && !BLOCKED_CATEGORIES.has(m.category?.slug);
}

function line(m: FootballMatch): string {
  return `  id=${m.id}  ${m.service.padEnd(8)} [${m.category.slug}/${m.tournament.slug}]  ${m.name}  start=${new Date(m.startAt * 1000).toISOString()}`;
}

async function main(): Promise<void> {
  console.log(`\n=== LUCKYBET FEED PROBE ===  host=${API_HOST}  partner=${PARTNER_ID}\n`);

  // 1) Të gjitha sportet (verifikon kredencialet + tregon sportId-n e futbollit)
  const sports = await apiPost('/sports/get-many', {});
  const football = (sports.result?.items || []).find((s: Dict) => s.sport.id === FOOTBALL_SPORT_ID);
  console.log(
    `Sporte gjithsej: ${sports.result?.items?.length}  |  Futboll: id=${football?.sport.id} slug=${football?.sport.slug} ndeshje aktive=${football?.activeMatchesCount}`
  );
  const liveSports = await apiPost('/sports/get-many', { service: 'live' });
  const footballLive = (liveSports.result?.items || []).find((s: Dict) => s.sport.id === FOOTBALL_SPORT_ID);
  console.log(`Prej tyre LIVE: futboll=${footballLive?.activeMatchesCount}\n`);

  // 2) URL KRYESORE: ID-të e ndeshjeve (futboll vetëm)
  const body = { sportId: FOOTBALL_SPORT_ID, limit: 500, excludeSportType: ['polybet', 'racing', 'esport'] };
  const liveRes = await apiPost('/matches/get-many', { ...body, service: 'live' });
  const preRes = await apiPost('/matches/get-many', { ...body, service: 'prematch' });

  const liveAll: FootballMatch[] = liveRes.result?.items || [];
  const preAll: FootballMatch[] = preRes.result?.items || [];
  const liveReal = liveAll.filter(isRealFootball);
  const preReal = preAll.filter(isRealFootball);

  console.log(`POST /matches/get-many  {sportId:18, service:"live",     limit:500} -> ${liveAll.length} (futboll real: ${liveReal.length})`);
  console.log(`POST /matches/get-many  {sportId:18, service:"prematch", limit:500} -> ${preAll.length} (futboll real: ${preReal.length})`);
  console.log(`U hoqën si virtuale/replay: ${liveAll.length + preAll.length - liveReal.length - preReal.length}\n`);

  console.log('FUTBOLL REAL — LIVE:');
  liveReal.slice(0, 6).forEach((m) => console.log(line(m)));
  if (!liveReal.length) console.log('  (asnjë në këtë moment)');
  console.log('\nFUTBOLL REAL — PREMATCH (6 të parat sipas fillimit):');
  preReal
    .slice()
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, 6)
    .forEach((m) => console.log(line(m)));

  // 3) Kuotat + score live nga websocket-i
  const watch = (liveReal.length ? liveReal : preReal).slice(0, 5);
  if (!watch.length) {
    console.log('\nNuk ka ndeshje futbolli për t’u abonuar. Dil.');
    return;
  }
  const ids = watch.map((m) => m.id);
  const detail = await apiGet(`/matches/get?matchId=${ids[0]}`);
  console.log(`\nGET /matches/get?matchId=${ids[0]} -> "${detail.result?.name}" (closed=${detail.result?.closed})`);
  console.log(`\n=== WebSocket: abonohu për ${ids.length} ndeshje -> ${ids.join(', ')} ===`);
  await watchOdds(ids);
}

/**
 * Lidhet me push-server-v2 (Socket.IO v4) dhe dëgjon:
 *   subscribe-match-info -> match-info-snapshot / match-info   (score + statusi)
 *   subscribe-match-odds -> match-odds-snapshot / match-odds   (kuotat: cf)
 */
function watchOdds(matchIds: number[]): Promise<void> {
  return new Promise((resolve) => {
    const url = `wss://${API_HOST}/push-server-v2/?Language=${LANGUAGE}&externalPartnerId=${PARTNER_ID}&EIO=4&transport=websocket`;
    const ws = new WebSocket(url, { headers: { Origin: 'https://bitgames6205.com' } });
    const oddsCount = new Map<number, number>();
    const statusById = new Map<number, string>();
    let subscribed = false;

    ws.on('open', () => console.log('  websocket: OPEN'));

    ws.on('message', (raw) => {
      const frame = raw.toString();

      // Handshake EIO=4
      if (frame.startsWith('0{')) {
        ws.send('40'); // hap namespace-in
        return;
      }
      if (frame.startsWith('40{')) {
        if (subscribed) return;
        subscribed = true;
        const send = (messageType: string, data: Dict) =>
          ws.send(`42["subscribe",${JSON.stringify({ messageType, data })}]`);
        console.log('  subscribe-match-info + subscribe-match-odds');
        send('subscribe-match-info', { matchIds });
        send('subscribe-match-odds', { matchIds, isBaseOddsGroups: true });
        return;
      }
      if (frame === '2') {
        ws.send('3'); // pong
        return;
      }
      if (!frame.startsWith('42')) return;

      let parsed: any;
      try {
        parsed = JSON.parse(frame.slice(2));
      } catch {
        return;
      }
      // Formatet: 42["u",{payload},"ack"]  ose  42["event",{payload}]
      const payload = Array.isArray(parsed) && parsed[0] === 'u' ? parsed[1] : parsed[0];
      const type: string = payload?.messageType || '';
      const data: Dict = payload?.data || {};
      const matchId: number = data.matchId;

      if (type === 'match-info-snapshot' || type === 'match-info') {
        if (data.status) statusById.set(matchId, data.status);
        const score = data.matchScore ? `${data.matchScore.t1}-${data.matchScore.t2}` : '-';
        console.log(
          `  [INFO]  ${type}  match=${matchId}  status=${data.status ?? statusById.get(matchId) ?? '-'}  score=${score}`
        );
      }

      if (type === 'match-odds-snapshot' || type === 'match-odds') {
        const groups: Dict[] = data.oddsGroups || [];
        const odds = groups.reduce((acc, g) => acc + (g.oddsList?.length || 0), 0);
        const total = (oddsCount.get(matchId) || 0) + odds;
        oddsCount.set(matchId, total);
        const sample = groups
          .flatMap((g) => (g.oddsList || []).map((o: Dict) => `${o.name ?? o.outcome}@${o.cf}`))
          .slice(0, 4)
          .join(', ');
        console.log(
          `  [ODDS]  ${type}  match=${matchId}  grupe=${groups.length}  kuota=${odds}  (gjithsej ${total})${sample ? '  | ' + sample : ''}`
        );
      }
    });

    ws.on('error', (err) => console.log('  websocket ERROR: ' + err.message));

    setTimeout(() => {
      console.log('\n--- PËRMBLEDHJE ---');
      for (const id of matchIds) {
        console.log(`  match ${id}: status=${statusById.get(id) ?? '?'}  kuota të marra=${oddsCount.get(id) ?? 0}`);
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, WATCH_MS);
  });
}

main()
  .then(() => {
    console.log('\nOK — feed-i u provua me sukses.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nGABIM: ' + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });