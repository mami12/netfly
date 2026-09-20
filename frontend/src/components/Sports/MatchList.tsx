import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';
import OddsButton from './OddsButton';
import { minuteLabel, formatKickoff, kickoffLabel, matchTimeLabel } from '../../utils/labels';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronRight, Clock, Shield, Search, CalendarDays } from 'lucide-react';

interface Props {
  tournamentId?: string;
  categoryId?: string;
  sportId?: string;
  isLiveOnly?: boolean;
}

type DateFilter = 'all' | 'today' | 'tomorrow';

export default function MatchList({ tournamentId, categoryId, sportId, isLiveOnly }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const { t } = useLanguage();
  const navigate = useNavigate();

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (tournamentId) params.tournamentId = tournamentId;
      if (categoryId) params.categoryId = categoryId;
      if (sportId) params.sportId = sportId;
      if (isLiveOnly) params.status = 'LIVE';

      const res = await apiClient.get('/matches', { params });
      setMatches(res.data);
    } catch (e) {
      console.error('Failed to fetch matches:', e);
    } finally {
      setLoading(false);
    }
  };

  const [, setTick] = useState(0);

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 15000); // refresh every 15s
    const tickInterval = setInterval(() => setTick((v) => v + 1), 15000); // minuta ecen live ne ekran

    const handleStatus = (e: any) => {
      const { matchId, status, minute, homeScore, awayScore, period } = e.detail || {};
      setMatches(prev => prev.map(m => {
        if (m.id === matchId) {
          return {
            ...m,
            status: status || m.status,
            currentMinute: minute !== undefined ? minute : m.currentMinute,
            period: period !== undefined ? period : m.period,
            homeScore: homeScore !== undefined ? homeScore : m.homeScore,
            awayScore: awayScore !== undefined ? awayScore : m.awayScore
          };
        }
        return m;
      }));
    };
    window.addEventListener('netfly:match-status', handleStatus);

    return () => {
      clearInterval(interval);
      clearInterval(tickInterval);
      window.removeEventListener('netfly:match-status', handleStatus);
    };
  }, [tournamentId, categoryId, sportId, isLiveOnly]);

  const cleanTeam = (s: string) =>
    String(s || '').toLowerCase().replace(/[\s\.\-_]/g, '').replace(/fc|sc|cf|ac|as|fk/g, '');

  // Filter matches by search term and remove fake outrights
  const searchFiltered = matches.filter(m => {
    const h = (m.homeTeam || '').toLowerCase();
    const a = (m.awayTeam || '').toLowerCase();
    if (h.includes('outright') || a.includes('outright') || h.includes('winner') || a.includes('winner')) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const search = searchTerm.toLowerCase();
    return (
      m.homeTeam?.toLowerCase().includes(search) ||
      m.awayTeam?.toLowerCase().includes(search) ||
      m.tournament?.name?.toLowerCase().includes(search) ||
      m.tournament?.category?.name?.toLowerCase().includes(search) ||
      m.tournament?.category?.sport?.name?.toLowerCase().includes(search)
    );
  });

  // Filter matches by date (Today / Tomorrow)
  const filteredMatches = searchFiltered.filter(m => {
    if (dateFilter === 'all') return true;
    const matchDate = new Date(m.startTime);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateFilter === 'today') {
      return matchDate >= today && matchDate < tomorrow;
    }
    if (dateFilter === 'tomorrow') {
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      return matchDate >= tomorrow && matchDate < dayAfter;
    }
    return true;
  });

  // Deduplikimi i ndeshjeve të dyfishta (LIVE ka përparësi ndaj PREMATCH)
  const uniqueMatches: typeof matches = [];
  const seenPairs = new Set<string>();
  const sortedCandidates = [...filteredMatches].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'LIVE' ? -1 : 1;
    return (b.markets?.length || 0) - (a.markets?.length || 0);
  });
  for (const m of sortedCandidates) {
    const key = `${cleanTeam(m.homeTeam)}:::${cleanTeam(m.awayTeam)}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      uniqueMatches.push(m);
    }
  }

  const liveMatches = uniqueMatches.filter(m => m.status === 'LIVE');
  const prematchMatches = uniqueMatches.filter(m => m.status !== 'LIVE');

  if (loading && matches.length === 0) {
    return (
      <div className="p-12 text-center text-text-secondary flex items-center justify-center gap-2">
        <span className="w-3 h-3 rounded-full bg-accent-green animate-ping"></span>
        {t('common.loading')}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
        <div className="text-4xl">⚽</div>
        <div className="font-bold text-white text-base">{t('common.no_results')}</div>
        <p className="text-xs text-text-secondary">{t('sections.select_sport')}</p>
      </div>
    );
  }

  /**
   * Gjen kuotat 1/X/2. Fillimisht nga `code` i feed-it (1, x, 2), pastaj nga emri
   * (ekipi vendas / Draw / ekipi mysafir) — feed-i i jep emrat e ekipeve, jo "1"/"X"/"2".
   */
  const pick1X2 = (m: any) => {
    const markets: any[] = (m.markets || []).filter((x: any) => !/early\s*payout/i.test(x.name || ''));
    // "Match time result" (rezultati ne minutën X) NUK eshte 1X2 — s'duhet te dale
    // si 1/X/2 ne liste. Preferohet tregu me 3 opsione (1 / X / 2).
    const candidates = markets.filter((x: any) => {
      const name = String(x.name || '').trim();
      if (/match time result/i.test(name)) return false;
      return x.marketType === '1X2' || /^(1x2|match winner|match result|full ?time result|result|rezultati final)$/i.test(name);
    });
    const mk = candidates.find((x: any) => ((x.outcomes || []).length === 3)) ||
               candidates.find((x: any) => ((x.outcomes || []).length >= 3)) ||
               candidates[0];
    if (!mk) return { market: null, o1: null, oX: null, o2: null };
    const outs: any[] = mk.outcomes || [];
    const byCode = (c: string) => outs.find((o: any) => String(o.code || '').toLowerCase() === c);
    const byName = (re: RegExp) => outs.find((o: any) => re.test(String(o.name || '').trim()));
    let o1 = byCode('1') || byName(/^1$/) || outs.find((o: any) => o.name === m.homeTeam || (m.homeTeam && o.name?.toLowerCase() === m.homeTeam.toLowerCase()));
    let oX = byCode('x') || byName(/^(x|draw|barazim)$/i);
    let o2 = byCode('2') || byName(/^2$/) || outs.find((o: any) => o.name === m.awayTeam || (m.awayTeam && o.name?.toLowerCase() === m.awayTeam.toLowerCase()));

    // Fallback inteligjent nese emrat e ekipeve kane dallime te vogla nga burimi
    if (outs.length === 3) {
      if (!oX) oX = outs.find((o: any) => /draw|barazim|^x$/i.test(String(o.name || '')));
      const nonDraw = outs.filter((o: any) => o !== oX);
      if (!o1 && nonDraw[0]) o1 = nonDraw[0];
      if (!o2 && nonDraw[1]) o2 = nonDraw[1];
    }

    if (o1 && !o1.code) o1.code = '1';
    if (oX && !oX.code) oX.code = 'x';
    if (o2 && !o2.code) o2.code = '2';
    return { market: mk, o1, oX, o2 };
  };

  /** Emri i plote i liges/kupes: "India - Bangalore Super Division" */
  const leagueName = (m: any) => {
    const cat = m.tournament?.category?.name;
    const tour = m.tournament?.name;
    if (cat && tour) return `${cat} - ${tour}`;
    return tour || cat || 'Të Tjera';
  };

  /** A ka filluar ndeshja brenda 10 minutave te fundit (ndeshje e re live)? */
  const isFreshlyStarted = (m: any) => {
    if (m.status !== 'LIVE') return false;
    const t = new Date(m.startTime).getTime();
    if (!Number.isFinite(t)) return false;
    const min = (Date.now() - t) / 60000;
    return min >= 0 && min <= 10;
  };

  /**
   * Grupon ndeshjet sipas kategorive/ligave: kupa indiane -> ndeshjet indiane,
   * kupa italiane -> ato italiane, etj. Grupet me shume ndeshje LIVE dalin te
   * parat, pastaj ato me ndeshjen me te afert. Ndeshjet e reja qe shtohen ose
   * fillojne kane nje grup te tyre (kategoria nuk humbet kurre).
   */
  const groupByLeague = (list: any[]) => {
    const map = new Map<string, any[]>();
    for (const m of list) {
      const key = leagueName(m);
      const arr = map.get(key);
      if (arr) arr.push(m); else map.set(key, [m]);
    }
    const collator = new Intl.Collator('sq');
    return Array.from(map.entries())
      .map(([name, matches]) => {
        const sorted = [...matches].sort((a, b) => {
          if (a.status !== b.status) return a.status === 'LIVE' ? -1 : 1; // LIVE te parat
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        return {
          name,
          matches: sorted,
          liveCount: sorted.filter((x) => x.status === 'LIVE').length,
          nextStart: new Date(sorted[0]?.startTime || 0).getTime()
        };
      })
      .sort((a, b) => b.liveCount - a.liveCount || a.nextStart - b.nextStart || collator.compare(a.name, b.name));
  };

  /** Ndeshjet e grupuara sipas kategorive/ligave, me krye per secilin grup. */
  const renderGrouped = (list: any[]) => (
    <div className="space-y-5">
      {groupByLeague(list).map((g) => (
        <div key={g.name} className="space-y-2.5">
          <div className="flex items-center gap-2 border-l-2 border-accent-green pl-2">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{g.name}</span>
            <span className="text-[10px] text-text-secondary font-medium shrink-0">({g.matches.length})</span>
            {g.liveCount > 0 && (
              <span className="text-[10px] bg-accent-red text-white font-black px-1.5 py-0.5 rounded-full shrink-0">
                {g.liveCount} LIVE
              </span>
            )}
          </div>
          <div className="space-y-3">{g.matches.map(renderMatchCard)}</div>
        </div>
      ))}
    </div>
  );

  const renderMatchCard = (m: any) => {
    const { market: market1X2, o1: outcome1, oX: outcomeX, o2: outcome2 } = pick1X2(m);

    // Numri total i tregjeve nga DB (_count) ose nga array
    const totalMarketsCount = m._count?.markets ?? (m.markets || []).filter((mk: any) => !/early\s*payout/i.test(mk.name || '')).length;

    // Ora e fillimit ne formatin 14:15 (per badge-in LIVE)
    const clockOf = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
      <div 
        key={m.id} 
        className="bg-secondary rounded-xl border border-tertiary shadow-md hover:border-text-secondary/40 transition overflow-hidden group"
      >
        {/* Card Header: Tournament & Time/Status */}
        <div className="bg-primary/50 px-4 py-2 border-b border-tertiary/60 flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2 text-text-secondary truncate">
            <span className="font-semibold text-text-primary truncate">
              {m.tournament?.category?.name ? `${m.tournament.category.name} - ` : ''}{m.tournament?.name || 'Kampionat'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isFreshlyStarted(m) && (
              <span className="bg-accent-green/20 text-accent-green border border-accent-green/40 text-[10px] px-1.5 py-0.5 rounded font-black tracking-wide">
                {t('sections.new_tag')}
              </span>
            )}
            {!m.isSimulated && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded font-black tracking-wide">
                {t('sections.real_tag')}
              </span>
            )}
            {m.isSuspended && (
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded font-black tracking-wide">
                {t('sections.suspended_tag')}
              </span>
            )}
            {m.status === 'LIVE' ? (
              <span
                className="inline-flex items-center gap-1.5 bg-accent-red text-white text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-sm"
                title={matchTimeLabel(m.startTime, m.status)}
              >
                <Radio size={10} className="animate-pulse" />
                {minuteLabel(m)} · {matchTimeLabel(m.startTime, m.status)}
              </span>
            ) : (
              <span className="text-text-secondary flex items-center gap-1 whitespace-nowrap text-xs font-semibold">
                <Clock size={12} />
                {matchTimeLabel(m.startTime, m.status)}
              </span>
            )}
          </div>
        </div>

        {/* Card Body: Teams, Score & 1X2 Odds */}
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Teams & Score (Clickable to detail) */}
          <div 
            className="flex-1 cursor-pointer space-y-1.5"
            onClick={() => navigate(`/match/${m.id}`)}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm group-hover:text-accent-green transition">
                {m.homeTeam}
              </span>
              {m.status === 'LIVE' && (
                <span className="text-accent-yellow font-black text-sm px-2 py-0.5 bg-primary rounded">
                  {m.homeScore ?? 0}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm group-hover:text-accent-green transition">
                {m.awayTeam}
              </span>
              {m.status === 'LIVE' && (
                <span className="text-accent-yellow font-black text-sm px-2 py-0.5 bg-primary rounded">
                  {m.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* 1X2 Odds Buttons Column */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-1.5 flex-1 sm:w-64 sm:flex-initial">
              {market1X2 && outcome1 ? (
                <OddsButton match={m} market={market1X2} outcome={outcome1} />
              ) : (
                <div className="bg-primary/50 border border-tertiary/60 rounded-lg py-2 px-1 text-center flex flex-col items-center justify-center min-h-[42px] select-none" title="1">
                  <span className="text-[10px] text-text-secondary font-bold">1</span>
                  <span className="text-xs text-text-secondary/40 font-bold">—</span>
                </div>
              )}
              {market1X2 && outcomeX ? (
                <OddsButton match={m} market={market1X2} outcome={outcomeX} />
              ) : (
                <div className="bg-primary/50 border border-tertiary/60 rounded-lg py-2 px-1 text-center flex flex-col items-center justify-center min-h-[42px] select-none" title="X">
                  <span className="text-[10px] text-text-secondary font-bold">X</span>
                  <span className="text-xs text-text-secondary/40 font-bold">—</span>
                </div>
              )}
              {market1X2 && outcome2 ? (
                <OddsButton match={m} market={market1X2} outcome={outcome2} />
              ) : (
                <div className="bg-primary/50 border border-tertiary/60 rounded-lg py-2 px-1 text-center flex flex-col items-center justify-center min-h-[42px] select-none" title="2">
                  <span className="text-[10px] text-text-secondary font-bold">2</span>
                  <span className="text-xs text-text-secondary/40 font-bold">—</span>
                </div>
              )}
            </div>

            {/* Link to Full Markets */}
            <button
              onClick={() => navigate(`/match/${m.id}`)}
              className="p-2 sm:p-2.5 bg-tertiary/60 hover:bg-tertiary text-text-secondary hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0"
              title={t('sections.view_markets')}
            >
              <span>+{totalMarketsCount}</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-text-secondary" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={t('common.search_matches')}
          className="w-full bg-secondary border border-tertiary rounded-xl pl-10 pr-4 py-3 text-white placeholder-text-secondary focus:outline-none focus:border-accent-green transition shadow-md"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Date Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
        <div className="flex items-center gap-1.5 text-text-secondary mr-1 shrink-0">
          <CalendarDays size={16} />
        </div>
        <button
          onClick={() => setDateFilter('all')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            dateFilter === 'all' 
              ? 'bg-accent-green text-primary shadow-md' 
              : 'bg-secondary text-text-secondary hover:bg-tertiary hover:text-white border border-tertiary'
          }`}
        >
          {t('dates.all')}
        </button>
        <button
          onClick={() => setDateFilter('today')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            dateFilter === 'today' 
              ? 'bg-accent-green text-primary shadow-md' 
              : 'bg-secondary text-text-secondary hover:bg-tertiary hover:text-white border border-tertiary'
          }`}
        >
          {t('dates.today')}
        </button>
        <button
          onClick={() => setDateFilter('tomorrow')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            dateFilter === 'tomorrow' 
              ? 'bg-accent-green text-primary shadow-md' 
              : 'bg-secondary text-text-secondary hover:bg-tertiary hover:text-white border border-tertiary'
          }`}
        >
          {t('dates.tomorrow')}
        </button>
      </div>

      {/* Search Results Count */}
      {searchTerm && (
        <div className="text-xs text-text-secondary">
          {filteredMatches.length} {t('common.results_found')}
        </div>
      )}

      {/* No search results */}
      {searchTerm && filteredMatches.length === 0 && (
        <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
          <div className="text-4xl">🔍</div>
          <div className="font-bold text-white text-base">{t('common.no_search_results')}</div>
          <p className="text-xs text-text-secondary">{t('common.try_different_search')}</p>
        </div>
      )}

      {/* No matches for selected date */}
      {!searchTerm && filteredMatches.length === 0 && (
        <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
          <div className="text-4xl">📅</div>
          <div className="font-bold text-white text-base">{t('common.no_matches_date')}</div>
        </div>
      )}

      {/* Live Matches Section */}
      {liveMatches.length > 0 && !tournamentId && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-ping"></span>
            <span className="text-accent-red font-black uppercase">{t('sections.live_now')}</span>
            <span className="text-xs text-text-secondary font-medium">({liveMatches.length})</span>
            <span className="text-[10px] text-text-secondary font-medium ml-auto hidden sm:inline">
              {t('sections.grouped_by_category')} · {t('sections.minutes_auto')}
            </span>
          </div>

          {renderGrouped(liveMatches)}
        </div>
      )}

      {/* Prematch / Upcoming Section */}
      {prematchMatches.length > 0 && (
        <div className="space-y-3">
          <div className="text-white font-bold text-sm tracking-wide uppercase flex items-center justify-between gap-2">
            <span>{isLiveOnly ? t('sections.live_now') : t('sections.upcoming_fixtures')} ({prematchMatches.length})</span>
            <span className="text-[10px] text-text-secondary font-medium normal-case hidden sm:inline">
              {t('sections.grouped_by_category')} · {t('sections.kickoff_in_albanian')}
            </span>
          </div>

          {renderGrouped(prematchMatches)}
        </div>
      )}
    </div>
  );
}