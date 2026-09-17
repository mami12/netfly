import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';
import OddsButton from './OddsButton';
import { minuteLabel, formatKickoff } from '../../utils/labels';
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

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [tournamentId, categoryId, sportId, isLiveOnly]);

  // Filter matches by search term
  const searchFiltered = searchTerm.trim()
    ? matches.filter(m => {
        const search = searchTerm.toLowerCase();
        return (
          m.homeTeam?.toLowerCase().includes(search) ||
          m.awayTeam?.toLowerCase().includes(search) ||
          m.tournament?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.sport?.name?.toLowerCase().includes(search)
        );
      })
    : matches;

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

  const liveMatches = filteredMatches.filter(m => m.status === 'LIVE');
  const prematchMatches = filteredMatches.filter(m => m.status !== 'LIVE');

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
    const mk = markets.find((x: any) =>
      x.marketType === '1X2' || x.name === '1X2' || /full\s*time\s*result|match\s*winner|^result$/i.test(x.name || '')
    );
    if (!mk) return { market: null, o1: null, oX: null, o2: null };
    const outs: any[] = mk.outcomes || [];
    const byCode = (c: string) => outs.find((o: any) => String(o.code || '').toLowerCase() === c);
    const byName = (re: RegExp) => outs.find((o: any) => re.test(String(o.name || '').trim()));
    const o1 = byCode('1') || byName(/^1$/) || outs.find((o: any) => o.name === m.homeTeam);
    const oX = byCode('x') || byName(/^(x|draw)$/i);
    const o2 = byCode('2') || byName(/^2$/) || outs.find((o: any) => o.name === m.awayTeam);
    return { market: mk, o1, oX, o2 };
  };

  /** Emri i plote i liges/kupes: "India - Bangalore Super Division" */
  const leagueName = (m: any) => {
    const cat = m.tournament?.category?.name;
    const tour = m.tournament?.name;
    if (cat && tour) return `${cat} - ${tour}`;
    return tour || cat || 'Të tjera';
  };

  /**
   * Grupon ndeshjet sipas ligeve/kupave: kupa indiane -> ndeshjet indiane,
   * kupa italiane -> ato italiane, etj. Ligat me shume ndeshje dalin te parat.
   */
  const groupByLeague = (list: any[]) => {
    const map = new Map<string, any[]>();
    for (const m of list) {
      const key = leagueName(m);
      const arr = map.get(key);
      if (arr) arr.push(m); else map.set(key, [m]);
    }
    return Array.from(map.entries())
      .map(([name, matches]) => ({ name, matches }))
      .sort((a, b) => b.matches.length - a.matches.length || a.name.localeCompare(b.name));
  };

  /** Ndeshjet e grupuara sipas ligeve, me krye per secilin grup. */
  const renderGrouped = (list: any[]) => (
    <div className="space-y-5">
      {groupByLeague(list).map((g) => (
        <div key={g.name} className="space-y-2.5">
          <div className="flex items-center gap-2 border-l-2 border-accent-green pl-2">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{g.name}</span>
            <span className="text-[10px] text-text-secondary font-medium shrink-0">({g.matches.length})</span>
          </div>
          <div className="space-y-3">{g.matches.map(renderMatchCard)}</div>
        </div>
      ))}
    </div>
  );

  const renderMatchCard = (m: any) => {
    const { market: market1X2, o1: outcome1, oX: outcomeX, o2: outcome2 } = pick1X2(m);

    // Tregjet dublikate (Early payout) nuk numërohen
    const totalMarketsCount = (m.markets || []).filter((mk: any) => !/early\s*payout/i.test(mk.name || '')).length;

    return (
      <div 
        key={m.id} 
        className="bg-secondary rounded-xl border border-tertiary shadow-md hover:border-text-secondary/40 transition overflow-hidden group"
      >
        {/* Card Header: Tournament & Time/Status */}
        <div className="bg-primary/50 px-4 py-2 border-b border-tertiary/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-text-secondary truncate">
            <span className="font-semibold text-text-primary truncate">
              {m.tournament?.category?.name ? `${m.tournament.category.name} - ` : ''}{m.tournament?.name || 'League'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!m.isSimulated && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded font-black tracking-wide">
                REALE
              </span>
            )}
            {m.isSuspended && (
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded font-black tracking-wide">
                 PEZULLUAR
              </span>
            )}
            {m.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 bg-accent-red text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                <Radio size={10} />
                LIVE · {minuteLabel(m)}
              </span>
            ) : (
              <span className="text-text-secondary flex items-center gap-1">
                <Clock size={12} />
                {formatKickoff(m.startTime)}
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
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            {market1X2 && outcome1 && outcomeX && outcome2 ? (
              <div className="grid grid-cols-3 gap-1.5 flex-1 sm:w-64 sm:flex-initial">
                <OddsButton match={m} market={market1X2} outcome={outcome1} />
                <OddsButton match={m} market={market1X2} outcome={outcomeX} />
                <OddsButton match={m} market={market1X2} outcome={outcome2} />
              </div>
            ) : (
              <div className="text-xs text-text-secondary italic px-2" title="Kuotat nuk janë ende të disponueshme">
                —
              </div>
            )}

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
          </div>

          {renderGrouped(liveMatches)}
        </div>
      )}

      {/* Prematch / Upcoming Section */}
      {prematchMatches.length > 0 && (
        <div className="space-y-3">
          <div className="text-white font-bold text-sm tracking-wide uppercase flex items-center justify-between">
            <span>{isLiveOnly ? t('sections.live_now') : t('sections.upcoming_fixtures')} ({prematchMatches.length})</span>
          </div>

          {renderGrouped(prematchMatches)}
        </div>
      )}
    </div>
  );
}