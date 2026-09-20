/**
 * Etiketat shqip për tregjet dhe opsionet e kuotave.
 *
 * Emrat vijnë në anglisht nga burimi i të dhënave (p.sh. "Full time result",
 * "Corners. Total goals", "Kuching FA exact number of goals scored"). Radha:
 *   1) fjalori i tregjeve (i18n `markets`) — kërkohet me `tm`, sepse këta emra
 *      përmbajnë pikë dhe `t()` i ndan çelësat me pikë (prandaj "Corners. Total"
 *      përkthehej "Corners. — total gola")
 *   2) modelet për emrat dinamikë (ekipi/numrat/kohët brenda emrit)
 *   3) prefiksi i njohur + pjesa e mbetur ("Corners. Race to 3")
 *   4) në fund emri origjinal — KURRË një çelës si "markets.xyz"
 */
type TFunc = (key: string, fallback?: string) => string;
/** Kërkim i drejtpërdrejtë në fjalorin e tregjeve, pa ndarje me pikë (shih LanguageContext.tm). */
type TmFunc = (name: string) => string;

/** Hapësira të vetme + pa pikë në fund: "Corners.  Total." -> "Corners. Total" */
export const normalizeName = (s: unknown) =>
  String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2122\u2116\u00ae\u00a9]/g, '') // shenjat e feed-it (™, №) nuk ndajne emrin
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .trim();

/** Çelësi i kërkimit në fjalor (i vogël + i normalizuar). */
export const nameKey = (s: unknown) => normalizeName(s).toLowerCase();

const sp = (s: unknown) =>
  String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2122\u2116\u00ae\u00a9]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Fjala e parë e emrit me pikë ("Corners.", "1st half.", "Yellow cards."). */
const PREFIX: Record<string, string> = {
  corners: 'Kornera',
  'yellow cards': 'Kartonë të Verdhë',
  cards: 'Kartonë',
  bookings: 'Kartonë',
  fouls: 'Faulla',
  offsides: 'Ofsajd',
  shots: 'Goditje',
  'shots all': 'Goditje Gjithsej',
  'shots on target': 'Goditje në Portë',
  player: 'Lojtari',
  '1st half': 'Pjesa 1',
  '2nd half': 'Pjesa 2',
  overtime: 'Shtesë',
  'penalty shootout': 'Penallti'
};

/** Pjesa pas pikës -> shqip ("Total", "Result", "Race to 3"...). Ruhet shkrimi i emrit. */
function tailTranslation(tailRaw: string): string {
  const raw = sp(tailRaw);
  const k = nameKey(raw);
  const fixed: Record<string, string> = {
    total: 'Total Gola',
    'total goals': 'Total Gola',
    result: 'Rezultati',
    handicap: 'Handikap',
    'double chance': 'Shans i Dyfishtë',
    'odd/even': 'Çift/Tek',
    'even/odd': 'Çift/Tek',
    'correct score': 'Rezultati i Saktë',
    'exact number of goals': 'Numri i Saktë i Golave',
    'exact number of goals scored': 'Numri i Saktë i Golave',
    'winning margin': 'Diferenca e Golave',
    'time of scoring': 'Koha e Golit',
    'result and total': 'Rezultati & Total',
    'both teams to score': 'Të Dyja Shënojnë',
    'to qualify': 'Kualifikimi',
    'to nil': 'Fitore pa Pësuar Gol',
    'team to earn the corner': 'Ekipi që Fiton Kornerin',
    '3-way betting': 'Rezultati (1X2)',
    'three-way betting': 'Rezultati (1X2)',
    'next player to score': 'Lojtari i Radhës që Shënon',
    'team to score the goal': 'Skuadra që Shënon Golin',
    'race to n goals': 'Gara deri në N gola',
    'race to n': 'Gara deri në N gola',
    'team to score': 'Skuadra që Shënon',
    'anytime goalscorer': 'Shënuesi i Çdo Momenti',
    'first goalscorer': 'Shënuesi i Golit të Parë'
  };
  if (fixed[k]) return fixed[k];

  let m: RegExpMatchArray | null;
  if ((m = raw.match(/^race to (\d+) goals?$/i))) return `Gara deri në ${m[1]} gola`;
  if ((m = raw.match(/^race to (\d+)$/i))) return `Gara deri në ${m[1]} gola`;
  if ((m = raw.match(/^race to (.+?) goals?$/i))) return `Gara deri në ${m[1]} gola`;
  if ((m = raw.match(/^race to (.+)$/i))) return `Gara deri në ${m[1]}`;
  if ((m = raw.match(/^next (\d+) players? to score$/i))) return `${m[1]} lojtarët e radhës që shënojnë`;
  if ((m = raw.match(/^(over|under)\s+([\d.]+)(?:\s+total)?$/i))) return `${/^over$/i.test(m[1]) ? 'Mbi' : 'Nën'} ${m[2]}`;
  if ((m = raw.match(/^(.+?)\s+total$/i))) return `${m[1]} — Total Gola`;
  if ((m = raw.match(/^(.+?)\s+handicap$/i))) return `${m[1]} — Handikap`;
  return '';
}

/** Emri me pikë -> "Corners. Race to 3" = "Kornera — Gara deri në 3" (rekursiv). */
function dottedLabel(raw: string, tm?: TmFunc): string {
  const m = raw.match(/^([^.]+)\.\s*(.+)$/);
  if (!m) return '';
  const head = PREFIX[nameKey(m[1])];
  if (!head) return '';
  const tailRaw = m[2].trim();
  const tail = tailTranslation(tailRaw) || (tm ? tm(tailRaw) : '') || dottedLabel(tailRaw, tm);
  return tail ? `${head} — ${tail}` : '';
}

export function marketLabel(name: string, t: TFunc, tm?: TmFunc): string {
  const raw = sp(name);
  if (!raw) return '';

  // 1) Fjalori i tregjeve: emrat me pikë ("1st half. Result") nuk kalojnë nga t()
  if (tm) {
    const direct = tm(raw);
    if (direct) return direct;
  }
  const key = 'markets.' + raw;
  const tr = t(key);
  if (tr && tr !== key && !tr.startsWith('markets.')) return tr;

  const p = (re: RegExp) => raw.match(re);

  let m: RegExpMatchArray | null;

  // Emra të njohur specifikë që vijnë nga feed-i
  if (/^match time result$/i.test(raw)) return 'Rezultati në Minutë';
  if (/^time of scoring$/i.test(raw)) return 'Koha e Golit të Parë';
  if (/^last team to score$/i.test(raw)) return 'Skuadra e Fundit që Shënon';
  if (/^1st half\.?\s*result$/i.test(raw)) return 'Pjesa 1 — Rezultati (1X2)';
  if (/^2nd half\.?\s*result$/i.test(raw)) return 'Pjesa 2 — Rezultati (1X2)';
  if (/^1st half\.?\s*[-—]?\s*total(?: goals)?$/i.test(raw)) return 'Pjesa 1 — Total Gola';
  if (/^2nd half\.?\s*[-—]?\s*total(?: goals)?$/i.test(raw)) return 'Pjesa 2 — Total Gola';
  if (/^1st half\.?\s*[-—]?\s*handicap$/i.test(raw)) return 'Pjesa 1 — Handikap';
  if (/^2nd half\.?\s*[-—]?\s*handicap$/i.test(raw)) return 'Pjesa 2 — Handikap';
  if (/^corners\.?\s*[-—]?\s*total(?: goals)?$/i.test(raw)) return 'Kornera — Total';
  if (/^result and both teams to score$/i.test(raw)) return 'Rezultati & Të Dyja Shënojnë';
  if ((m = p(/^Total from (\d+) to (\d+) minute(?: inclusive)?$/i))) return `Total Gola (min ${m[1]} - ${m[2]})`;
  if ((m = p(/^(.+?)\.?\s*time of scoring$/i))) return `${m[1]} — Koha e Golit`;
  if ((m = p(/^(.+?)\s+exact number of goals(?: scored)?$/i))) return `${m[1]} — Numri i Saktë i Golave`;

  if ((m = p(/^1st half\. (.+?)\. Result and total$/i))) return `Pjesa 1. ${m[1]} — Rezultati & Total`;
  if ((m = p(/^2nd half\. (.+?)\. Result and total$/i))) return `Pjesa 2. ${m[1]} — Rezultati & Total`;
  if ((m = p(/^(.+?)\. Result and total$/i))) return `${m[1]} — Rezultati & Total`;
  if ((m = p(/^(.+?) total goals\. Even\/Odd$/i))) return `${m[1]} gola total — Çift/Tek`;

  if ((m = p(/^Player to score (\d+) and more$/i))) return `Lojtari shënon ${m[1]} ose më shumë`;
  if ((m = p(/^Player\. (.+?) over$/i))) return `Lojtari — ${m[1]}`;

  if ((m = p(/^1st half\. Correct score$/i))) return 'Pjesa 1 — Rezultati i Saktë';
  if ((m = p(/^2nd half\. Correct score$/i))) return 'Pjesa 2 — Rezultati i Saktë';
  if ((m = p(/^(.+?)\. Double chance$/i))) return `${m[1]} — Shans i Dyfishtë`;
  if ((m = p(/^(.+?)\. Handicap$/i))) return `${m[1]} — Handikap`;
  if ((m = p(/^(.+?)\. Odd\/Even$/i))) return `${m[1]} — Çift/Tek`;
  if ((m = p(/^(.+?)\. Time of scoring$/i))) return `${m[1]} — Koha e Golit`;
  if ((m = p(/^(.+?) exact number of goals(?: scored)?$/i))) return `${m[1]} — Numri i Saktë i Golave`;
  if ((m = p(/^(.+?) to nil$/i))) return `${m[1]} — Fitore pa Pësuar Gol`;
  if ((m = p(/^Both Teams To Score And Draw$/i))) return 'Të Dyja Shënojnë & Barazim';
  if ((m = p(/^Both Teams Not To Score And Draw$/i))) return 'Të Dyja Nuk Shënojnë & Barazim';
  if ((m = p(/^(.+?) (?:And|&) Both (?:Teams )?To Score$/i))) return `${m[1]} & Të Dyja Shënojnë`;
  if ((m = p(/^Time of scoring$/i))) return 'Koha e Golit të Parë';
  if ((m = p(/^Last team to score$/i))) return 'Skuadra e Fundit që Shënon';
  if ((m = p(/^Team to score first$/i))) return 'Ekipi që Shënon i Pari';
  if ((m = p(/^Team to score last$/i))) return 'Ekipi që Shënon i Fundit';
  if ((m = p(/^Next team to score$/i))) return 'Ekipi i Radhës që Shënon';
  if ((m = p(/^From (\d+) to (\d+) minute inclusive\. (.+)$/i)))
    return `Nga minuta ${m[1]}-${m[2]} — ${tailTranslation(m[3]) || marketLabel(m[3], t, tm)}`;

  // Emra dinamike qe kane ngelur anglisht ne ekran (kontroll me te dhenat reale)
  if ((m = p(/^Race to (.+?)\s+goals?$/i))) return `Gara deri në ${m[1]} gola`;
  if ((m = p(/^Race to (.+)$/i))) return `Gara deri në ${m[1]}`;
  if ((m = p(/^Next player to score$/i))) return 'Lojtari i Radhës që Shënon';
  if ((m = p(/^Team to score the goal$/i))) return 'Skuadra që Shënon Golin';
  if ((m = p(/^Corners\. Team to earn the corner$/i))) return 'Kornera — Ekipi që Fiton Kornerin';
  if ((m = p(/^(First|1st) player to score$/i))) return 'Lojtari i Parë që Shënon';
  if ((m = p(/^Last player to score$/i))) return 'Lojtari i Fundit që Shënon';
  if ((m = p(/^Any player to score at least (\d+) goals?$/i))) return `Çdo Lojtar që Shënon të Paktën ${m[1]} Gola`;
  if ((m = p(/^Any player to score$/i))) return 'Çdo Lojtar që Shënon';
  if ((m = p(/^(\d+)\s+goals? in a row by (.+)$/i))) return `${m[2]} — ${m[1]} gola rresht`;
  if ((m = p(/^(.+?)\s+to win from behind$/i))) return `${m[1]} — fiton pasi ishte duke humbur`;

  if ((m = p(/^(.+?) to score the goal.*$/i))) return `${m[1]} — shënon golin`;
  if ((m = p(/^(.+?) to win either half$/i))) return `${m[1]} — fitore në një pjesë`;
  if ((m = p(/^(.+?) to win both halves$/i))) return `${m[1]} — fitore në të dyja pjesët`;
  if ((m = p(/^(.+?) to score in both halves$/i))) return `${m[1]} — shënon në të dyja pjesët`;
  if ((m = p(/^(.+?) to win to nil$/i))) return `${m[1]} — fitore pa pësuar gol`;
  if ((m = p(/^(.+?) Asian total$/i))) return `${m[1]} — total aziatik`;
  if ((m = p(/^Winning margin (.+?) by (\d+) goal or draw$/i))) return `Diferenca — ${m[1]} me ${m[2]} gol ose barazim`;
  if ((m = p(/^Winning margin (.+?) by (\d+) goals?$/i))) return `Diferenca — ${m[1]} me ${m[2]} gola`;

  // 3) Prefiksi i njohur + pjesa e mbetur ("Corners. Total goals" -> "Kornera — Total Gola")
  const dotted = dottedLabel(raw, tm);
  if (dotted) return dotted;

  if ((m = p(/^(.+?) total$/i))) return `${m[1]} — Total Gola`;

  return raw; // emri origjinal (i kuptueshëm) — pa çelësa të papërkthyer
}

/** Emri origjinal i tregut nga feed-i -> "Market" (grup pa emer) filtrohet. */
export const isUnnamedMarket = (name: string) => !String(name || '').trim() || /^market$/i.test(String(name).trim());

/** Statusi i feed-it -> etiketë shqip (Pjesa 1 / Pushim / Pjesa 2...). */
export function periodLabel(status: string): string {
  const p = String(status || '').toLowerCase();
  if (!p) return '';
  if (p.includes('break') || p.includes('half-time') || p.includes('halftime') || p === 'ht' || p.includes('pushim')) return 'Pushim';
  if (p.includes('1st half') || p === 'h1' || p === '1h') return 'Pjesa 1';
  if (p.includes('2nd half') || p === 'h2' || p === '2h') return 'Pjesa 2';
  if (p.includes('extra time') || p.includes('overtime')) return 'Shtesë';
  if (p.includes('penalt')) return 'Penallti';
  if (p.includes('about to start') || p.includes('not started') || p.includes('scheduled')) return 'Nis së shpejti';
  if (p.includes('postpon')) return 'Shtyrë';
  if (p.includes('cancel')) return 'Anuluar';
  if (p.includes('end') || p.includes('finish')) return 'Përfundoi';
  return status;
}

/** Etiketa e minutës për ndeshje live: përdor minutën dhe periudhën ekzakte nga API */
export function minuteLabel(m: { currentMinute?: number; period?: string | null; startTime?: string }): string {
  const min = Number(m?.currentMinute || 0);
  const p = String(m?.period || '').toLowerCase();

  // 1. Statuset e veçanta / Pushimi kanë përparësi absolute
  if (p) {
    if (p.includes('break') || p.includes('half-time') || p.includes('halftime') || p === 'ht' || p.includes('pushim')) {
      return 'Pushim';
    }
    if (p.includes('penalt')) return 'Penallti';
    if (p.includes('extra time') || p.includes('overtime')) return 'Shtesë';
    if (p.includes('about to start') || p.includes('not started') || p.includes('scheduled')) return 'Nis së shpejti';
    if (p.includes('postpon')) return 'Shtyrë';
    if (p.includes('cancel')) return 'Anuluar';
    if (p.includes('end') || p.includes('finish')) return 'Përfundoi';
  }

  // 2. Merre minutën ekzakte nga burimi i të dhënave (API / Feed)
  if (min > 0) {
    return `${Math.min(120, Math.round(min))}'`;
  }

  // 3. Nëse sapo ka filluar
  return "1'";
}

/** Etiketa e kohës së fillimit: "Filloi në 14:15" ose "Nis në 14:15" */
export function kickoffLabel(startTime: string, status: string): string {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const hhmm = `${hh}:${mm}`;
  const isLive = status === 'LIVE';
  return isLive ? `Filloi në ${hhmm}` : `Nis në ${hhmm}`;
}

/** Ora e nisjes në shqip: "Sot, 20:45" · "Nesër, 18:00" · "17 Sht, 20:45". */
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((day - today) / 86400000);

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const hhmm = `${hh}:${mm}`;

  if (diff === 0) return `Sot, ${hhmm}`;
  if (diff === 1) return `Nesër, ${hhmm}`;
  if (diff === -1) return `Dje, ${hhmm}`;

  const muaj = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Korr', 'Gus', 'Sht', 'Okt', 'Nën', 'Dhj'];
  return `${d.getDate()} ${muaj[d.getMonth()]}, ${hhmm}`;
}
/** Ora e fillimit ose e nisjes: "Filloi: Sot, 14:15" ose "Fillon: Sot, 20:45" */
export function matchTimeLabel(startTime: string, status?: string): string {
  const formatted = formatKickoff(startTime);
  if (!formatted) return '';
  if (status === 'LIVE') return `Filloi: ${formatted}`;
  return `Fillon: ${formatted}`;
}

export interface OutcomeLabelOptions {
  /** Emri i tregut (për 1/X/2 dhe për kontekstin e kuotës). */
  marketName?: string;
  /** Tipi i tregut nga backend-i: '1X2', 'TIME_RESULT', 'BOTH_TEAMS_SCORE'... */
  marketType?: string;
  /** [vendas, udhëtues] — për kuotat që përmbajnë emrin e ekipit. */
  teams?: string[];
  /** Kodi i kuotës (p.sh. '1', 'x', '2') */
  code?: string | null;
}

/** Opsionet që përkthehen fjalë për fjalë (të plota). */
const OUTCOME_EXACT: Record<string, string> = {
  draw: 'Barazim',
  tie: 'Barazim',
  yes: 'Po',
  no: 'Jo',
  odd: 'Tek',
  even: 'Çift',
  neither: 'Asnjëri',
  none: 'Asnjë',
  'no goal': 'Pa Gol',
  'no goal 1': 'Pa Gol',
  'pa gol': 'Pa Gol',
  '3 or more': '3 ose më shumë',
  over: 'Mbi',
  under: 'Nën',
  home: 'Vendas',
  away: 'Udhëtues',
  'home team': 'Vendas',
  'away team': 'Udhëtues',
  'both teams to score and draw': 'Të Dyja Shënojnë & Barazim',
  'both teams not to score and draw': 'Të Dyja Nuk Shënojnë & Barazim'
};

/** Emri i ekipit, "Barazim"/"Draw" ose "1"/"2" brenda një opsioni të përbërë. */
function halfPart(partRaw: string, teams: string[]): string {
  const part = sp(partRaw);
  const low = part.toLowerCase();
  if (!part) return '';
  if (/^(draw|tie|x|barazim)$/i.test(low)) return 'Barazim';
  if (/^(home|home team|1)$/i.test(low)) return teams[0] || '1';
  if (/^(away|away team|2)$/i.test(low)) return teams[1] || '2';
  if (teams[0] && (low === teams[0] || low.includes(teams[0]))) return teams[0];
  if (teams[1] && (low === teams[1] || low.includes(teams[1]))) return teams[1];
  if (/^[a-z0-9 .'&()-]+$/i.test(part) && /[a-z]{3}/i.test(part)) return part;
  return '';
}

/** Etiketa e një opsioni (kuote) në shqip.
 *
 * Për tregun 1X2 kthen vetëm "1", "X", "2" — KURRË emrin e ekipit ose "Barazim".
 */
export function outcomeLabel(name: string, opts: OutcomeLabelOptions = {}): string {
  const raw = sp(name);
  if (!raw) return '';
  const rawLow = raw.toLowerCase();
  const low = nameKey(raw);
  const teams = (opts.teams || []).map((x) => sp(x).toLowerCase());
  const marketLow = nameKey(opts.marketName || '');
  const isHalfFull = opts.marketType === 'HALF_OTHER' || /pjesa 1 \/ rezultati final|halftime\s*\/\s*full\s*time/.test(marketLow);

  // Tregje 1X2: kthen VETËM "1", "X", "2" (jo emrat e ekipeve, jo "Barazim")
  const isInterval1x2 = /minute.*\b(?:3|three)[- ]way/i.test(marketLow);
  const is1x2 = opts.marketType === '1X2' || opts.marketType === 'HALF_RESULT' || isInterval1x2 ||
    /^(1x2|2-way|match result|full ?time result|match winner|to win|moneyline|result|rezultati final(\s*\(1x2\))?)$/i.test(marketLow) ||
    /^(1st half|2nd half)\.?\s*result$/i.test(marketLow) ||
    /^(1x2|match result|full ?time result|match winner|moneyline)$/i.test(low);
  if (is1x2) {
    const c = String(opts.code || '').trim().toLowerCase();
    if (c === '1' || low === '1' || low === 'home' || low === 'home team' || (teams[0] && (low === teams[0] || low.includes(teams[0]) || teams[0].includes(low)))) return '1';
    if (c === 'x' || c === 'draw' || low === 'x' || low === 'draw' || low === 'tie' || low === 'barazim') return 'X';
    if (c === '2' || low === '2' || low === 'away' || low === 'away team' || (teams[1] && (low === teams[1] || low.includes(teams[1]) || teams[1].includes(low)))) return '2';
    const withDigit = raw.match(/^([12])\s+(.+)$/);
    if (withDigit) return withDigit[1];
  }

  if (OUTCOME_EXACT[rawLow]) return OUTCOME_EXACT[rawLow];

  const p = (re: RegExp) => raw.match(re);
  let m: RegExpMatchArray | null;

  // Pjesa 1 / Rezultati final: "Draw / Arsenal", "Arsenal / Draw", "Draw / Draw"
  if (isHalfFull) {
    if ((m = p(/^(.+?)\s*\/\s*(.+)$/))) {
      const h = halfPart(m[1], teams);
      const f = halfPart(m[2], teams);
      if (h && f) return `${h} / ${f}`;
    }
  }

  // Kontekst i tregut: kornera për ekip / goli i radhës për lojtar / skuadra që shënon
  if (/team to earn the corner/.test(marketLow) && (m = p(/^(\d+)\s+(.+)$/))) {
    return `${m[2]} — ${m[1]} kornera`;
  }
  if (/team to score the goal/.test(marketLow) && (m = p(/^(\d+)\s+(.+)$/i))) {
    return /^(none|no goal)$/i.test(m[2]) ? `Pa Gol (goli i ${m[1]}-të)` : `${m[2]} — shënon golin e ${m[1]}-të`;
  }
  // "2 Draw" / "2 Kuching FA": feed-i shton numrin e opsionit te tregjet 3-way
  if (/3-way betting|three-way betting/.test(marketLow) && (m = p(/^\d+\s+(.+)$/))) {
    const rest = sp(m[1]);
    if (/^(draw|tie)$/i.test(rest)) return 'Barazim';
    if (/^(none|no goal)$/i.test(rest)) return 'Pa Gol';
    if (teams.includes(rest.toLowerCase()) || /^\p{Lu}/u.test(rest)) return rest;
  }

  if ((m = p(/^Over\s+(.+)$/i))) return `Mbi ${m[1]}`;
  if ((m = p(/^Under\s+(.+)$/i))) return `Nën ${m[1]}`;

  // Numri i golave: "3 Or More", "Shakhtar 2 Or More"
  if ((m = p(/^(\d+)\s+Or\s+More$/i))) return `${m[1]} ose më shumë`;
  if ((m = p(/^(.+?)\s+(\d+)\s+Or\s+More$/i))) return `${m[1]} — ${m[2]} ose më shumë`;

  // Shans i dyfishtë: "Draw Or Shakhtar" / "Shakhtar Or Draw" / "A Or B"
  if ((m = p(/^Draw\s+or\s+(.+)$/i))) return `X2 (Barazim ose ${m[1]})`;
  if ((m = p(/^(.+?)\s+or\s+Draw$/i))) return `1X (${m[1]} ose Barazim)`;
  if ((m = p(/^(.+?)\s+or\s+(.+)$/i))) return `12 (${m[1]} ose ${m[2]})`;

  // Rezultati & të dyja shënojnë / fitore pa pësuar gol
  if (/^both teams to score and draw$/i.test(raw)) return 'Të Dyja Shënojnë & Barazim';
  if (/^both teams not to score and draw$/i.test(raw)) return 'Të Dyja Nuk Shënojnë & Barazim';
  if ((m = p(/^(.+?)\s+(?:And|&)\s+Both\s+(?:Teams\s+)?To\s+Score$/i))) return `${m[1]} & Të Dyja Shënojnë`;
  if ((m = p(/^(.+?)\s+To\s+Nil$/i))) return `${m[1]} pa pësuar gol`;

  // Goli i radhës: "No Goal 1", "Shakhtar 1"
  const isGoalMarket = /goal|gol|score|shënon/.test(marketLow) &&
    !/handicap|total|correct|exact|minute|interval|korner|corner/.test(marketLow);
  const isRace = /race to|gara deri/.test(marketLow);
  const isCorners = /corner|korner/.test(marketLow);
  const isPlayer = /player|lojtar/.test(marketLow);
  const raceUnit = isCorners ? 'kornera' : 'gola';
  const raceName = (s: string) => (/^(neither|none)$/i.test(s) ? 'Asnjëri' : s);

  const looksAlbanian = (s: string) => {
    const base = s.replace(/\s*\(.*?\)\s*$/, '').trim();
    const last = base.split(/\s+/).pop() || '';
    return /(ll|sh|ç|gj|xh|zh|nj|rr|th|dh|ë|y|[aeiou])$/i.test(last);
  };

  if (isRace && (m = p(/^(\d+)\s*-\s*(.+)$/))) return `${raceName(m[2])} — i pari në ${m[1]} ${raceUnit}`;
  if (isRace && (m = p(/^(.+?)\s+(\d+)$/))) return `${raceName(m[1])} — i pari në ${m[2]} ${raceUnit}`;
  if (isPlayer && (m = p(/^No\s+(\d+)(?:st|nd|rd|th)?\s+Goal(?:\s+\d+)?$/i))) return `Pa Gol (goli i ${m[1]}-të)`;
  if (isPlayer && (m = p(/^(.+?)\s+(\d+)$/)) && (looksAlbanian(m[1]) || teams.includes(m[1].toLowerCase())))
    return `${m[1]} — shënon golin e ${m[2]}-të`;
  if (isGoalMarket && (m = p(/^No\s+(\d+)(?:st|nd|rd|th)?\s+Goal(?:\s+\d+)?$/i))) return `Pa Gol (goli i ${m[1]}-të)`;
  if ((m = p(/^No Goal(?:\s+(\d+))?$/i))) return m[1] ? `Pa Gol (goli i ${m[1]}-të)` : 'Pa Gol';
  if (isGoalMarket && (m = p(/^(.+?)\s+(\d+)$/)) && teams.includes(m[1].toLowerCase())) return `${m[1]} — shënon golin e ${m[2]}-të`;

  // Rezultati në minutën e dhënë: "Draw 30:00", "Shakhtar 30:00"
  if ((m = p(/^Draw\s+(\d+:\d+|\d+)$/i))) return `Barazim ${m[1]}`;
  if ((m = p(/^(.+?)\s+(\d+:\d+)$/i))) return `${m[1]} ${m[2]}`;

  // Koha e golit: "Goal number 1 will not be scored before 40:00 minute"
  if ((m = p(/^Goal\s+number\s+(\d+)\s+will\s+(not\s+)?be\s+scored\s+before\s+(\d+)(?::\d+)?\s*minute$/i))) {
    return `Goli ${m[1]} ${m[2] ? 'nuk shënohet' : 'shënohet'} para min ${m[3]}:00`;
  }

  return raw;
}