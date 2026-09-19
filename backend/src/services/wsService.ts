import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface ClientState {
  ws: WebSocket;
  channels: Set<string>;
}

export class WSService {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientState> = new Map();
  private countListeners: ((count: number) => void)[] = [];

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.set(ws, { ws, channels: new Set() });
      this.notifyCount();

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe' && Array.isArray(data.channels)) {
            const state = this.clients.get(ws);
            if (state) {
              data.channels.forEach((ch: string) => state.channels.add(ch));
            }
          }
        } catch (e) {}
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.notifyCount();
      });
    });
  }

  onClientCountChange(cb: (count: number) => void) {
    this.countListeners.push(cb);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private notifyCount() {
    const c = this.clients.size;
    for (const cb of this.countListeners) {
      try { cb(c); } catch {}
    }
  }

  broadcast(channel: string, message: any) {
    const data = JSON.stringify({ channel, data: message });
    for (const [, state] of this.clients) {
      if (state.channels.has(channel)) {
        if (state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(data);
        }
      }
    }
  }
}
