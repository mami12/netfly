/**
 * Përkthimi në shqip i emrave të tregjeve (markets) dhe opsioneve (outcomes).
 *
 * Emrat vijnë nga feed-i i huaj në anglisht dhe shpesh përmbajnë pikë
 * ("1st half. Result", "Corners. Total") ose emrin e ekipit brenda
 * ("Shakhtar Donetsk to win to nil"). Prandaj përkthimi bëhet me lookup + regex
 * mbi stringun e plotë, pa e ndarë me pikë (t() e ndan dhe dështon).
 */

const sp = (s: unknown) =>
  String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/** Çelësi i kërkimit: i vogël, pa pikë në fund, hapësira të normalizuara. */
const k = (s: unknown) => sp(s).toLowerCase().replace(/\.+$/, '').trim();

/** Emrat e tregjeve që përkthehen fjalë për fjalë. */
const MARKETS: Record<string, string> = {
  'full time result': 'Rezultati Final (1X2)',
  'full time result (1x2)': 'Rezultati Final (1X2)',
  '1x2': 'Rezultati Final (1X2)',
  'match winner': 'Rezultati Final (1X2)',
  'match result': 'Rezultati Final (1X2)',
  'match time result': 'Rezultati Final (1X2)',
  'draw no bet': 'Barazim pa Bast',
  'double chance': 'Shans i Dyfishtë',
  'both teams to score': 'Të Dyja Ekipet Shënojnë',
  'both teams to score (gg/ng)': 'Të Dyja Ekipet Shënojnë',
  'both teams to score?': 'Të Dyja Ekipet Shënojnë',
  'result and both teams to score': 'Rezultati & Të Dyja Shënojnë',
  'result and both teams not to score': 'Rezultati & Të Dyja Nuk Shënojnë',
  'odd/even': 'Çift / Tek',
  'odd or even': 'Çift / Tek',
  'goals odd/even': 'Gola — Çift / Tek',
  'correct score': 'Rezultati i Saktë',
  'exact score': 'Rezultati i Saktë',
  total: 'Total Gola',
  'total goals': 'Total Gola',
  'over/under': 'Mbi / Nën',
  'under/over': 'Nën / Mbi',
  handicap: 'Handikap',
  'asian handicap': 'Handikap Aziatik',
  'next goal': 'Goli i Radhës',
  'first goal': 'Goli i Parë',
  'last team to score': 'Ekipi që Shënon i Fundit',
  'time of scoring': 'Koha e Golit',
  'half time result': 'Rezultati i Pjesës së Parë',
  '1st half. result': 'Pjesa 1 — Rezultati',
  '2nd half. result': 'Pjesa 2 — Rezultati',
  '1st half result': 'Pjesa 1 — Rezultati',
  '2nd half result': 'Pjesa 2 — Rezultati',
  '1st half / full time result': 'Pjesa 1 / Rezultati Final',
  'half time / full time': 'Pjesa 1 / Rezultati Final',
  '1st half. winning margin': 'Pjesa 1 — Diferenca e Golave',
  'both halves': 'Të Dyja Pjesët',
  corners: 'Kornera',
  'corners. total': 'Kornera — Total',
  'corners. total goals': 'Kornera — Total',
  'corners. handicap': 'Kornera — Handikap',
  'asian corners': 'Kornera Aziatik',
  'total corners': 'Kornera — Total',
  cards: 'Kartonë',
  'cards. total': 'Kartonë — Total',
  'total cards': 'Kartonë — Total',
  'yellow cards': 'Kartonë të Verdha',
  'yellow cards. total': 'Kartonë të Verdha — Total',
  'bookings. total': 'Kartonë — Total',
  fouls: 'Faulla',
  'fouls. total': 'Faulla — Total',
  'shots on target. total': 'Goditje në Portë — Total',
  'shots on target. handicap': 'Goditje në Portë — Handikap',
  'total shots. total': 'Goditje Gjithsej — Total',
  'offsides. total': 'Ofsajd — Total',
  'to advance': 'Kualifikimi',
  'clean sheet': 'Pa Pësuar Gol',
  'win to nil': 'Fitore pa Pësuar Gol',
};

/** Opsionet (outcomes) që përkthehen fjalë për fjalë. */
const OUTCOMES: Record<string, string> = {
  yes: 'Po',
  no: 'Jo',
  over: 'Mbi',
  under: 'Nën',
  draw: 'Barazim',
  'no goal': 'Pa Gol',
  'none': 'Asnjë',
  odd: 'Tek',
  even: 'Çift',
  '3 or more': '3 ose Më Shumë',
  '4 or more': '4 ose Më Shumë',
  '2 or more': '2 ose Më Shumë',
  '1 or more': '1 ose Më Shumë',
  'both teams to score and draw': 'Të Dyja Shënojnë & Barazim',
  'both teams not to score and draw': 'Të Dyja Nuk Shënojnë & Barazim',
};

// __PART2__
