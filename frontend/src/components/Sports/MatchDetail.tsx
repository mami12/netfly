import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { marketLabel } from '../../utils/labels';

const POLL_MS = 12000;
const OUTCOME_LIMIT = 12;

/** Radha e tregjeve kryesore (me të rëndësishmet të parat). */
const MAIN_ORDER = ['1X2', 'OVER_UNDER', 'BOTH_TEAMS_SCORE', 'DOUBLE_CHANCE', 'HANDICAP', 'TEAM_TOTAL', 'BTTS_TOTAL'];

/** Seksionet e tregjeve — lista e gjere (80+ tregje) organizohet, jo e hedhur rresht. */
const SECTIONS: { key: string; label: string; match: (m: Market) => boolean }[] = [
  { key: 'main', label: 'Tregjet kryesore', match: (m) => MAIN_ORDER.includes(m.marketType) },
  { key: 'goals', label: 'Gola & Rezultati i saktë', match: (m) => ['CORRECT_SCORE', 'EXACT_GOALS', 'ODD_EVEN'].includes(m.marketType) },
  { key: 'halves', label: 'Pjesët e ndeshjes', match: (m) => m.marketType.startsWith('HALF_') || /1st half|2nd half|halftime/i.test(m.name) },
  { key: 'stats', label: 'Statistika & Kornera', match: (m) => m.marketType.startsWith('STATS_') || /corner|card|shot|offside/i.test(m.name) },
  { key: 'players', label: 'Lojtarët', match: (m) => m.marketType === 'PLAYER_PROP' || /player/i.test(m.name) },
  { key: 'other', label: 'Të tjera', match: () => true },
];

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['main']));
  const [showAllSections, setShowAllSections] = useState(false);
  const [expandedOutcomes, setExpandedOutcomes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    let alive = true;

    const load = async () => {
      try {
        const res = await apiClient.get(`/matches/${id}`);
        if (!alive) return;
        setMatch(res.data);
        const ms: Market[] = (res.data?.markets || []).filter(
          (m: Market) => !/early\s*payout/i.test(m.name || '') // dublikatat 1X2
        );
        setMarkets(ms);
      } catch (e) {
        console.error(e);
      }
    };

    load();
    const timer = setInterval(load, POLL_MS); // statuset + kuotat rifreskohen vete
    return () => { alive = false; clearInterval(timer); };
  }, [id]);

  // Klasifikimi i tregjeve ne seksione (seksioni i pare qe perputhet fiton)
  const grouped = SECTIONS.map((sec) => ({ ...sec, items: markets.filter((m) => sec.match(m)) }))
    .filter((s) => s.items.length > 0);

  const visibleSections = showAllSections ? grouped : grouped.filter((s) => s.key === 'main');
  const hiddenCount = grouped.filter((s) => s.key !== 'main').reduce((a, s) => a + s.items.length, 0);

  // Emrat e tregjeve vijne ne anglisht -> etiketa shqip (shih utils/labels.ts)

  const sortMain = (items: Market[]) =>
    [...items].sort((a, b) => {
      const ia = MAIN_ORDER.indexOf(a.marketType);
      const ib = MAIN_ORDER.indexOf(b.marketType);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

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
        <div className="text-text-secondary text-xs sm:text-sm mt-3 flex items-center justify-center gap-3">
          <span>{new Date(match.startTime).toLocaleString()}</span>
          {match.status === 'LIVE' && (
            <span className="text-accent-red font-bold">{match.currentMinute ?? 0}&#39;</span>
          )}
        </div>
      </div>

      {match.status === 'LIVE' && <PitchTracker matchId={match.id} />}

      <div className="space-y-4">
        {visibleSections.map((sec) => {
          const isOpen = sec.key === 'main' || openSections.has(sec.key);
          const items = sec.key === 'main' ? sortMain(sec.items) : sec.items;
          return (
            <div key={sec.key} className="space-y-3">
              <button
                onClick={() => { if (sec.key !== 'main') toggleSection(sec.key); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border border-tertiary bg-tertiary/40 ${sec.key !== 'main' ? 'hover:bg-tertiary' : 'cursor-default'}`}
              >
                <span className="font-bold text-sm text-white uppercase tracking-wide">
                  {sec.label} <span className="text-text-secondary font-medium">({sec.items.length})</span>
                </span>
                {sec.key !== 'main' && (isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
              </button>

              {isOpen && items.map((market) => {
                const outcomes: any[] = (market as any).outcomes || [];
                const expanded = expandedOutcomes.has(market.id);
                const shown = expanded ? outcomes : outcomes.slice(0, OUTCOME_LIMIT);
                return (
                  <div key={market.id} className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-md">
                    <div className="bg-tertiary/70 px-4 py-2.5 font-bold text-sm text-white flex items-center justify-between">
                      <span>{marketLabel(market.name, t)}</span>
                      <span className={`text-xs font-medium ${market.status === 'ACTIVE' ? 'text-accent-green' : 'text-amber-400'}`}>
                        {market.status === 'ACTIVE' ? 'Aktive' : 'Pezulluar'}
                      </span>
                    </div>
                    <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
                      {shown.map((outcome: any) => (
                        <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                      ))}
                    </div>
                    {outcomes.length > OUTCOME_LIMIT && (
                      <button
                        onClick={() => toggleOutcomes(market.id)}
                        className="w-full py-2 text-xs font-bold text-text-secondary hover:text-white bg-primary/40 hover:bg-primary/70 transition"
                      >
                        {expanded ? 'Fshih' : `Shfaq të gjitha (${outcomes.length})`}
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
            className="w-full py-3 rounded-lg bg-accent-green/15 border border-accent-green/40 text-accent-green font-bold text-sm hover:bg-accent-green/25 transition"
          >
            Tregje shtesë (+{hiddenCount})
          </button>
        )}
        {showAllSections && hiddenCount > 0 && (
          <button
            onClick={() => { setShowAllSections(false); setOpenSections(new Set(['main'])); }}
            className="w-full py-3 rounded-lg bg-tertiary/40 border border-tertiary text-text-secondary font-bold text-sm hover:text-white transition"
          >
            Fshih tregjet shtesë
          </button>
        )}

        {markets.length === 0 && (
          <div className="p-8 text-center text-text-secondary text-sm">
            Kuotat po ngarkohen... (burimi i të dhënave i dërgon brenda disa sekondash)
          </div>
        )}
      </div>
    </div>
  );
}
