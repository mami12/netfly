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

  const secondHalf = /2nd half|second half|extra|overtime|penalt/.test(period);
  const cap = secondHalf ? MAX_MINUTE : FIRST_HALF_CAP;

  let base = raw;
  const feedMs = Number(m.feedMatchTimeMs || 0);
  const feedAt = m.feedTimeAt ? new Date(m.feedTimeAt as any).getTime() : 0;

  if (feedMs > 0 && Number.isFinite(feedAt) && feedAt > 0) {
    base = Math.max(raw, Math.floor((feedMs + Math.max(0, Date.now() - feedAt)) / 60000));
  } else if (m.startTime) {
    const startedAt = new Date(m.startTime as any).getTime();
    if (Number.isFinite(startedAt)) base = Math.max(raw, Math.floor((Date.now() - startedAt) / 60000));
  }

  const driftCap = raw > 0 ? raw + MAX_DRIFT_MIN : cap;
  return clampMinute(Math.min(base, driftCap, cap));
}
