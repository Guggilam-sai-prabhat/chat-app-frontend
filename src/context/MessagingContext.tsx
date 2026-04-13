import {
    createContext,
    useContext,
    useReducer,
    useEffect,
    useRef,
    useCallback,
    type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { channelsApi, authApi, type Channel } from "../api/client";
import { WsManager, type WsStatus } from "../api/websocket";

// ── Types ──

export interface ChatMessage {
    id: string;
    channelId: string;
    senderId: string;
    displayName: string;
    content: string;
    timestamp: number;
    clientRequestId?: string;
    status: "pending" | "sent" | "error";
    errorRetryable?: boolean;
    errorReason?: string;
}

interface MessagingState {
    channels: Channel[];
    activeChannelId: string | null;
    messages: Record<string, ChatMessage[]>;
    hasMore: Record<string, boolean>;
    nextCursor: Record<string, number | null>;  // channelId → cursor for "load older"
    unreadCounts: Record<string, number>;
    wsStatus: WsStatus;
    channelStats: Record<string, { memberCount?: number }>;
    loadingHistory: Record<string, boolean>;
}

type Action =
    | { type: "SET_CHANNELS"; channels: Channel[] }
    | { type: "ADD_CHANNEL"; channel: Channel }
    | { type: "REMOVE_CHANNEL"; channelId: string }
    | { type: "SET_ACTIVE"; channelId: string | null }
    | { type: "SET_MESSAGES"; channelId: string; messages: ChatMessage[]; hasMore: boolean; nextCursor: number | null }
    | { type: "PREPEND_MESSAGES"; channelId: string; messages: ChatMessage[]; hasMore: boolean; nextCursor: number | null }
    | { type: "APPEND_MESSAGES"; channelId: string; messages: ChatMessage[] }
    | { type: "APPEND_MESSAGE"; channelId: string; message: ChatMessage }
    | { type: "UPDATE_MESSAGE_STATUS"; clientRequestId: string; status: "sent" | "error"; messageId?: string; errorRetryable?: boolean; errorReason?: string }
    | { type: "INCREMENT_UNREAD"; channelId: string }
    | { type: "CLEAR_UNREAD"; channelId: string }
    | { type: "SET_WS_STATUS"; status: WsStatus }
    | { type: "SET_CHANNEL_STATS"; channelId: string; memberCount: number }
    | { type: "SET_LOADING_HISTORY"; channelId: string; loading: boolean };

const initialState: MessagingState = {
    channels: [],
    activeChannelId: null,
    messages: {},
    hasMore: {},
    nextCursor: {},
    unreadCounts: {},
    wsStatus: "disconnected",
    channelStats: {},
    loadingHistory: {},
};

function reducer(state: MessagingState, action: Action): MessagingState {
    switch (action.type) {
        case "SET_CHANNELS":
            return { ...state, channels: action.channels };

        case "ADD_CHANNEL":
            if (state.channels.some((c) => c.channelId === action.channel.channelId)) return state;
            return { ...state, channels: [...state.channels, action.channel] };

        case "REMOVE_CHANNEL":
            return {
                ...state,
                channels: state.channels.filter((c) => c.channelId !== action.channelId),
                activeChannelId:
                    state.activeChannelId === action.channelId ? null : state.activeChannelId,
            };

        case "SET_ACTIVE":
            return { ...state, activeChannelId: action.channelId };

        // Initial load — replace messages entirely
        case "SET_MESSAGES":
            return {
                ...state,
                messages: { ...state.messages, [action.channelId]: action.messages },
                hasMore: { ...state.hasMore, [action.channelId]: action.hasMore },
                nextCursor: { ...state.nextCursor, [action.channelId]: action.nextCursor },
            };

        // Scroll-up pagination — prepend older messages
        case "PREPEND_MESSAGES": {
            const existing = state.messages[action.channelId] || [];
            const existingIds = new Set(existing.map((m) => m.id));
            const fresh = action.messages.filter((m) => !existingIds.has(m.id));
            return {
                ...state,
                messages: { ...state.messages, [action.channelId]: [...fresh, ...existing] },
                hasMore: { ...state.hasMore, [action.channelId]: action.hasMore },
                nextCursor: { ...state.nextCursor, [action.channelId]: action.nextCursor },
            };
        }

        // Reconnect catch-up — append missed messages
        case "APPEND_MESSAGES": {
            const existing = state.messages[action.channelId] || [];
            const existingIds = new Set(existing.map((m) => m.id));
            const fresh = action.messages.filter((m) => !existingIds.has(m.id));
            return {
                ...state,
                messages: { ...state.messages, [action.channelId]: [...existing, ...fresh] },
            };
        }

        // Single new message (live or optimistic)
        case "APPEND_MESSAGE": {
            const msgs = state.messages[action.channelId] || [];
            if (msgs.some((m) => m.id === action.message.id)) return state;
            return {
                ...state,
                messages: { ...state.messages, [action.channelId]: [...msgs, action.message] },
            };
        }

        case "UPDATE_MESSAGE_STATUS": {
            const updated = { ...state.messages };
            for (const chId of Object.keys(updated)) {
                updated[chId] = updated[chId].map((m) => {
                    if (m.clientRequestId !== action.clientRequestId) return m;
                    return {
                        ...m,
                        status: action.status,
                        id: action.messageId ?? m.id,
                        errorRetryable: action.errorRetryable,
                        errorReason: action.errorReason,
                    };
                });
            }
            return { ...state, messages: updated };
        }

        case "INCREMENT_UNREAD":
            return {
                ...state,
                unreadCounts: {
                    ...state.unreadCounts,
                    [action.channelId]: (state.unreadCounts[action.channelId] || 0) + 1,
                },
            };

        case "CLEAR_UNREAD":
            return {
                ...state,
                unreadCounts: { ...state.unreadCounts, [action.channelId]: 0 },
            };

        case "SET_WS_STATUS":
            return { ...state, wsStatus: action.status };

        case "SET_CHANNEL_STATS":
            return {
                ...state,
                channelStats: {
                    ...state.channelStats,
                    [action.channelId]: { memberCount: action.memberCount },
                },
            };

        case "SET_LOADING_HISTORY":
            return {
                ...state,
                loadingHistory: { ...state.loadingHistory, [action.channelId]: action.loading },
            };

        default:
            return state;
    }
}

// ── Context ──

interface MessagingContextValue {
    state: MessagingState;
    selectChannel: (channelId: string) => void;
    sendMessage: (channelId: string, content: string) => void;
    retryMessage: (clientRequestId: string, channelId: string, content: string) => void;
    loadOlderMessages: (channelId: string) => void;
    createChannel: (name: string, description?: string) => Promise<string>;
    leaveChannel: (channelId: string) => void;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

// ── Provider ──

let requestIdCounter = 0;
function generateRequestId(): string {
    return `msg_${Date.now()}_${++requestIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function MessagingProvider({ children }: { children: ReactNode }) {
    const { accessToken, userId, displayName, isAuthenticated } = useAuth();
    const [state, dispatch] = useReducer(reducer, initialState);
    const wsRef = useRef<WsManager | null>(null);
    const activeChannelRef = useRef<string | null>(null);

    // Track what we need across callbacks without stale closures
    activeChannelRef.current = state.activeChannelId;

    // Track pending history requests to know if response is initial load vs pagination
    const pendingHistoryType = useRef<Record<string, "initial" | "older" | "catchup">>({});

    // ── Refresh helper for WsManager ──
    const refreshTokens = useCallback(async (): Promise<string> => {
        const rt = localStorage.getItem("refreshToken");
        if (!rt) throw new Error("No refresh token");
        const { data } = await authApi.refresh(rt);
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        return data.accessToken;
    }, []);

    // ── Helper: request initial history for a channel ──
    const requestInitialHistory = useCallback((channelId: string) => {
        if (!wsRef.current) return;
        dispatch({ type: "SET_LOADING_HISTORY", channelId, loading: true });
        pendingHistoryType.current[channelId] = "initial";
        wsRef.current.send({
            type: "messages.history",
            channel_id: channelId,
            limit: 50,
        });
    }, []);

    // ── Initialize WS when authenticated ──
    useEffect(() => {
        if (!isAuthenticated || !accessToken) return;

        const ws = new WsManager({
            getAccessToken: () => localStorage.getItem("accessToken"),
            getRefreshToken: () => localStorage.getItem("refreshToken"),
            refreshTokens,
            onStatusChange: (s) => dispatch({ type: "SET_WS_STATUS", status: s }),
        });

        wsRef.current = ws;

        // ── connection.established ──
        // On fresh connect or page refresh: if there's an active channel
        // (from URL), load its history immediately
        ws.on("connection.established", () => {
            const activeId = activeChannelRef.current;
            if (activeId) {
                ws.send({ type: "channel.join", channel_id: activeId });
                dispatch({ type: "SET_LOADING_HISTORY", channelId: activeId, loading: true });
                pendingHistoryType.current[activeId] = "initial";
                ws.send({
                    type: "messages.history",
                    channel_id: activeId,
                    limit: 50,
                });
                ws.send({ type: "channel.stats", channel_id: activeId });
            }
        });

        // ── reconnect.ack ──
        // After reconnection, catch up on missed messages for the active channel
        ws.on("reconnect.ack", () => {
            const activeId = activeChannelRef.current;
            if (!activeId) return;

            // Find the latest message timestamp we have for this channel
            // We need to read from the reducer state, but since this is a ref-based
            // callback we'll use a different approach — store last timestamp in a ref
        });

        // ── message.ack ──
        ws.on("message.ack", (data) => {
            const reqId = (data.client_request_id ?? data.correlation_id) as string;
            if (reqId) {
                dispatch({
                    type: "UPDATE_MESSAGE_STATUS",
                    clientRequestId: reqId,
                    status: "sent",
                    messageId: (data.message_id ?? data.messageId) as string,
                });
            }
        });

        // ── message.error ──
        ws.on("message.error", (data) => {
            const reqId = (data.client_request_id ?? data.correlation_id) as string;
            if (reqId) {
                dispatch({
                    type: "UPDATE_MESSAGE_STATUS",
                    clientRequestId: reqId,
                    status: "error",
                    errorRetryable: (data.retryable as boolean) ?? false,
                    errorReason: (data.reason as string) || "Message failed",
                });
            }
        });

        // ── message.kafka_error ──
        ws.on("message.kafka_error", (data) => {
            const reqId = (data.client_request_id ?? data.correlation_id) as string;
            if (reqId) {
                dispatch({
                    type: "UPDATE_MESSAGE_STATUS",
                    clientRequestId: reqId,
                    status: "error",
                    errorRetryable: true,
                    errorReason: "Server busy. Try again.",
                });
            }
        });

        // ── message.received (live incoming) ──
        ws.on("message.received", (data) => {
            const chId = (data.channelId ?? data.channel_id) as string;
            const msg: ChatMessage = {
                id: (data.messageId ?? data.message_id) as string,
                channelId: chId,
                senderId: (data.senderId ?? data.sender_id) as string,
                displayName: (data.displayName ?? data.display_name ?? "Unknown") as string,
                content: data.content as string,
                timestamp: data.timestamp as number,
                status: "sent",
            };

            dispatch({ type: "APPEND_MESSAGE", channelId: chId, message: msg });

            if (chId !== activeChannelRef.current) {
                dispatch({ type: "INCREMENT_UNREAD", channelId: chId });
            }
        });

        // ── messages.history (response to history requests) ──
        ws.on("messages.history", (data) => {
            const chId = data.channel_id as string;
            const rawMsgs = (data.messages as Array<Record<string, unknown>>) || [];
            const hasMore = (data.hasMore as boolean) ?? false;
            const nextCursor = (data.nextCursor as number) ?? null;

            const mapped: ChatMessage[] = rawMsgs.map((m) => ({
                id: (m.messageId ?? m.message_id ?? m.id) as string,
                channelId: chId,
                senderId: (m.senderId ?? m.sender_id) as string,
                displayName: (m.displayName ?? m.display_name ?? "Unknown") as string,
                content: m.content as string,
                timestamp: m.timestamp as number,
                status: "sent" as const,
            }));

            const reqType = pendingHistoryType.current[chId] || "initial";
            delete pendingHistoryType.current[chId];

            if (reqType === "older") {
                // Scroll-up pagination → prepend
                dispatch({ type: "PREPEND_MESSAGES", channelId: chId, messages: mapped, hasMore, nextCursor });
            } else if (reqType === "catchup") {
                // Reconnect catch-up → append missed messages
                dispatch({ type: "APPEND_MESSAGES", channelId: chId, messages: mapped });
            } else {
                // Initial load → replace
                dispatch({ type: "SET_MESSAGES", channelId: chId, messages: mapped, hasMore, nextCursor });
            }

            dispatch({ type: "SET_LOADING_HISTORY", channelId: chId, loading: false });
        });

        // ── channel.joined ──
        ws.on("channel.joined", (data) => {
            const chId = data.channel_id as string;
            if (!(data.was_already_member as boolean)) {
                channelsApi.list().then(({ data: chs }) =>
                    dispatch({ type: "SET_CHANNELS", channels: chs })
                );
            }
            ws.send({ type: "channel.stats", channel_id: chId });
        });

        // ── channel.left ──
        ws.on("channel.left", (data) => {
            if (data.error) return;
            dispatch({ type: "REMOVE_CHANNEL", channelId: data.channel_id as string });
        });

        // ── channel.stats ──
        ws.on("channel.stats", (data) => {
            dispatch({
                type: "SET_CHANNEL_STATS",
                channelId: data.channel_id as string,
                memberCount: (data.member_count ?? data.memberCount ?? data.message_count) as number,
            });
        });

        ws.connect();

        return () => {
            ws.disconnect();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, accessToken]);

    // ── Load channels via REST on mount ──
    useEffect(() => {
        if (!isAuthenticated) return;
        channelsApi
            .list()
            .then(({ data }) => dispatch({ type: "SET_CHANNELS", channels: data }))
            .catch(() => { });
    }, [isAuthenticated]);

    // ── Actions ──

    const selectChannel = useCallback(
        (channelId: string) => {
            if (!channelId) return;

            dispatch({ type: "SET_ACTIVE", channelId });
            dispatch({ type: "CLEAR_UNREAD", channelId });

            // Join (server handles idempotence)
            wsRef.current?.send({ type: "channel.join", channel_id: channelId });

            // Always request fresh history when switching channels
            requestInitialHistory(channelId);

            // Request stats
            wsRef.current?.send({ type: "channel.stats", channel_id: channelId });
        },
        [requestInitialHistory]
    );

    const sendMessage = useCallback(
        (channelId: string, content: string) => {
            if (!channelId) {
                console.error("sendMessage called without a channelId");
                return;
            }

            const clientRequestId = generateRequestId();

            const optimistic: ChatMessage = {
                id: clientRequestId,
                channelId,
                senderId: userId || "",
                displayName: displayName || "You",
                content,
                timestamp: Date.now() / 1000,
                clientRequestId,
                status: "pending",
            };
            dispatch({ type: "APPEND_MESSAGE", channelId, message: optimistic });

            wsRef.current?.send({
                type: "message.send",
                channel_id: channelId,
                content,
                client_request_id: clientRequestId,
            });
        },
        [userId, displayName]
    );

    const retryMessage = useCallback(
        (clientRequestId: string, channelId: string, content: string) => {
            dispatch({
                type: "UPDATE_MESSAGE_STATUS",
                clientRequestId,
                status: "pending" as unknown as "sent",
            });

            wsRef.current?.send({
                type: "message.send",
                channel_id: channelId,
                content,
                client_request_id: clientRequestId,
            });
        },
        []
    );

    const loadOlderMessages = useCallback(
        (channelId: string) => {
            const cursor = state.nextCursor[channelId];
            if (!cursor) return; // no cursor means nothing older to load

            dispatch({ type: "SET_LOADING_HISTORY", channelId, loading: true });
            pendingHistoryType.current[channelId] = "older";

            wsRef.current?.send({
                type: "messages.history",
                channel_id: channelId,
                limit: 50,
                before: cursor,
            });
        },
        [state.nextCursor]
    );

    const createChannel = useCallback(async (name: string, description?: string): Promise<string> => {
        const { data } = await channelsApi.create(name, description);
        dispatch({ type: "ADD_CHANNEL", channel: data });
        dispatch({ type: "SET_ACTIVE", channelId: data.channelId });
        wsRef.current?.send({ type: "channel.join", channel_id: data.channelId });
        return data.channelId;
    }, []);

    const leaveChannel = useCallback((channelId: string) => {
        wsRef.current?.send({ type: "channel.leave", channel_id: channelId });
    }, []);

    return (
        <MessagingContext.Provider
            value={{
                state,
                selectChannel,
                sendMessage,
                retryMessage,
                loadOlderMessages,
                createChannel,
                leaveChannel,
            }}
        >
            {children}
        </MessagingContext.Provider>
    );
}

export function useMessaging() {
    const ctx = useContext(MessagingContext);
    if (!ctx) throw new Error("useMessaging must be used within MessagingProvider");
    return ctx;
}