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

  return name; // emri origjinal (i kuptueshëm) — pa çelësa të papërkthyer
}

/** Përkthimi i emrit të një opsioni kuote (Over 2.5 -> Mbi 2.5, Draw -> Barazim...). */
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