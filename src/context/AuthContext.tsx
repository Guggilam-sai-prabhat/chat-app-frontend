import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/client";

interface AuthState {
    userId: string | null;
    email: string | null;
    displayName: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean; // true while we check tokens on first load
}

interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string) => Promise<void>;
    handleOAuthTokens: (tokens: {
        accessToken: string;
        refreshToken: string;
        userId: string;
        email: string;
        displayName?: string;
    }) => void;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();

    const [state, setState] = useState<AuthState>({
        userId: null,
        email: null,
        displayName: null,
        accessToken: localStorage.getItem("accessToken"),
        refreshToken: localStorage.getItem("refreshToken"),
        isAuthenticated: false,
        isLoading: true,
    });

    // Persist tokens whenever they change
    const setTokens = useCallback(
        (tokens: {
            accessToken: string;
            refreshToken: string;
            userId: string;
            email: string;
            displayName?: string;
        }) => {
            localStorage.setItem("accessToken", tokens.accessToken);
            localStorage.setItem("refreshToken", tokens.refreshToken);
            setState({
                userId: tokens.userId,
                email: tokens.email,
                displayName: tokens.displayName ?? null,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                isAuthenticated: true,
                isLoading: false,
            });
        },
        []
    );

    const clearAuth = useCallback(() => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        setState({
            userId: null,
            email: null,
            displayName: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
        });
    }, []);

    // ── On mount: validate existing tokens ──
    useEffect(() => {
        const bootstrap = async () => {
            const at = localStorage.getItem("accessToken");
            const rt = localStorage.getItem("refreshToken");

            if (!at && !rt) {
                setState((s) => ({ ...s, isLoading: false }));
                return;
            }

            try {
                // Try fetching profile with stored access token
                const { data } = await authApi.me();
                setState({
                    userId: data.userId,
                    email: data.email,
                    displayName: data.displayName,
                    accessToken: at,
                    refreshToken: rt,
                    isAuthenticated: true,
                    isLoading: false,
                });
            } catch {
                // The axios interceptor will attempt refresh automatically.
                // If that also fails the interceptor clears storage & redirects.
                clearAuth();
            }
        };

        bootstrap();
    }, [clearAuth]);

    // ── Listen for token-reuse events dispatched by the interceptor ──
    useEffect(() => {
        const handler = () => {
            clearAuth();
            // You can integrate a Chakra toast here if you lift toaster to this level
            alert("Security alert: suspicious activity detected. Please sign in again.");
            navigate("/login");
        };
        window.addEventListener("auth:token-reuse", handler);
        return () => window.removeEventListener("auth:token-reuse", handler);
    }, [clearAuth, navigate]);

    // ── Public methods ──
    const login = async (email: string, password: string) => {
        const { data } = await authApi.login(email, password);
        setTokens(data);
    };

    const register = async (
        displayName: string,
        email: string,
        password: string
    ) => {
        const { data } = await authApi.register(displayName, email, password);
        setTokens(data);
    };

    const handleOAuthTokens = setTokens;

    const logout = async () => {
        try {
            await authApi.logout();
        } catch {
            /* best-effort */
        }
        clearAuth();
        navigate("/login");
    };

    return (
        <AuthContext.Provider
            value={{ ...state, login, register, handleOAuthTokens, logout }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}