import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { 
  ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Edit3, 
  Lock, Unlock, Search, Percent, RefreshCw, AlertTriangle
} from 'lucide-react';

export default function MatchControl() {
  const { t } = useLanguage();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settle Modal State
  const [settleMatch, setSettleMatch] = useState<any | null>(null);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');

  // Outcome Edit Modal State (Manual Odds & Custom Percentage & Suspend Toggle)
  const [editOutcome, setEditOutcome] = useState<any | null>(null);
  const [editMatchName, setEditMatchName] = useState('');
  const [editMarketName, setEditMarketName] = useState('');
  const [manualOdds, setManualOdds] = useState('');
  const [customPercent, setCustomPercent] = useState('');

  // Bulk Percentage Modal State (For Match or Market)
  const [bulkModal, setBulkModal] = useState<{
    type: 'match' | 'market';
    id: string;
    title: string;
  } | null>(null);
  const [bulkPercent, setBulkPercent] = useState('');

  // Live Sports API State
  const [feedStatus, setFeedStatus] = useState<any>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchFeedStatus = async () => {
    try {
      const res = await apiClient.get('/admin/feed-status');
      setFeedStatus(res.data);
    } catch (e) {
      console.error('Error fetching feed status', e);
    }
  };

  const handleSyncMatches = async (useInputKey = false) => {
    try {
      setSyncLoading(true);
      setSyncMsg(null);
      const payload: any = {};
      if (useInputKey && apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }
      const res = await apiClient.post('/admin/sync-matches', payload);
      setSyncMsg({ text: res.data.message || 'Sinkronizimi u krye me sukses!', isError: false });
      setApiKeyInput('');
      fetchMatches();
      fetchFeedStatus();
    } catch (e: any) {
      setSyncMsg({ 
        text: e.response?.data?.error || e.message || 'Dështoi sinkronizimi me shërbimin e sportit', 
        isError: true 
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/matches');
      setMatches(res.data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    fetchFeedStatus();
  }, []);

  // Match Level Actions
  const handleToggleMatchSuspend = async (matchId: string, currentSuspended: boolean) => {
    try {
      await apiClient.patch(`/admin/matches/${matchId}/suspend`, {
        isSuspended: !currentSuspended
      });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi ndryshimi i statusit të ndeshjes');
    }
  };

  // Market Level Actions
  const handleToggleMarketSuspend = async (marketId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await apiClient.patch(`/admin/markets/${marketId}/suspend`, {
        status: nextStatus
      });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi ndryshimi i statusit të tregut');
    }
  };

  // Outcome Level Actions: Suspend/Close individual outcome
  const handleToggleOutcomeSuspend = async (outcomeId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
      await apiClient.patch(`/admin/outcomes/${outcomeId}/suspend`, {
        status: nextStatus
      });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi ndryshimi i statusit të koeficientit');
    }
  };

  // Outcome Level Actions: Quick Percentage Adjustment (+5%, +10%, -5%, etc.)
  const handleQuickOutcomePercent = async (outcomeId: string, percentage: number) => {
    try {
      await apiClient.patch(`/admin/outcomes/${outcomeId}/odds`, { percentage });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi rregullimi i koeficientëve');
    }
  };

  // Save Outcome from Modal (supports either direct manual odds, percentage, or both)
  const handleSaveOutcomeModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOutcome) return;

    try {
      const payload: any = {};
      if (manualOdds) {
        const val = parseFloat(manualOdds);
        if (isNaN(val) || val < 1.01) {
          alert('Koeficienti duhet të jetë të paktën 1.01');
          return;
        }
        payload.odds = val;
      } else if (customPercent) {
        const pct = parseFloat(customPercent);
        if (isNaN(pct)) {
          alert('Vendosni një përqindje të vlefshme (p.sh. 10 ose -5)');
          return;
        }
        payload.percentage = pct;
      }

      if (Object.keys(payload).length > 0) {
        await apiClient.patch(`/admin/outcomes/${editOutcome.id}/odds`, payload);
      }

      setEditOutcome(null);
      setManualOdds('');
      setCustomPercent('');
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi përditësimi i koeficientit');
    }
  };

  // Bulk Percentage Submit (for entire match or whole market)
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkModal || !bulkPercent) return;
    const pct = parseFloat(bulkPercent);
    if (isNaN(pct)) {
      alert('Vendosni një përqindje të vlefshme');
      return;
    }

    try {
      if (bulkModal.type === 'match') {
        await apiClient.patch(`/admin/matches/${bulkModal.id}/odds-adjust`, { percentage: pct });
      } else {
        await apiClient.patch(`/admin/markets/${bulkModal.id}/odds-adjust`, { percentage: pct });
      }
      setBulkModal(null);
      setBulkPercent('');
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi rregullimi i koeficientëve në grup');
    }
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleMatch) return;
    try {
      await apiClient.post(`/admin/matches/${settleMatch.id}/settle`, {
        homeScore: parseInt(homeScore) || 0,
        awayScore: parseInt(awayScore) || 0
      });
      setSettleMatch(null);
      setHomeScore('0');
      setAwayScore('0');
      fetchMatches();
      alert('Ndeshja u mbyll dhe skedinët fituese u kredituan me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Mbyllja e ndeshjes dështoi');
    }
  };

  const openOutcomeModal = (oc: any, matchName: string, marketName: string) => {
    setEditOutcome(oc);
    setEditMatchName(matchName);
    setEditMarketName(marketName);
    setManualOdds(String(oc.odds));
    setCustomPercent('');
  };

  const filteredMatches = matches.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.homeTeam?.toLowerCase().includes(q) ||
      m.awayTeam?.toLowerCase().includes(q) ||
      m.tournament?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Kontrolli i Plotë i Koeficientëve & Ndeshjeve</h2>
          <p className="text-text-secondary text-sm">
            Ndrysho koeficientët manualisht, rrit/uli me %, ose mbyll opsione individuale (1, X, 2, Mbi, Nën, etj.)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input 
              type="text"
              placeholder="Kerko ndeshje..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-secondary border border-tertiary rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-accent-green w-56"
            />
          </div>

          <button 
            onClick={fetchMatches}
            className="px-4 py-2 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw size={14} /> Rifresko
          </button>
        </div>
      </div>

      {/* REAL SPORTS API SYNC BANNER */}
      <div className="bg-secondary border border-tertiary rounded-xl p-4 sm:p-5 shadow-lg space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${feedStatus?.hasApiKey ? 'bg-accent-green animate-pulse' : 'bg-accent-yellow'}`}></span>
              <h3 className="text-base font-bold text-white">Shërbimi i Ndeshjeve Reale (Live Sports API)</h3>
              <span className={`text-[11px] px-2 py-0.5 rounded font-bold uppercase ${
                feedStatus?.hasApiKey ? 'bg-accent-green/20 text-accent-green border border-accent-green/30' : 'bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30'
              }`}>
                {feedStatus?.hasApiKey ? 'API e Lidhur' : 'Pa Çelës API (Simulim)'}
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              {feedStatus?.realMatchesCount > 0 
                ? `Aktualisht në platformë: ${feedStatus.realMatchesCount} ndeshje reale aktive.`
                : 'Vendosni çelësin tuaj të API (The Odds API) për të shkarkuar menjëherë ndeshjet dhe kuotat e vërteta botërore.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input 
              type="text"
              placeholder={feedStatus?.keyMasked ? `Çelësi aktiv: ${feedStatus.keyMasked}` : "Ngjit API Key këtu..."}
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-xs text-white placeholder:text-text-secondary/60 focus:outline-none focus:border-accent-green w-full sm:w-64 font-mono"
            />
            <button
              onClick={() => handleSyncMatches(true)}
              disabled={syncLoading}
              className="px-4 py-2 bg-accent-green hover:bg-emerald-600 disabled:opacity-50 text-primary font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition whitespace-nowrap shadow-lg shadow-accent-green/20"
            >
              <RefreshCw size={14} className={syncLoading ? 'animate-spin' : ''} />
              {syncLoading ? 'Duke shkarkuar...' : 'Shkarko Ndeshjet Reale Tani'}
            </button>
          </div>
        </div>

        {syncMsg && (
          <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            syncMsg.isError ? 'bg-accent-red/20 text-accent-red border border-accent-red/30' : 'bg-accent-green/20 text-accent-green border border-accent-green/30'
          }`}>
            {syncMsg.isError ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{syncMsg.text}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-text-secondary bg-secondary rounded-xl border border-tertiary">
          Duke ngarkuar ndeshjet...
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-12 text-center text-text-secondary bg-secondary rounded-xl border border-tertiary">
          Nuk u gjet asnjë ndeshje.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map(m => {
            const isExpanded = expandedMatchId === m.id;
            const matchName = `${m.homeTeam} vs ${m.awayTeam}`;

            return (
              <div key={m.id} className="bg-secondary rounded-xl border border-tertiary shadow-lg overflow-hidden transition">
                {/* MATCH ROW HEADER */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        m.status === 'LIVE' ? 'bg-accent-red text-white animate-pulse' :
                        m.status === 'ENDED' ? 'bg-tertiary text-text-secondary' : 'bg-accent-blue/20 text-accent-blue'
                      }`}>
                        {m.status} {m.status === 'LIVE' ? `${m.currentMinute || 0}'` : ''}
                      </span>
                      <span className="text-xs text-text-secondary font-medium">
                        {m.tournament?.name || 'League'} &bull; {new Date(m.startTime).toLocaleString()}
                      </span>
                      {!m.isSimulated ? (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded font-black tracking-wide">
                          NDESHJE REALE
                        </span>
                      ) : (
                        <span className="bg-slate-700/40 text-slate-400 text-[10px] px-2 py-0.5 rounded font-medium">
                          SIMULIM
                        </span>
                      )}
                      {m.isSuspended && (
                        <span className="bg-rose-500/20 text-rose-400 text-xs px-2 py-0.5 rounded font-bold flex items-center gap-1">
                          <Lock size={12} /> NDESHJA E MBYLLUR
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-bold text-white flex items-center gap-3">
                      <span>{m.homeTeam}</span>
                      <span className="px-2.5 py-0.5 bg-primary rounded text-accent-yellow font-black">
                        {m.homeScore ?? 0} - {m.awayScore ?? 0}
                      </span>
                      <span>{m.awayTeam}</span>
                    </div>
                  </div>

                  {/* MATCH ACTIONS */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Bulk Adjust Match Odds by % */}
                    <button
                      onClick={() => setBulkModal({
                        type: 'match',
                        id: m.id,
                        title: `${matchName} (Të gjithë koeficientët)`
                      })}
                      className="px-3 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue rounded-lg text-xs font-bold flex items-center gap-1 transition"
                      title="Rrit ose ul të gjithë koeficientët e kësaj ndeshjeje me %"
                    >
                      <Percent size={13} /> Rregullo Ndeshjen me %
                    </button>

                    {/* Suspend/Unlock Whole Match */}
                    <button 
                      onClick={() => handleToggleMatchSuspend(m.id, m.isSuspended)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                        m.isSuspended 
                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' 
                          : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400'
                      }`}
                    >
                      {m.isSuspended ? <Unlock size={14} /> : <Lock size={14} />}
                      {m.isSuspended ? 'Hap Ndeshjen' : 'Mbyll Ndeshjen'}
                    </button>

                    {/* Settle Score */}
                    {m.status !== 'ENDED' && (
                      <button 
                        onClick={() => { setSettleMatch(m); setHomeScore(String(m.homeScore || 0)); setAwayScore(String(m.awayScore || 0)); }}
                        className="px-3 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs flex items-center gap-1.5 transition"
                      >
                        <CheckCircle2 size={14} /> Mbyll Rezultatin
                      </button>
                    )}

                    {/* Expand/Collapse Markets */}
                    <button 
                      onClick={() => setExpandedMatchId(isExpanded ? null : m.id)}
                      className={`p-2 rounded-lg transition flex items-center gap-1 text-xs font-bold ${
                        isExpanded ? 'bg-accent-green text-primary' : 'bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white'
                      }`}
                      title="Kontrollo Tregjet & Koeficientët"
                    >
                      <span>{m.markets?.length || 0} Tregje</span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* EXPANDED MARKETS & OUTCOMES VIEW */}
                {isExpanded && (
                  <div className="p-5 bg-primary/60 border-t border-tertiary space-y-4">
                    <div className="flex items-center justify-between text-xs text-text-secondary font-bold uppercase tracking-wider">
                      <span>Tregjet & Koeficientët e Detajuar ({m.markets?.length || 0})</span>
                      <span className="text-text-secondary lowercase">
                        Kliko <strong className="text-white">🔒</strong> për të mbyllur një opsion, ose <strong className="text-white">+% / -%</strong> për ndryshim të shpejtë
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {m.markets?.map((mk: any) => (
                        <div key={mk.id} className="bg-secondary p-4 rounded-xl border border-tertiary space-y-3">
                          {/* MARKET HEADER */}
                          <div className="flex items-center justify-between pb-2 border-b border-tertiary/70">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{mk.name}</span>
                              {mk.status === 'SUSPENDED' && (
                                <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                                  TREGU I MBYLLUR
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setBulkModal({
                                  type: 'market',
                                  id: mk.id,
                                  title: `${matchName} &rarr; ${mk.name}`
                                })}
                                className="text-xs text-accent-blue hover:text-accent-blue/80 font-bold flex items-center gap-1"
                                title="Rregullo të gjithë koeficientët e këtij tregu me %"
                              >
                                <Percent size={11} /> Rregullo me %
                              </button>

                              <button 
                                onClick={() => handleToggleMarketSuspend(mk.id, mk.status)}
                                className={`text-xs px-2 py-0.5 rounded font-bold transition ${
                                  mk.status === 'ACTIVE' 
                                    ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                }`}
                              >
                                {mk.status === 'ACTIVE' ? 'Mbyll Tregun' : 'Hap Tregun'}
                              </button>
                            </div>
                          </div>

                          {/* OUTCOMES / ODDS GRID */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {mk.outcomes?.map((oc: any) => {
                              const isOcSuspended = oc.status === 'SUSPENDED';

                              return (
                                <div 
                                  key={oc.id}
                                  className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition ${
                                    isOcSuspended 
                                      ? 'bg-rose-950/20 border-rose-500/30' 
                                      : 'bg-primary/90 border-tertiary hover:border-text-secondary/60'
                                  }`}
                                >
                                  {/* Outcome Title & Suspend Toggle Button */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-text-secondary truncate" title={oc.name}>
                                      {oc.name}
                                    </span>
                                    
                                    <button
                                      onClick={() => handleToggleOutcomeSuspend(oc.id, oc.status)}
                                      className={`p-1 rounded transition ${
                                        isOcSuspended 
                                          ? 'bg-rose-500 text-white shadow-sm' 
                                          : 'text-text-secondary hover:text-rose-400 hover:bg-rose-500/10'
                                      }`}
                                      title={isOcSuspended ? 'Hap këtë koeficient (Aktivo)' : 'Mbyll/Pezullo këtë koeficient'}
                                    >
                                      {isOcSuspended ? <Lock size={12} /> : <Unlock size={12} />}
                                    </button>
                                  </div>

                                  {/* Odds Display */}
                                  <div className="flex items-center justify-between">
                                    <span className={`text-lg font-black ${
                                      isOcSuspended ? 'text-rose-400 line-through' : 'text-accent-green'
                                    }`}>
                                      {oc.odds.toFixed(2)}
                                    </span>

                                    <button
                                      onClick={() => openOutcomeModal(oc, matchName, mk.name)}
                                      className="p-1 text-text-secondary hover:text-white bg-tertiary/50 hover:bg-tertiary rounded transition"
                                      title="Ndrysho manualisht ose me përqindje"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                  </div>

                                  {/* Quick Percentage Chips */}
                                  <div className="grid grid-cols-4 gap-1 pt-1 border-t border-tertiary/40">
                                    <button
                                      onClick={() => handleQuickOutcomePercent(oc.id, -10)}
                                      className="py-0.5 text-[10px] font-bold rounded bg-tertiary/40 hover:bg-rose-500/20 text-rose-400 text-center transition"
                                      title="Ul me 10%"
                                    >
                                      -10%
                                    </button>
                                    <button
                                      onClick={() => handleQuickOutcomePercent(oc.id, -5)}
                                      className="py-0.5 text-[10px] font-bold rounded bg-tertiary/40 hover:bg-rose-500/20 text-rose-400 text-center transition"
                                      title="Ul me 5%"
                                    >
                                      -5%
                                    </button>
                                    <button
                                      onClick={() => handleQuickOutcomePercent(oc.id, 5)}
                                      className="py-0.5 text-[10px] font-bold rounded bg-tertiary/40 hover:bg-emerald-500/20 text-emerald-400 text-center transition"
                                      title="Rrit me 5%"
                                    >
                                      +5%
                                    </button>
                                    <button
                                      onClick={() => handleQuickOutcomePercent(oc.id, 10)}
                                      className="py-0.5 text-[10px] font-bold rounded bg-tertiary/40 hover:bg-emerald-500/20 text-emerald-400 text-center transition"
                                      title="Rrit me 10%"
                                    >
                                      +10%
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SETTLE SCORE MODAL */}
      {settleMatch && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Mbyll Ndeshjen & Shpërble Skedinat</h3>
            <p className="text-xs text-text-secondary mb-6">
              Shkruaj rezultatin përfundimtar për <strong className="text-white">{settleMatch.homeTeam} vs {settleMatch.awayTeam}</strong>. Të gjitha bastet fituese do të kreditohen menjëherë.
            </p>
            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1.5">{settleMatch.homeTeam}</label>
                  <input 
                    type="number" 
                    value={homeScore} 
                    onChange={e => setHomeScore(e.target.value)}
                    min="0"
                    required
                    className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white text-center text-2xl font-bold focus:outline-none focus:border-accent-green"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1.5">{settleMatch.awayTeam}</label>
                  <input 
                    type="number" 
                    value={awayScore} 
                    onChange={e => setAwayScore(e.target.value)}
                    min="0"
                    required
                    className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white text-center text-2xl font-bold focus:outline-none focus:border-accent-green"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setSettleMatch(null)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-sm transition shadow-lg shadow-accent-green/20"
                >
                  Konfirmo Mbylljen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SINGLE OUTCOME MODAL (MANUAL OR % OR SUSPEND) */}
      {editOutcome && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">Kontrolli i Koeficientit</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {editMatchName} &bull; {editMarketName}
              </p>
              <div className="mt-2 flex items-center justify-between bg-primary p-2.5 rounded-lg border border-tertiary">
                <span className="text-xs font-bold text-white">Zgjedhja: {editOutcome.name}</span>
                <span className="text-sm font-black text-accent-green">Aktual: {editOutcome.odds.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveOutcomeModal} className="space-y-4">
              {/* Manual Odds Value */}
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Vlera Manuale e Koeficientit (p.sh. 4.20)
                </label>
                <input 
                  type="number" 
                  value={manualOdds} 
                  onChange={e => {
                    setManualOdds(e.target.value);
                    setCustomPercent('');
                  }}
                  step="0.01"
                  min="1.01"
                  placeholder="p.sh. 4.20"
                  className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-lg font-bold focus:outline-none focus:border-accent-green"
                />
              </div>

              {/* Or Percent Change */}
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Ose Ndrysho me Përqindje (%)
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={customPercent} 
                    onChange={e => {
                      setCustomPercent(e.target.value);
                      if (e.target.value) {
                        const pct = parseFloat(e.target.value);
                        if (!isNaN(pct)) {
                          setManualOdds((editOutcome.odds * (1 + pct / 100)).toFixed(2));
                        }
                      }
                    }}
                    step="1"
                    placeholder="p.sh. +15 ose -10"
                    className="flex-1 bg-primary border border-tertiary rounded-lg p-2 text-white text-sm font-bold focus:outline-none focus:border-accent-green"
                  />
                  <div className="flex gap-1">
                    {[-10, -5, 5, 10].map(pct => (
                      <button
                        type="button"
                        key={pct}
                        onClick={() => {
                          setCustomPercent(String(pct));
                          setManualOdds((editOutcome.odds * (1 + pct / 100)).toFixed(2));
                        }}
                        className={`px-2 py-1 rounded text-xs font-bold transition ${
                          pct > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {pct > 0 ? `+${pct}%` : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Toggle Inside Modal */}
              <div className="pt-2 border-t border-tertiary flex items-center justify-between">
                <span className="text-xs text-text-secondary font-semibold">Statusi i Zgjedhjes:</span>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleOutcomeSuspend(editOutcome.id, editOutcome.status);
                    setEditOutcome({
                      ...editOutcome,
                      status: editOutcome.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
                    });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    editOutcome.status === 'SUSPENDED' 
                      ? 'bg-rose-500 text-white' 
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {editOutcome.status === 'SUSPENDED' ? <Lock size={12} /> : <Unlock size={12} />}
                  {editOutcome.status === 'SUSPENDED' ? 'E MBYLLUR' : 'AKTIV'}
                </button>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setEditOutcome(null)}
                  className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-xs transition"
                >
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs transition shadow-lg shadow-accent-green/20"
                >
                  Ruaj Koeficientin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK PERCENTAGE ADJUSTMENT MODAL (MATCH OR MARKET) */}
      {bulkModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Percent size={18} className="text-accent-blue" />
                Rregullim Koeficientësh me %
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Objektivi: <strong className="text-white">{bulkModal.title}</strong>
              </p>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Përqindja e Ndryshimit (%)
                </label>
                <input 
                  type="number"
                  value={bulkPercent}
                  onChange={e => setBulkPercent(e.target.value)}
                  placeholder="p.sh. 10 për +10%, ose -5 për -5%"
                  required
                  autoFocus
                  step="1"
                  className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-lg font-bold focus:outline-none focus:border-accent-green"
                />
              </div>

              {/* Quick Percentage Chips */}
              <div className="flex flex-wrap gap-2">
                {[-20, -10, -5, 5, 10, 20].map(pct => (
                  <button
                    type="button"
                    key={pct}
                    onClick={() => setBulkPercent(String(pct))}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition ${
                      pct > 0 
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400' 
                        : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {pct > 0 ? `+${pct}%` : `${pct}%`}
                  </button>
                ))}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setBulkModal(null)}
                  className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-xs transition"
                >
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs transition shadow-lg shadow-accent-green/20"
                >
                  Apliko Ndryshimin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
