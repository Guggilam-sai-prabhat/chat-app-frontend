import { Button, HStack, Text, VStack } from "@chakra-ui/react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18">
            <path
                d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"
                fill="#4285F4"
            />
            <path
                d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"
                fill="#34A853"
            />
            <path
                d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"
                fill="#FBBC05"
            />
            <path
                d="M8.98 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.59A8 8 0 0 0 1.83 5.4l2.67 2.07A4.77 4.77 0 0 1 8.98 3.58z"
                fill="#EA4335"
            />
        </svg>
    );
}

function GitHubIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}

export default function OAuthButtons({ label = "continue" }: { label?: string }) {
    const handleGoogle = () => {
        window.location.href = `${API_BASE}/auth/google`;
    };

    const handleGitHub = () => {
        window.location.href = `${API_BASE}/auth/github`;
    };

    return (
        <VStack gap={3} w="100%">
            {/* Divider with label */}
            <HStack w="100%" my={2}>
                <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f0" }} />
                <Text fontSize="sm" color="gray.500" px={2}>
                    or {label} with
                </Text>
                <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f0" }} />
            </HStack>

            <Button
                w="100%"
                variant="outline"
                onClick={handleGoogle}
            >
                <HStack gap={2}>
                    <GoogleIcon />
                    <span>Continue with Google</span>
                </HStack>
            </Button>

            <Button
                w="100%"
                variant="outline"
                onClick={handleGitHub}
            >
                <HStack gap={2}>
                    <GitHubIcon />
                    <span>Continue with GitHub</span>
                </HStack>
            </Button>
        </VStack>
    );
}