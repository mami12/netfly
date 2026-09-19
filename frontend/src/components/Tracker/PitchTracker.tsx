import { useEffect, useRef } from 'react';
import { useWebSocket } from '../../api/useWebSocket';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';

interface Props {
  matchId: string;
  /** Ndeshja — statistikat perdoren kur feed-i i fushes 3D nuk dergon te dhena. */
  match?: Match | null;
}

export default function PitchTracker({ matchId, match }: Props) {
  const { pitchStates } = useWebSocket();
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const state = pitchStates[matchId];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw field
    ctx.fillStyle = '#4ade80'; // grass green
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 30, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw ball if state exists
    if (state) {
      ctx.fillStyle = '#ef4444'; // Red ball
      ctx.beginPath();
      ctx.arc(state.ballX * canvas.width, state.ballY * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }

  }, [state]);

  // Statistikat: nga fusha 3D nese ka, perndryshe nga te dhenat e ndeshjes
  const home = {
    possession: state?.homeStats?.possession ?? match?.homePossession ?? 0,
    shots: state?.homeStats?.shots ?? match?.homeShots ?? 0,
    shotsOnTarget: state?.homeStats?.shotsOnTarget ?? 0,
    corners: state?.homeStats?.corners ?? match?.homeCorners ?? 0,
    yellow: state?.homeStats?.yellow ?? match?.homeYellow ?? 0
  };
  const away = {
    possession: state?.awayStats?.possession ?? match?.awayPossession ?? 0,
    shots: state?.awayStats?.shots ?? match?.awayShots ?? 0,
    shotsOnTarget: state?.awayStats?.shotsOnTarget ?? 0,
    corners: state?.awayStats?.corners ?? match?.awayCorners ?? 0,
    yellow: state?.awayStats?.yellow ?? match?.awayYellow ?? 0
  };

  return (
    <div className="bg-secondary p-4 rounded border border-tertiary shadow-lg">
      {state ? (
        <div className="relative w-full aspect-[2/1] bg-emerald-800 rounded-lg overflow-hidden mb-4 border border-emerald-600/50 shadow-inner">
          <canvas ref={canvasRef} width={800} height={400} className="w-full h-full" />
          {state.eventText && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur text-white px-5 py-2 rounded-full font-bold text-sm border border-white/20 shadow-lg flex items-center gap-2 animate-bounce">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-yellow"></span>
              {state.eventText}
            </div>
          )}
        </div>
      ) : (
        <div className="h-12 mb-4 flex items-center justify-center gap-2 text-xs text-text-secondary bg-primary/40 rounded border border-tertiary/50">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-green animate-pulse"></span>
          {t('tracker.connecting_pitch')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:gap-6 text-sm bg-primary/40 p-3 rounded border border-tertiary/50">
        <div>
          <div className="flex justify-between mb-1.5 font-medium gap-2">
            <span className="text-text-secondary truncate">{match?.homeTeam || t('tracker.home_possession')}</span>
            <span className="text-accent-blue font-bold">{home.possession}%</span>
          </div>
          <div className="w-full bg-tertiary/60 h-2 rounded-full overflow-hidden">
            <div className="bg-accent-blue h-2 rounded-full transition-all duration-500" style={{width: `${home.possession}%`}}></div>
          </div>
          
          <div className="flex justify-between mt-2.5 text-xs text-text-secondary gap-2">
            <span>{t('tracker.shots')} <strong className="text-white">{home.shots}</strong></span>
            <span>{t('tracker.corners')} <strong className="text-white">{home.corners}</strong></span>
            <span>{t('tracker.yellow_cards')} <strong className="text-white">{home.yellow}</strong></span>
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1.5 font-medium gap-2">
            <span className="text-text-secondary truncate">{match?.awayTeam || t('tracker.away_possession')}</span>
            <span className="text-accent-red font-bold">{away.possession}%</span>
          </div>
          <div className="w-full bg-tertiary/60 h-2 rounded-full overflow-hidden">
            <div className="bg-accent-red h-2 rounded-full transition-all duration-500" style={{width: `${away.possession}%`}}></div>
          </div>
          
          <div className="flex justify-between mt-2.5 text-xs text-text-secondary gap-2">
            <span>{t('tracker.shots')} <strong className="text-white">{away.shots}</strong></span>
            <span>{t('tracker.corners')} <strong className="text-white">{away.corners}</strong></span>
            <span>{t('tracker.yellow_cards')} <strong className="text-white">{away.yellow}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
