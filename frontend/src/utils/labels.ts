/**
 * Etiketat shqip për tregjet dhe opsionet e kuotave.
 *
 * Emrat vijnë në anglisht nga burimi i të dhënave (p.sh. "Full time result",
 * "Corners. Total", "Genoa total"). Këtu:
 *   1) provohet fjalori i përkthyer (i18n `markets.*`)
 *   2) zbatohen modele për emrat dinamikë (që përmbajnë emrin e ekipit)
 *   3) në fund kthehet emri origjinal — KURRË një çelës si "markets.xyz"
 */
type TFunc = (key: string, fallback?: string) => string;

export function marketLabel(name: string, t: TFunc): string {
  if (!name) return '';

  const key = 'markets.' + name;
  const tr = t(key);
  if (tr && tr !== key && !tr.startsWith('markets.')) return tr;

  const p = (re: RegExp) => name.match(re);

  let m: RegExpMatchArray | null;

  if ((m = p(/^1st half\. (.+?)\. Result and total$/i))) return `Pjesa 1. ${m[1]} — Rezultati & Total`;
  if ((m = p(/^2nd half\. (.+?)\. Result and total$/i))) return `Pjesa 2. ${m[1]} — Rezultati & Total`;
  if ((m = p(/^(.+?)\. Result and total$/i))) return `${m[1]} — Rezultati & Total`;

  if ((m = p(/^Corners\. 1st half\. (.+?) total$/i))) return `Kornera. Pjesa 1. ${m[1]} — total`;
  if ((m = p(/^Corners\. 2nd half\. (.+?) total$/i))) return `Kornera. Pjesa 2. ${m[1]} — total`;
  if ((m = p(/^Corners\. (.+?) total$/i))) return `Kornera. ${m[1]} — total`;
  if ((m = p(/^Yellow cards\. (.+?) total$/i))) return `Kartona të verdhë. ${m[1]} — total`;
  if ((m = p(/^1st half\. (.+?) total$/i))) return `Pjesa 1. ${m[1]} — total`;
  if ((m = p(/^2nd half\. (.+?) total$/i))) return `Pjesa 2. ${m[1]} — total`;
  if ((m = p(/^(.+?) total goals\. Even\/Odd$/i))) return `${m[1]} gola total — Çift/Tek`;
  if ((m = p(/^(.+?) total$/i))) return `${m[1]} — total gola`;

  if ((m = p(/^Player to score (\d+) and more$/i))) return `Lojtari shënon ${m[1]} ose më shumë`;
  if ((m = p(/^Player\. (.+?) over$/i))) return `Lojtari — ${m[1]}`;

  if ((m = p(/^1st half\. Correct score$/i))) return 'Pjesa 1 — Rezultati i saktë';
  if ((m = p(/^2nd half\. Correct score$/i))) return 'Pjesa 2 — Rezultati i saktë';
  if ((m = p(/^(.+?)\. Double chance$/i))) return `${m[1]} — Shans i dyfishtë`;
  if ((m = p(/^(.+?)\. Handicap$/i))) return `${m[1]} — Handikap`;
  if ((m = p(/^(.+?)\. Odd\/Even$/i))) return `${m[1]} — Çift/Tek`;

  if ((m = p(/^From (\d+) to (\d+) minute inclusive\. (.+)$/i))) return `Nga minuta ${m[1]}-${m[2]} — ${marketLabel(m[3], t)}`;
  if ((m = p(/^(.+?) to score the goal.*$/i))) return `${m[1]} — shënon golin`;
  if ((m = p(/^(.+?) to win either half$/i))) return `${m[1]} — fitore në një pjesë`;
  if ((m = p(/^(.+?) to win both halves$/i))) return `${m[1]} — fitore në të dyja pjesët`;
  if ((m = p(/^(.+?) to score in both halves$/i))) return `${m[1]} — shënon në të dyja pjesët`;
  if ((m = p(/^(.+?) to win to nil$/i))) return `${m[1]} — fitore pa gol`;
  if ((m = p(/^(.+?) Asian total$/i))) return `${m[1]} — total aziatik`;
  if ((m = p(/^Winning margin (.+?) by (\d+) goal or draw$/i))) return `Diferenca — ${m[1]} me ${m[2]} gol ose barazim`;
  if ((m = p(/^Winning margin (.+?) by (\d+) goals?$/i))) return `Diferenca — ${m[1]} me ${m[2]} gola`;

  return name; // emri origjinal (i kuptueshëm) — pa çelësa të papërkthyer
}

/** Emri origjinal i tregut nga feed-i -> "Market" (grup pa emer) filtrohet. */
export const isUnnamedMarket = (name: string) => !String(name || '').trim() || /^market$/i.test(String(name).trim());

/** Statusi i feed-it -> etiketë shqip (Pjesa 1 / Pushim / Pjesa 2...). */
export function periodLabel(status: string): string {
  const p = String(status || '').toLowerCase();
  if (!p) return '';
  if (p.includes('1st half') || p === 'h1') return 'Pjesa 1';
  if (p.includes('2nd half') || p === 'h2') return 'Pjesa 2';
  if (p.includes('break') || p.includes('half-time') || p.includes('halftime') || p === 'ht') return 'Pushim';
  if (p.includes('extra time') || p.includes('overtime')) return 'Shtesë';
  if (p.includes('penalt')) return 'Penallti';
  if (p.includes('about to start') || p.includes('not started') || p.includes('scheduled')) return 'Nis së shpejti';
  if (p.includes('postpon')) return 'Shtyrë';
  if (p.includes('cancel')) return 'Anuluar';
  if (p.includes('end') || p.includes('finish')) return 'Përfundoi';
  return status;
}

/** Etiketa e minutës për ndeshje live: "67'", "Pushim", "Nis së shpejti"... */
export function minuteLabel(m: { currentMinute?: number; period?: string | null }): string {
  const p = String(m?.period || '').toLowerCase();
  if (p) {
    const special = periodLabel(p);
    if (special !== p) return special; // Pushim / Përfundoi / Nis së shpejti / Shtesë...
  }
  return `${Number(m?.currentMinute || 0)}'`;
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
export function outcomeLabel(name: string): string {
  if (!name) return '';
  const n = String(name).trim();

  const exact: Record<string, string> = {
    draw: 'Barazim',
    yes: 'Po',
    no: 'Jo',
    odd: 'Tek',
    even: 'Çift',
    neither: 'Asnjëri',
    'no goal': 'Pa gol',
    'over': 'Mbi',
    'under': 'Nën'
  };
  const lower = n.toLowerCase();
  if (exact[lower]) return exact[lower];

  let m: RegExpMatchArray | null;
  if ((m = n.match(/^Over\s+(.+)$/i))) return `Mbi ${m[1]}`;
  if ((m = n.match(/^Under\s+(.+)$/i))) return `Nën ${m[1]}`;
  if ((m = n.match(/^(.+?)\s+(\d+) Or More$/i))) return `${m[1]} — ${m[2]} ose më shumë`;

  return n;
}