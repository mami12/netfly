import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import SportsSidebar from '../components/Layout/SportsSidebar';
import BetslipSidebar from '../components/Layout/BetslipSidebar';
import MatchList from '../components/Sports/MatchList';
import MatchDetail from '../components/Sports/MatchDetail';
import Betslip from '../components/Betslip/Betslip';
import { useBetslip } from '../context/BetslipContext';
import { Radio, Layers, Ticket as TicketIcon, X, ChevronUp } from 'lucide-react';
import { formatMoney } from '../utils/format';

export default function SportsbookPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { selections, totalOdds, stake } = useBetslip();

  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [isLiveOnly, setIsLiveOnly] = useState<boolean>(false);

  // Mobile drawer states
  const [mobileSportsDrawer, setMobileSportsDrawer] = useState(false);
  const [mobileBetslipDrawer, setMobileBetslipDrawer] = useState(false);

  const handleSelectTournament = (tourId: string) => {
    setSelectedTournament(tourId);
    setSelectedCategory('');
    setSelectedSport('');
    setIsLiveOnly(false);
    setMobileSportsDrawer(false);
    if (id) navigate('/');
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedTournament('');
    setSelectedSport('');
    setIsLiveOnly(false);
    setMobileSportsDrawer(false);
    if (id) navigate('/');
  };

  const handleSelectSport = (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedTournament('');
    setSelectedCategory('');
    setIsLiveOnly(false);
    setMobileSportsDrawer(false);
    if (id) navigate('/');
  };

  const handleSelectAll = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setIsLiveOnly(false);
    setMobileSportsDrawer(false);
    if (id) navigate('/');
  };

  const handleSelectLive = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setIsLiveOnly(true);
    setMobileSportsDrawer(false);
    if (id) navigate('/');
  };

  const sportsQuickList = [
    { id: '', name: 'Të Gjitha', icon: '🌐', isLive: false },
    { id: 'live', name: 'LIVE', icon: '🔴', isLive: true },
    { id: '1', name: 'Futboll', icon: '⚽', isLive: false },
    { id: '2', name: 'Basketboll', icon: '🏀', isLive: false },
    { id: '3', name: 'Tenis', icon: '🎾', isLive: false },
    { id: '4', name: 'Hokej', icon: '🏒', isLive: false },
    { id: '5', name: 'Volejboll', icon: '🏐', isLive: false },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-primary">
      <Header />

      {/* MOBILE TOP QUICK SPORTS BAR (SCROLLABLE) */}
      <div className="lg:hidden bg-secondary border-b border-tertiary px-3 py-2 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
        <button
          onClick={() => setMobileSportsDrawer(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-tertiary border border-tertiary rounded-lg text-xs font-bold text-white shrink-0 shadow-sm"
        >
          <Layers size={14} className="text-accent-blue" />
          Ligat
        </button>

        <div className="h-5 w-px bg-tertiary shrink-0" />

        {sportsQuickList.map(s => {
          const isSelected = s.isLive
            ? isLiveOnly
            : !isLiveOnly && selectedSport === s.id && !selectedTournament;

          return (
            <button
              key={s.id || 'all'}
              onClick={() => {
                if (s.isLive) handleSelectLive();
                else if (s.id === '') handleSelectAll();
                else handleSelectSport(s.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                isSelected
                  ? s.isLive
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-accent-green text-primary shadow-md'
                  : 'bg-primary text-text-secondary hover:text-white border border-tertiary'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.name}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* DESKTOP SPORTS SIDEBAR */}
        <div className="hidden lg:flex shrink-0">
          <SportsSidebar 
            selectedTournamentId={selectedTournament}
            selectedSportId={selectedSport}
            isLiveOnly={isLiveOnly}
            onSelectTournament={handleSelectTournament}
            onSelectSport={handleSelectSport}
            onSelectCategory={handleSelectCategory}
            onSelectAll={handleSelectAll}
            onSelectLive={handleSelectLive}
          />
        </div>
        
        {/* CENTER CONTENT: MATCH LIST OR MATCH DETAIL */}
        <div className="flex-1 overflow-y-auto bg-primary pb-20 xl:pb-0">
          {id ? (
            <MatchDetail />
          ) : (
            <MatchList 
              tournamentId={selectedTournament} 
              categoryId={selectedCategory}
              sportId={selectedSport}
              isLiveOnly={isLiveOnly}
            />
          )}
        </div>

        {/* DESKTOP BETSLIP SIDEBAR */}
        <div className="hidden xl:flex shrink-0">
          <BetslipSidebar />
        </div>
      </div>

      {/* MOBILE SPORTS DRAWER MODAL */}
      {mobileSportsDrawer && (
        <div className="fixed inset-0 z-50 lg:hidden bg-black/75 backdrop-blur-sm flex">
          <div className="w-80 max-w-[85vw] bg-secondary h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <SportsSidebar 
              selectedTournamentId={selectedTournament}
              selectedSportId={selectedSport}
              isLiveOnly={isLiveOnly}
              onSelectTournament={handleSelectTournament}
              onSelectSport={handleSelectSport}
              onSelectCategory={handleSelectCategory}
              onSelectAll={handleSelectAll}
              onSelectLive={handleSelectLive}
              onClose={() => setMobileSportsDrawer(false)}
            />
          </div>
          <div className="flex-1" onClick={() => setMobileSportsDrawer(false)} />
        </div>
      )}

      {/* MOBILE FLOATING BETSLIP BOTTOM BAR (when user has picks) */}
      <div className="xl:hidden fixed bottom-0 inset-x-0 z-40 bg-secondary/95 backdrop-blur-md border-t border-tertiary p-3 shadow-2xl">
        <button
          onClick={() => setMobileBetslipDrawer(true)}
          className={`w-full py-3 px-4 rounded-xl flex items-center justify-between font-black text-sm transition shadow-lg ${
            selections.length > 0 
              ? 'bg-accent-green hover:bg-emerald-600 text-primary shadow-accent-green/20' 
              : 'bg-tertiary text-text-secondary'
          }`}
        >
          <div className="flex items-center gap-2">
            <TicketIcon size={18} />
            <span>Skedina ({selections.length})</span>
          </div>

          {selections.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-xs bg-primary/20 px-2 py-0.5 rounded font-mono">
                Koef. {totalOdds.toFixed(2)}
              </span>
              <span className="flex items-center gap-0.5 text-xs">
                Shiko <ChevronUp size={16} />
              </span>
            </div>
          ) : (
            <span className="text-xs font-normal">Kliko mbi koeficientët për të shtuar</span>
          )}
        </button>
      </div>

      {/* MOBILE BETSLIP FULL BOTTOM-SHEET MODAL */}
      {mobileBetslipDrawer && (
        <div className="fixed inset-0 z-50 xl:hidden bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-secondary rounded-t-3xl border-t border-tertiary max-h-[85vh] h-full flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-tertiary flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <TicketIcon size={18} className="text-accent-green" />
                <span>Skedina e Bastit ({selections.length} zgjedhje)</span>
              </div>
              <button
                onClick={() => setMobileBetslipDrawer(false)}
                className="p-1.5 bg-primary rounded-lg text-text-secondary hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Betslip Content */}
            <div className="flex-1 overflow-y-auto">
              <Betslip />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}