import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, CornerDownLeft, Target, Flag, AlertTriangle, Radio } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { marketLabel, outcomeLabel, minuteLabel, periodLabel, formatKickoff, kickoffLabel, matchTimeLabel, isUnnamedMarket } from '../../utils/labels';

const POLL_MS = 5000;
const OUTCOME_LIMIT = 12;

/** Radha e tregjeve kryesore (me të rëndësishmet të parat). */
const MAIN_ORDER = ['1X2', 'OVER_UNDER', 'BOTH_TEAMS_SCORE', 'DOUBLE_CHANCE', 'HANDICAP', 'TEAM_TOTAL', 'BTTS_TOTAL'];

export const is1X2Market = (m: { marketType?: string; name?: string }) =>
  m.marketType === '1X2' ||
  /^(1x2|match winner|match result|full ?time result|rezultati final|rezultati)$/i.test(String(m.name || '').trim());

/** Seksionet e tregjeve — lista e gjere (80+ tregje) organizohet, jo e hedhur rresht.
 *  `labelKey` kalon nga fjalori (i18n `sections.*`), kështu emrat e seksioneve
 *  ndryshohen në një vend të vetëm. `other` i kap të gjitha tregjet e mbetura —
 *  asnjë treg nuk humbet, edhe pse feed-i sjell lloje të reja pa paralajmërim. */
const SECTIONS: { key: string; labelKey: string; match: (m: Market) => boolean }[] = [
  { key: 'main', labelKey: 'sections.markets_main', match: (m) => is1X2Market(m) || MAIN_ORDER.includes(m.marketType) },
  { key: 'goals', labelKey: 'sections.markets_goals', match: (m) => ['CORRECT_SCORE', 'EXACT_GOALS', 'ODD_EVEN'].includes(m.marketType) },
  { key: 'time', labelKey: 'sections.markets_time', match: (m) => ['TIME_RESULT', 'INTERVAL_TOTAL'].includes(m.marketType) || /time of|minute|interval/i.test(m.name) },
  { key: 'halves', labelKey: 'sections.markets_halves', match: (m) => m.marketType.startsWith('HALF_') || /1st half|2nd half|halftime/i.test(m.name) },
  { key: 'stats', labelKey: 'sections.markets_stats', match: (m) => m.marketType.startsWith('STATS_') || /corner|card|shot|offside|foul/i.test(m.name) },
  { key: 'players', labelKey: 'sections.markets_players', match: (m) => m.marketType === 'PLAYER_PROP' || /player|scorer/i.test(m.name) },
  { key: 'other', labelKey: 'sections.markets_other', match: () => true },
];

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, tm } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['main']));
  const [showAllSections, setShowAllSections] = useState(false);
  const [expandedOutcomes, setExpandedOutcomes] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;

    const load = async () => {
      try {
        const res = await apiClient.get(`/matches/${id}`);
        if (!alive) return;
        setMatch(res.data);
        const ms: Market[] = (res.data?.markets || []).filter(
          (m: Market) => !/early\s*payout/i.test(m.name || '') && !isUnnamedMarket(m.name)
        );

        // 1) Hiq tregjet pa asnje kuote (shfaqeshin si kuti boshe)
        const withOdds = ms.filter((m) => ((m as any).outcomes || []).length > 0);

        // 2) Dublikatat: dy tregje te ndryshem nga feed-i mund te kene te njejtin
        //    perkthim ("Match time result" dhe "Full time result") — mbahet ai me
        //    shume opsione, keshtu lojtari nuk e shikon te njejtin treg 2 here.
        const byLabel = new Map<string, Market>();
        for (const m of withOdds) {
          const label = marketLabel(m.name, t, tm).toLowerCase();
          const prev = byLabel.get(label);
          if (!prev) { byLabel.set(label, m); continue; }
          if (((m as any).outcomes || []).length > ((prev as any).outcomes || []).length) byLabel.set(label, m);
        }

        setMarkets(Array.from(byLabel.values()));
      } catch (e) {
        console.error(e);
      }
    };

    load();
    const timer = setInterval(load, POLL_MS); // statuset + kuotat rifreskohen cdo 5s
    const tickTimer = setInterval(() => setTick((v) => v + 1), 15000); // minuta ecen live

    const handleStatus = (e: any) => {
      const { matchId, status, minute, homeScore, awayScore, period } = e.detail || {};
      if (matchId === id) {
        setMatch((prev) =>
          prev
            ? {
                ...prev,
                status: status || prev.status,
                currentMinute: minute !== undefined ? minute : prev.currentMinute,
                period: period !== undefined ? period : prev.period,
                homeScore: homeScore !== undefined ? homeScore : prev.homeScore,
                awayScore: awayScore !== undefined ? awayScore : prev.awayScore
              }
            : prev
        );
      }
    };
    window.addEventListener('netfly:match-status', handleStatus);

    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(tickTimer);
      window.removeEventListener('netfly:match-status', handleStatus);
    };
  }, [id]);

  // Klasifikimi i tregjeve ne seksione (seksioni i pare qe perputhet fiton)
  // EKSLUZIVE: çdo treg shfaqet vetem ne seksionin e PARË që përputhet.
  // (Më parë 'Të tjera' kishte match:()=>true dhe i kapte TË GJITHA tregjet,
  //  prandaj i njëjti treg dukej 2 herë: në seksionin e vet dhe në "Të tjera".)
  const grouped = useMemo(() => {
    const used = new Set<string>();
    const out: { key: string; labelKey: string; items: Market[] }[] = [];
    for (const sec of SECTIONS) {
      const items = markets.filter((m) => !used.has(m.id) && sec.match(m));
      if (!items.length) continue;
      items.forEach((m) => used.add(m.id));
      out.push({ key: sec.key, labelKey: sec.labelKey, items });
    }
    return out;
  }, [markets]);

  const visibleSections = showAllSections ? grouped : grouped.filter((s) => s.key === 'main');
  const hiddenCount = grouped.filter((s) => s.key !== 'main').reduce((a, s) => a + s.items.length, 0);

  // Emrat e tregjeve vijne ne anglisht -> etiketa shqip (shih utils/labels.ts)

  const sortMain = (items: Market[]) =>
    [...items].sort((a, b) => {
      const isA = is1X2Market(a);
      const isB = is1X2Market(b);
      if (isA && !isB) return -1;
      if (!isA && isB) return 1;
      const ia = MAIN_ORDER.indexOf(a.marketType);
      const ib = MAIN_ORDER.indexOf(b.marketType);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

  /** Renditja alfabetike shqipe — e njejta lloj tregjesh qendron bashke. */
  const collator = new Intl.Collator('sq');
  const sortByLabel = (items: Market[]) =>
    [...items].sort((a, b) => collator.compare(marketLabel(a.name, t, tm), marketLabel(b.name, t, tm)));

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleOutcomes = (marketId: string) => {
    setExpandedOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(marketId)) next.delete(marketId); else next.add(marketId);
      return next;
    });
  };

  if (!match) return <div className="p-8 text-center text-text-secondary">{t('common.loading')}</div>;

  return (
    <div className="p-3 sm:p-4 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Shirit që qëndron gjatë scroll-it: minuta + rezultati + statistikat.
          Keshtu, kur shikon tregjet shtesë (80+ tregje), informacioni i ndeshjes
          nuk humbet. */}
      {match.status === 'LIVE' && (
        <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-primary/95 backdrop-blur-md border-b border-tertiary rounded-b-lg">
          <div className="flex items-center gap-2 sm:gap-3 text-xs overflow-x-auto scrollbar-none">
            <span className="inline-flex items-center gap-1 bg-accent-red text-white font-black px-2 py-0.5 rounded-full shrink-0">
              <Radio size={10} /> {minuteLabel(match)}
            </span>
            <span className="font-bold text-white shrink-0">
              {match.homeTeam} {match.homeScore ?? 0} - {match.awayScore ?? 0} {match.awayTeam}
            </span>
            <span className="text-text-secondary shrink-0">{matchTimeLabel(match.startTime, match.status)}</span>
            {periodLabel(match.period || '') && (
              <span className="text-text-primary font-semibold shrink-0">{periodLabel(match.period || '')}</span>
            )}
            <span className="shrink-0 text-text-secondary">
              🚩 Kornera <b className="text-text-primary">{match.homeCorners ?? 0} - {match.awayCorners ?? 0}</b>
            </span>
            <span className="shrink-0 text-text-secondary">
              🟨 Kartonë <b className="text-text-primary">{match.homeYellow ?? 0} - {match.awayYellow ?? 0}</b>
            </span>
            {(match.homeRed || match.awayRed) ? (
              <span className="shrink-0 text-text-secondary">
                🟥 <b className="text-accent-red">{match.homeRed ?? 0} - {match.awayRed ?? 0}</b>
              </span>
            ) : null}
            {(match.homePossession !== undefined || match.awayPossession !== undefined) && (
              <span className="shrink-0 text-text-secondary">
                Posa <b className="text-text-primary">{match.homePossession ?? 0}% - {match.awayPossession ?? 0}%</b>
              </span>
            )}
            {(match.homeShots !== undefined || match.awayShots !== undefined) && (
              <span className="shrink-0 text-text-secondary">
                Goditje <b className="text-text-primary">{match.homeShots ?? 0} - {match.awayShots ?? 0}</b>
              </span>
            )}
          </div>
        </div>
      )}

      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-secondary hover:text-accent-green transition text-sm font-semibold"
      >
        <ArrowLeft size={16} /> Kthehu mbrapa
      </button>

      <div className="bg-secondary p-4 sm:p-6 rounded-xl text-center shadow-lg border border-tertiary">
        <div className="flex items-center justify-center gap-2 mb-2">
          {match.status === 'LIVE' && (
            <span className="bg-accent-red text-white text-xs px-2.5 py-1 rounded-full animate-pulse font-black">LIVE</span>
          )}
          {match.isSuspended && (
            <span className="bg-amber-500 text-primary text-xs px-2.5 py-1 rounded-full font-black">
              KUOTAT E PEZULLUARA
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center px-2 sm:px-8 gap-2 sm:gap-4">
          <h2 className="text-lg sm:text-2xl font-bold text-white flex-1 text-center sm:text-right">{match.homeTeam}</h2>
          <div className="text-2xl sm:text-3xl font-black text-accent-yellow mx-2 sm:mx-4 bg-primary/40 px-4 py-1.5 rounded-lg">
            {match.status === 'LIVE' ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}` : 'vs'}
          </div>
          <h2 className="text-lg sm:text-2xl font-bold text-white flex-1 text-center sm:text-left">{match.awayTeam}</h2>
        </div>
        <div className="text-text-secondary text-xs sm:text-sm mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="font-semibold text-text-primary">{matchTimeLabel(match.startTime, match.status)}</span>
          {match.status === 'LIVE' && (
            <span className="text-accent-red font-black text-xs sm:text-sm bg-accent-red/15 border border-accent-red/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Radio size={12} className="animate-pulse" /> {minuteLabel(match)}
            </span>
          )}
          {match.status === 'LIVE' && periodLabel(match.period || '') && (
            <span className="text-text-primary font-semibold bg-tertiary/60 px-2.5 py-0.5 rounded-full">{periodLabel(match.period || '')}</span>
          )}
        </div>

        {/* Statistikat live: kornera, kartona, posa, goditje */}
        {match.status === 'LIVE' && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-text-secondary">
            <span className="flex items-center gap-1.5 bg-primary/50 px-2.5 py-1 rounded-lg">
              <Flag size={12} className="text-accent-red" />
              Kornera
              <span className="font-bold text-text-primary">{match.homeCorners ?? 0} - {match.awayCorners ?? 0}</span>
            </span>
            <span className="flex items-center gap-1.5 bg-primary/50 px-2.5 py-1 rounded-lg">
              <AlertTriangle size={12} className="text-amber-400" />
              Kartonë
              <span className="font-bold text-text-primary">{match.homeYellow ?? 0} - {match.awayYellow ?? 0}</span>
            </span>
            {(match.homeRed || match.awayRed) ? (
              <span className="flex items-center gap-1.5 bg-primary/50 px-2.5 py-1 rounded-lg">
                <AlertTriangle size={12} className="text-red-400" />
                Të kuq
                <span className="font-bold text-accent-red">{match.homeRed ?? 0} - {match.awayRed ?? 0}</span>
              </span>
            ) : null}
            {(match.homePossession !== undefined || match.awayPossession !== undefined) && (
              <span className="flex items-center gap-1.5 bg-primary/50 px-2.5 py-1 rounded-lg">
                <Target size={12} className="text-blue-400" />
                Posa
                <span className="font-bold text-text-primary">{match.homePossession ?? 0}% - {match.awayPossession ?? 0}%</span>
              </span>
            )}
            {(match.homeShots !== undefined || match.awayShots !== undefined) && (
              <span className="flex items-center gap-1.5 bg-primary/50 px-2.5 py-1 rounded-lg">
                <CornerDownLeft size={12} className="text-green-400" />
                Goditje
                <span className="font-bold text-text-primary">{match.homeShots ?? 0} - {match.awayShots ?? 0}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {match.status === 'LIVE' && <PitchTracker matchId={match.id} match={match} />}

      <div className="space-y-4">
        {/* Krye e tregjeve: sa tregje ka gjithsej + si jane grupuar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-white font-bold text-sm uppercase tracking-wide">
            {t('sections.markets_title')} <span className="text-text-secondary font-semibold">({markets.length})</span>
          </span>
          <span className="text-[10px] text-text-secondary font-medium">
            {t('sections.grouped_by_category')} · {t('sections.minutes_auto')}
          </span>
        </div>

        {visibleSections.map((sec) => {
          const isOpen = sec.key === 'main' || openSections.has(sec.key);
          const items = sec.key === 'main' ? sortMain(sec.items) : sortByLabel(sec.items);
          return (
            <div key={sec.key} className="space-y-3">
              <button
                onClick={() => { if (sec.key !== 'main') toggleSection(sec.key); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border border-tertiary bg-tertiary/40 ${sec.key !== 'main' ? 'hover:bg-tertiary' : 'cursor-default'}`}
              >
                <span className="font-bold text-sm text-white uppercase tracking-wide">
                  {t(sec.labelKey)} <span className="text-text-secondary font-medium">({sec.items.length})</span>
                </span>
                {sec.key !== 'main' && (isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
              </button>

              {isOpen && items.map((market) => {
                const all: any[] = (market as any).outcomes || [];
                const is1x2Market =
                  market.marketType === '1X2' ||
                  market.marketType === 'HALF_RESULT' ||
                  /1x2|rezultati final|match result|full ?time result/i.test(market.name) ||
                  /^(1st half|2nd half)\.?\s*result$/i.test(market.name);

                // Hiq kuotat dublikate (i njejti opsion i perkthyer 2 here)
                const seen = new Set<string>();
                const outcomes = all.filter((o: any) => {
                  const label = outcomeLabel(o.name, {
                    marketName: market.name,
                    marketType: market.marketType,
                    teams: [match.homeTeam, match.awayTeam],
                    code: o.code
                  }).toLowerCase();
                  if (seen.has(label)) return false;
                  seen.add(label);
                  return true;
                });

                // Renditje strikte 1, X, 2 per tregjet 1X2
                const sort1X2Outcomes = (outs: any[]) => {
                  const getRank = (o: any) => {
                    const c = String(o.code || '').trim().toLowerCase();
                    if (c === '1') return 1;
                    if (c === 'x' || c === 'draw') return 2;
                    if (c === '2') return 3;
                    const n = String(o.name || '').trim().toLowerCase();
                    const h = match.homeTeam.toLowerCase();
                    const a = match.awayTeam.toLowerCase();
                    if (n === '1' || n === 'home' || n === h || n.includes(h) || h.includes(n)) return 1;
                    if (n === 'x' || n === 'draw' || n === 'tie' || n === 'barazim') return 2;
                    if (n === '2' || n === 'away' || n === a || n.includes(a) || a.includes(n)) return 3;
                    return 9;
                  };
                  return [...outs].sort((a, b) => getRank(a) - getRank(b));
                };

                const sortedOutcomes = is1x2Market ? sort1X2Outcomes(outcomes) : outcomes;
                const expanded = expandedOutcomes.has(market.id);
                const shown = expanded ? sortedOutcomes : sortedOutcomes.slice(0, OUTCOME_LIMIT);

                return (
                  <div key={market.id} className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-md">
                    <div className="bg-tertiary/70 px-4 py-2.5 font-bold text-sm text-white flex items-center justify-between gap-2">
                      <span>{marketLabel(market.name, t, tm)}</span>
                      <span className={`text-xs font-medium shrink-0 ${market.status === 'ACTIVE' ? 'text-accent-green' : 'text-amber-400'}`}>
                        {market.status === 'ACTIVE' ? t('sections.market_active') : t('sections.market_suspended')}
                      </span>
                    </div>
                    <div className={`p-3 sm:p-4 grid ${is1x2Market ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'} gap-2.5 sm:gap-4`}>
                      {shown.map((outcome: any) => (
                        <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                      ))}
                    </div>
                    {outcomes.length > OUTCOME_LIMIT && (
                      <button
                        onClick={() => toggleOutcomes(market.id)}
                        className="w-full py-2 text-xs font-bold text-text-secondary hover:text-white bg-primary/40 hover:bg-primary/70 transition"
                      >
                        {expanded ? t('sections.hide') : `${t('sections.show_all')} (${outcomes.length})`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {!showAllSections && hiddenCount > 0 && (
          <button
            onClick={() => { setShowAllSections(true); setOpenSections(new Set(SECTIONS.map((s) => s.key))); }}
            className="w-full py-3.5 rounded-xl bg-accent-green/15 border border-accent-green/40 text-accent-green font-bold text-sm hover:bg-accent-green/25 transition flex items-center justify-center gap-2 shadow-md"
          >
            <span>{t('sections.more_markets')} (+{hiddenCount})</span>
            {match.status === 'LIVE' && (
              <span className="bg-accent-red text-white text-xs px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                <Radio size={10} /> {minuteLabel(match)} · {match.homeScore ?? 0}-{match.awayScore ?? 0}
              </span>
            )}
            <ChevronDown size={16} />
          </button>
        )}
        {showAllSections && hiddenCount > 0 && (
          <button
            onClick={() => { setShowAllSections(false); setOpenSections(new Set(['main'])); }}
            className="w-full py-3 rounded-lg bg-tertiary/40 border border-tertiary text-text-secondary font-bold text-sm hover:text-white transition"
          >
            {t('sections.hide_more_markets')}
          </button>
        )}

        {markets.length === 0 && (
          <div className="p-8 text-center text-text-secondary text-sm">
            {match?.status === 'ENDED' ? 'Kjo ndeshje ka përfunduar.' : t('sections.odds_loading')}
          </div>
        )}
      </div>
    </div>
  );
}
