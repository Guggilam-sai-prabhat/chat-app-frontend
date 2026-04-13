/**
 * WebSocket manager — handles connection, reconnection with
 * exponential backoff, keepalive ping/pong, and event routing.
 */

type WsEventHandler = (data: Record<string, unknown>) => void;

interface WsManagerOptions {
    getAccessToken: () => string | null;
    getRefreshToken: () => string | null;
    refreshTokens: () => Promise<string>; // returns new accessToken
    onStatusChange: (status: WsStatus) => void;
}

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

const WS_BASE = (import.meta.env.VITE_WS_URL as string) || "ws://localhost:8000";
const PING_INTERVAL = 30_000;
const PONG_TIMEOUT = 10_000;
const MAX_BACKOFF = 30_000;

export class WsManager {
    private ws: WebSocket | null = null;
    private handlers = new Map<string, Set<WsEventHandler>>();
    private opts: WsManagerOptions;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private pongTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private intentionalClose = false;
    private lastEventTimestamp: number | null = null;
    private _status: WsStatus = "disconnected";

    constructor(opts: WsManagerOptions) {
        this.opts = opts;
    }

    get status() {
        return this._status;
    }

    get lastTimestamp() {
        return this.lastEventTimestamp;
    }

    // ── Public API ──

    connect() {
        const token = this.opts.getAccessToken();
        if (!token) return;

        this.intentionalClose = false;
        this.setStatus("connecting");

        this.ws = new WebSocket(`${WS_BASE}/ws?token=${token}`);

        this.ws.onopen = () => {
            this.reconnectAttempt = 0;
            const isReconnect = this.lastEventTimestamp !== null;
            this.setStatus("connected");
            this.startPing();

            if (isReconnect && this.lastEventTimestamp) {
                // Tell server we're reconnecting — it may send a reconnect.ack
                this.send({
                    type: "reconnect",
                    last_event_id: String(this.lastEventTimestamp),
                });
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as Record<string, unknown>;
                const type = data.type as string;

                // Track last event timestamp for reconnection
                if (data.timestamp) {
                    this.lastEventTimestamp = data.timestamp as number;
                }

                // Handle pong internally
                if (type === "pong") {
                    this.clearPongTimeout();
                    return;
                }

                // Dispatch to registered handlers
                const typeHandlers = this.handlers.get(type);
                if (typeHandlers) {
                    typeHandlers.forEach((h) => h(data));
                }

                // Also dispatch to wildcard handlers
                const wildcardHandlers = this.handlers.get("*");
                if (wildcardHandlers) {
                    wildcardHandlers.forEach((h) => h(data));
                }
            } catch {
                /* malformed message */
            }
        };

        this.ws.onclose = (event) => {
            this.stopPing();

            if (this.intentionalClose) {
                this.setStatus("disconnected");
                return;
            }

            // Token expired — server closes with 4001
            if (event.code === 4001) {
                this.handleTokenExpiredReconnect();
                return;
            }

            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            // onerror is always followed by onclose, so reconnect logic is there
        };
    }

    disconnect() {
        this.intentionalClose = true;
        this.stopPing();
        this.clearReconnectTimer();
        this.ws?.close();
        this.ws = null;
        this.setStatus("disconnected");
    }

    send(payload: Record<string, unknown>) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    /** Register a handler for a specific event type. Returns an unsubscribe fn. */
    on(type: string, handler: WsEventHandler): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)!.add(handler);
        return () => {
            this.handlers.get(type)?.delete(handler);
        };
    }

    // ── Keepalive ──

    private startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            this.send({ type: "ping" });
            this.pongTimer = setTimeout(() => {
                // No pong received — force reconnect
                this.ws?.close();
            }, PONG_TIMEOUT);
        }, PING_INTERVAL);
    }

    private stopPing() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.clearPongTimeout();
    }

    private clearPongTimeout() {
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
    }

    // ── Reconnection ──

    private async handleTokenExpiredReconnect() {
        this.setStatus("reconnecting");
        try {
            await this.opts.refreshTokens();
            this.connect();
        } catch {
            // Refresh failed — auth context will handle redirect
            this.setStatus("disconnected");
        }
    }

    private scheduleReconnect() {
        this.setStatus("reconnecting");
        const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_BACKOFF);
        this.reconnectAttempt++;

        this.reconnectTimer = setTimeout(async () => {
            // Refresh token before reconnecting to ensure it's valid
            try {
                await this.opts.refreshTokens();
            } catch {
                /* if refresh fails, connect will fail and retry again */
            }
            this.connect();
        }, delay);
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
    }

    private setStatus(s: WsStatus) {
        this._status = s;
        this.opts.onStatusChange(s);
    }
}