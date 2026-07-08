import type { ProgressMsg } from "./types";

export type ProgressCallback = (msg: ProgressMsg) => void;

export function connectProgressWs(
  onMessage: ProgressCallback,
  onError?: (err: Event) => void
): WebSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onmessage = (event) => {
    try {
      const msg: ProgressMsg = JSON.parse(event.data);
      onMessage(msg);
    } catch {
      // ignore malformed
    }
  };

  ws.onerror = (err) => onError?.(err);

  return ws;
}
