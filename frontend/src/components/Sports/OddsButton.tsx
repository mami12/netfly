import { useEffect, useState } from 'react';
import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveOdds } from '../../api/oddsStore';
import { outcomeLabel } from '../../utils/labels';

interface Props { match: Match; market: Market; outcome: Outcome; }

export default function OddsButton({ match, market, outcome }: Props) {
  const { selections, addSelection, removeSelection } = useBetslip();
  // Kuota live nga store-i i perbashket (nje lidhje WS per te gjithe faqen, jo per buton)
  const live = useLiveOdds(outcome.id);
  const [flashClass, setFlashClass] = useState('');
  const [prevOdds, setPrevOdds] = useState<number | null>(null);

  // Etiketa shqip: për 1X2 dalin vetëm "1", "X", "2" (jo emrat e ekipeve).
  const label = outcomeLabel(outcome.name, {
    marketName: market.name,
    marketType: market.marketType,
    teams: [match.homeTeam, match.awayTeam],
    code: outcome.code
  });

  const is1x2 =
    market.marketType === '1X2' ||
    market.marketType === 'HALF_RESULT' ||
    /1x2|rezultati final|match result|full ?time result/i.test(market.name) ||
    /^(1st half|2nd half)\.?\s*result$/i.test(market.name);

  const betslipOutcomeName = is1x2
    ? `${label} (${label === '1' ? match.homeTeam : label === '2' ? match.awayTeam : 'Barazim'})`
    : label || outcome.name;

  const currentOdds = live?.odds && live.odds > 0 ? live.odds : outcome.odds;

  const isSuspended =
    live?.status === 'SUSPENDED' ||
    outcome.status !== 'ACTIVE' ||
    market.status !== 'ACTIVE' ||
    match.isSuspended;

  const isSelected = selections.some(s => s.outcomeId === outcome.id);

  // Flash jeshil/kuq sahere leviz kuota
  useEffect(() => {
    if (prevOdds === null) { setPrevOdds(currentOdds); return; }
    if (currentOdds !== prevOdds) {
      setFlashClass(currentOdds > prevOdds ? 'animate-flash-green' : 'animate-flash-red');
      setPrevOdds(currentOdds);
      const t = setTimeout(() => setFlashClass(''), 1000);
      return () => clearTimeout(t);
    }
  }, [currentOdds, prevOdds]);

  const toggle = () => {
    if (isSuspended) return;
    if (isSelected) {
      removeSelection(outcome.id);
    } else {
      addSelection({
        outcomeId: outcome.id,
        matchId: match.id,
        marketId: market.id,
        outcomeName: betslipOutcomeName,
        marketName: market.name,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        odds: currentOdds
      });
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={isSuspended}
      title={isSuspended ? 'Kuota është e pezulluar' : label}
      className={`flex justify-between items-center gap-2 p-2.5 rounded border transition-colors ${flashClass}
        ${isSuspended ? 'bg-tertiary opacity-50 cursor-not-allowed border-transparent' :
          isSelected ? 'bg-primary border-accent-green text-white' : 'bg-primary border-tertiary hover:border-text-secondary text-text-primary'}`}
    >
      <span className="text-xs truncate">{label}</span>
      <span className={`font-bold text-sm shrink-0 ${isSuspended ? '' : 'text-accent-yellow'}`}>
        {isSuspended ? '🔒' : currentOdds.toFixed(2)}
      </span>
    </button>
  );
}
