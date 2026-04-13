import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
    baseURL: API_BASE,
    headers: { "Content-Type": "application/json" },
});

// Track if we're already refreshing to avoid loops
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
    failedQueue.forEach((p) => {
        if (token) p.resolve(token);
        else p.reject(error);
    });
    failedQueue = [];
};

// ── Request interceptor: attach Bearer token ──
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("accessToken");
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response interceptor: silent refresh on 401 ──
api.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
            _retry?: boolean;
        };

        // Only intercept 401s, skip if this is already a retry or a refresh call
        if (
            error.response?.status !== 401 ||
            originalRequest._retry ||
            originalRequest.url === "/auth/refresh" ||
            originalRequest.url === "/auth/login" ||
            originalRequest.url === "/auth/register"
        ) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            // Queue this request until the refresh completes
            return new Promise((resolve, reject) => {
                failedQueue.push({
                    resolve: (token: string) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        resolve(api(originalRequest));
                    },
                    reject,
                });
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const refreshToken = localStorage.getItem("refreshToken");
            if (!refreshToken) throw new Error("No refresh token");

            const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
                refreshToken,
            });

            const newAccess: string = data.accessToken;
            const newRefresh: string = data.refreshToken;

            localStorage.setItem("accessToken", newAccess);
            localStorage.setItem("refreshToken", newRefresh);

            processQueue(null, newAccess);

            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
            return api(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);

            // Check for TOKEN_REUSE_DETECTED
            const errData = (refreshError as AxiosError)?.response?.data as Record<
                string,
                string
            >;
            if (errData?.code === "TOKEN_REUSE_DETECTED") {
                // Dispatch a custom event so AuthContext can show a toast
                window.dispatchEvent(new CustomEvent("auth:token-reuse"));
            }

            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            window.location.href = "/login";
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

// ── Typed API helpers ──

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    userId: string;
    email: string;
    displayName?: string;
}

export interface Channel {
    channelId: string;
    name: string;
    description?: string;
    createdAt: string;
}

export interface Message {
    id: string;
    channelId: string;
    userId: string;
    displayName: string;
    content: string;
    createdAt: string;
}

export const authApi = {
    login: (email: string, password: string) =>
        api.post<AuthTokens>("/auth/login", { email, password }),

    register: (displayName: string, email: string, password: string) =>
        api.post<AuthTokens>("/auth/register", { displayName, email, password }),

    refresh: (refreshToken: string) =>
        api.post<AuthTokens>("/auth/refresh", { refreshToken }),

    logout: () => api.post("/auth/logout"),

    me: () => api.get<{ userId: string; email: string; displayName: string }>("/auth/me"),

    oauthCallback: (provider: string, code: string) =>
        api.post<AuthTokens>(`/auth/${provider}/callback`, { code }),
};

export interface BrowseChannel {
    channelId: string;
    name: string;
    description: string | null;
    createdBy: string;
    createdAt: string;
    memberCount: number;
    isMember: boolean;
}

export const channelsApi = {
    list: () => api.get<Channel[]>("/channels"),

    browse: () => api.get<BrowseChannel[]>("/channels/browse"),

    create: (name: string, description?: string) =>
        api.post<Channel>("/channels", { name, description }),

    join: (id: string) => api.post(`/channels/${id}/join`),

    messages: (channelId: string) =>
        api.get<Message[]>(`/channels/${channelId}/messages`),

    sendMessage: (channelId: string, content: string) =>
        api.post<Message>(`/channels/${channelId}/messages`, { content }),
};

export default api;