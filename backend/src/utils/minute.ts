/**
 * Minuta e saktë e ndeshjes për shfaqje (dhe për API-n).
 *
 * Pse duhet: feed-i e dërgon fushen `matchTime` VETËM në snapshot-et periodike
 * (jo në çdo update), dhe shkrimi në DB zgjat disa sekonda. Pa ekstrapolim, faqja
 * tregon minutën e vjetruar (p.sh. 15' kur ndeshja është në 24') — ndërsa faqja
 * origjinale e numëron kohën lokalisht.
 *
 * Rregulli: minute = max(minuta e ruajtur, matchTime + koha e kaluar nga marrja),
 * e kufizuar nga:
 *   - "drift" maksimal prej 5 minutash mbi vlerën e njohur (kështu ekstrapolimi
 *     nuk ikën larg realitetit nëse feed-i hesht ose ndeshja ka pushim),
 *   - kufijtë e pjesës (pjesa 1 → 55', pjesa 2/shtesat → 120', pushim → ora ndalon).
 */

export interface MinuteSource {
  status?: string | null;
  period?: string | null;
  currentMinute?: number | null;
  startTime?: Date | string | null;
  feedMatchTimeMs?: number | null;
  feedTimeAt?: Date | string | null;
}

const MAX_MINUTE = 120;
const FIRST_HALF_CAP = 55;
const MAX_DRIFT_MIN = 5;
/** Nese mesazhi i fundit i feed-it (WS) eshte me i vjeter se kaq, mendohet se feed-i hesht. */
const WS_FRESH_MS = 3 * 60 * 1000;
const HALF_MIN = 45;
const BREAK_MIN = 15;

/**
 * Modeli "ora e murit": 45' loje + 15' pushim + 45' loje (me shtesa).
 * Perdoret VETEM kur feed-i nuk ka dhene minute (pa WS): keshtu faqja tregon
 * minutën reale edhe kur lidhja me burimin mungon — nuk ngrin te vlera e vjeter.
 */
export function clockMinute(elapsedMin: number): number {
  if (!Number.isFinite(elapsedMin) || elapsedMin <= 0) return 0;
  if (elapsedMin <= HALF_MIN) return Math.round(elapsedMin);
  if (elapsedMin < HALF_MIN + BREAK_MIN) return HALF_MIN; // pushimi
  return Math.min(MAX_MINUTE, Math.round(elapsedMin - BREAK_MIN));
}

const clampMinute = (m: number) =>
  Number.isFinite(m) && m > 0 ? Math.min(MAX_MINUTE, Math.max(1, Math.round(m))) : 0;

export function derivedMinute(m: MinuteSource | null | undefined): number {
  if (!m) return 0;

  const raw = Number(m.currentMinute || 0);
  const status = String(m.status || '').toUpperCase();

  // Vetëm ndeshjet LIVE ekstrapolohen: PREMATCH mbetet 0, ENDED mbetet ashtu si është.
  if (status !== 'LIVE') return raw > 0 ? clampMinute(raw) : 0;

  const period = String(m.period || '').toLowerCase();

  // Pushimi / çereku i pushimit: ora nuk ecën → mbahet minuta e fundit e njohur (ose 45').
  if (/break|half[- ]?time|\bht\b|pushim/.test(period)) return raw > 0 ? raw : 45;

  // Tavani i pjesës së parë (55') zbatohet VETEM kur e dime qe eshte pjesa e pare —
  // perndryshe nje periode e panjohur e priste gabimisht nje ndeshje ne 81'.
  const firstHalf = /1st half|first half|\bh1\b/.test(period);
  const cap = firstHalf ? FIRST_HALF_CAP : MAX_MINUTE;

  const feedMs = Number(m.feedMatchTimeMs || 0);
  const feedAt = m.feedTimeAt ? new Date(m.feedTimeAt as any).getTime() : 0;
  const feedFresh = feedMs > 0 && Number.isFinite(feedAt) && feedAt > 0 && Date.now() - feedAt < WS_FRESH_MS;

  // 1) Feed-i (WS) dha minute te fresketa -> perdoret AI, me kufi drift (mbron pushimin/shtesat).
  if (feedFresh) {
    const base = Math.max(raw, Math.floor((feedMs + Math.max(0, Date.now() - feedAt)) / 60000));
    const driftCap = raw > 0 ? raw + MAX_DRIFT_MIN : cap;
    return clampMinute(Math.min(base, driftCap, cap));
  }

  // 2) Pa te dhena te fresketa nga feed-i (p.sh. lidhja me burimin e ndërprerë):
  //    minuta llogaritet nga ora e nisjes me modelin 45'+15'+45' — minuta reale,
  //    jo vlera e vjeter e ruajtur ne DB (qe ngrinte minutat për ore te tera).
  if (m.startTime) {
    const startedAt = new Date(m.startTime as any).getTime();
    if (Number.isFinite(startedAt)) {
      const wall = clockMinute((Date.now() - startedAt) / 60000);
      if (wall > 0) return clampMinute(wall);
    }
  }

  return raw > 0 ? clampMinute(raw) : 0;
}
