import { useEffect, useRef, useState } from 'react';
import { PitchState, MatchEvent, OddsDelta } from '../types';

interface ServerMessage {
  channel: string;
  data: any;
}

export function useWebSocket() {
  const [oddsDeltas, setOddsDeltas] = useState<Record<string, OddsDelta>>({});
  const [pitchStates, setPitchStates] = useState<Record<string, PitchState>>({});
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const getWsUrl = () => {
      if (import.meta.env.VITE_WS_URL) {
        return import.meta.env.VITE_WS_URL;
      }
      if (import.meta.env.VITE_API_URL) {
        try {
          const url = new URL(import.meta.env.VITE_API_URL);
          const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${protocol}//${url.host}`;
        } catch {
          // ignore error
        }
      }
      if (typeof window !== 'undefined') {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          return 'ws://localhost:3001';
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
      }
      return 'ws://localhost:3001';
    };

    const connect = () => {
      ws.current = new WebSocket(getWsUrl());

      ws.current.onopen = () => {
        console.log('WS connected');
        ws.current?.send(JSON.stringify({ type: 'subscribe', channels: ['odds'] }));
        ws.current?.send(JSON.stringify({ type: 'subscribe', channels: ['matches'] }));
      };

      ws.current.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          // Server broadcasts { channel, data } format
          const channel = data.channel;
          const payload = data.data;

          if (channel === 'odds') {
            // OddsDelta from server: { matchId, outcomes: [{ outcomeId, oldOdds, newOdds }] }
            if (payload?.outcomes) {
              const deltas: Record<string, OddsDelta> = {};
              for (const o of payload.outcomes) {
                deltas[o.outcomeId] = {
                  outcomeId: o.outcomeId,
                  newOdds: o.newOdds,
                  direction: o.newOdds > o.oldOdds ? 'up' : 'down'
                };
              }
              setOddsDeltas(prev => ({ ...prev, ...deltas }));
            }
          } else if (channel?.startsWith('tracker:')) {
            // PitchState from server: { matchId, ballX, ballY, possession, attackState, homeStats, awayStats }
            if (payload?.matchId) {
              setPitchStates(prev => ({
                ...prev,
                [payload.matchId]: {
                  matchId: payload.matchId,
                  ballX: payload.ballX ?? 50,
                  ballY: payload.ballY ?? 50,
                  possessionTeam: payload.possession === 'HOME' ? 'home' : 'away',
                  eventText: payload.attackState || '',
                  homeStats: payload.homeStats || { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, yellow: 0, red: 0 },
                  awayStats: payload.awayStats || { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, yellow: 0, red: 0 }
                }
              }));
            }
          } else if (channel?.startsWith('match:')) {
            // MatchEvent from server: { matchId, type, team, minute }
            if (payload?.matchId) {
              setMatchEvents(prev => [...prev, {
                matchId: payload.matchId,
                type: payload.type || '',
                minute: payload.minute || 0,
                team: payload.team === 'HOME' ? 'home' : 'away',
                text: payload.type || ''
              }]);
            }
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.current.onclose = () => {
        console.log('WS closed, reconnecting...');
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      ws.current?.close();
    };
  }, []);

  return { oddsDeltas, pitchStates, matchEvents };
}