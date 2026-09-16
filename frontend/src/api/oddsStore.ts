/**
 * Store i vetem i kuotave live (nje lidhje e vetme WebSocket per te gjithe faqen).
 *
 * Problemi i meparshem: `OddsButton` therriste `useWebSocket()` per cdo buton,
 * pra nje ndeshje me 80 tregje hapte qindra lidhje WS dhe kuotat nuk rifreskoheshin
 * ne menyre te besueshme. Tani: nje lidhje, nje map, abonim per-outcome.
 */
import { useEffect, useSyncExternalStore } from 'react';

export interface LiveOdds {
  odds: number;
  status: string; // ACTIVE | SUSPENDED
}

const store = new Map<string, LiveOdds>();
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let started = false;
let reconnectTimer: number | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function getWsUrl(): string {
  const env = import.meta.env;
  if (env.VITE_WS_URL) return env.VITE_WS_URL;
  if (env.VITE_API_URL) {
    try {
      const url = new URL(env.VITE_API_URL);
      return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
    } catch {
      /* vazhdo */
    }
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'ws://localhost:3001';
    }
    return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  }
  return 'ws://localhost:3001';
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    ws?.send(JSON.stringify({ type: 'subscribe', channels: ['odds'] }));
  };

  ws.onmessage = (msg) => {
    try {
      const { channel, data } = JSON.parse(msg.data);
      if (channel !== 'odds' || !Array.isArray(data?.outcomes)) return;
      for (const o of data.outcomes) {
        if (!o?.outcomeId) continue;
        store.set(o.outcomeId, {
          odds: typeof o.newOdds === 'number' ? o.newOdds : 0,
          status: o.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'
        });
      }
      emit();
    } catch {
      /* mesazh jo-JSON: injoro */
    }
  };

  ws.onclose = () => {
    ws = null;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    /* mbyllja trajtohet nga onclose */
  };
}

/** Hap lidhjen (idempotente) — thirret nga cdo komponent qe perdor kuota. */
export function startOddsStream() {
  if (started) return;
  started = true;
  connect();
}

/** A është aktualisht e pezulluar kuota (nga feed-i live)? */
export function isOddsSuspended(outcomeId: string): boolean {
  return store.get(outcomeId)?.status === 'SUSPENDED';
}

/**
 * Kuota live e nje outcome-i. Kthen `undefined` derisa te vije push-i i pare —
 * ne ate rast komponenti perdor vleren nga API-ja.
 */
export function useLiveOdds(outcomeId: string): LiveOdds | undefined {
  useEffect(() => {
    startOddsStream();
  }, []);

  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store.get(outcomeId),
    () => undefined
  );
}
