import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Center, Spinner, Text, VStack } from "@chakra-ui/react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/client";

export default function OAuthCallback() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { handleOAuthTokens } = useAuth();
    const called = useRef(false);

    useEffect(() => {
        if (called.current) return; // strict-mode guard
        called.current = true;

        const code = searchParams.get("code");
        // Detect provider from the URL path — /auth/callback?provider=google or infer
        const provider = searchParams.get("provider") || "google";

        if (!code) {
            navigate("/login?error=oauth_failed", { replace: true });
            return;
        }

        authApi
            .oauthCallback(provider, code)
            .then(({ data }) => {
                handleOAuthTokens(data);
                navigate("/channels", { replace: true });
            })
            .catch(() => {
                navigate("/login?error=oauth_failed", { replace: true });
            });
    }, [searchParams, handleOAuthTokens, navigate]);

    return (
        <Center h="100vh">
            <VStack gap={4}>
                <Spinner size="xl" color="blue.500" />
                <Text color="gray.500">Signing you in…</Text>
            </VStack>
        </Center>
    );
}