// Minimal interface for what we need from the ws object
interface WsLike {
  send(data: string): void;
}

const clients = new Set<WsLike>();

export function addClient(ws: WsLike): void {
  clients.add(ws);
}

export function removeClient(ws: WsLike): void {
  clients.delete(ws);
}

export type ProgressMsg =
  | { type: "progress"; stage: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function broadcast(msg: ProgressMsg): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      ws.send(payload);
    } catch {
      clients.delete(ws);
    }
  }
}
