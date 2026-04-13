import { useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams, useNavigate } from "react-router-dom";
import {
    Box, Button, Center, Field, Heading, Input, Link,
    Text, VStack, Alert, IconButton, HStack,
} from "@chakra-ui/react";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import OAuthButtons from "../components/OAuthButtons";
import { AxiosError } from "axios";

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    // Error state
    const [emailErr, setEmailErr] = useState("");
    const [pwErr, setPwErr] = useState("");
    const [apiErr, setApiErr] = useState("");

    // If redirected from failed OAuth
    const oauthError = searchParams.get("error") === "oauth_failed";

    function validate(): boolean {
        let ok = true;
        setEmailErr("");
        setPwErr("");

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailErr("Enter a valid email address");
            ok = false;
        }
        if (password.length < 8) {
            setPwErr("Password must be at least 8 characters");
            ok = false;
        }
        return ok;
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setApiErr("");
        if (!validate()) return;

        setLoading(true);
        try {
            await login(email, password);
            navigate("/channels");
        } catch (err) {
            const axErr = err as AxiosError<{ detail?: string; code?: string }>;
            const status = axErr.response?.status;
            if (status === 401) {
                setApiErr("Invalid email or password");
            } else if (status === 403) {
                setApiErr("Your account has been disabled. Contact support.");
            } else {
                setApiErr("Something went wrong. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <Center minH="100vh" px={4} bg="gray.50" _dark={{ bg: "gray.900" }}>
            <Box
                w="100%"
                maxW="420px"
                bg="white"
                _dark={{ bg: "gray.800" }}
                p={8}
                borderRadius="xl"
                boxShadow="lg"
            >
                <VStack gap={6} as="form" onSubmit={handleSubmit}>
                    {/* Logo */}
                    <HStack gap={2}>
                        <MessageCircle size={28} />
                        <Heading size="lg">ChatApp</Heading>
                    </HStack>

                    <VStack gap={1}>
                        <Heading size="md">Welcome back</Heading>
                        <Text color="gray.500" fontSize="sm">Sign in to continue</Text>
                    </VStack>

                    {/* OAuth error alert */}
                    {oauthError && (
                        <Alert.Root status="error" borderRadius="md">
                            <Alert.Indicator />
                            <Alert.Description>OAuth sign-in failed. Please try again.</Alert.Description>
                        </Alert.Root>
                    )}

                    {/* API error alert */}
                    {apiErr && (
                        <Alert.Root status="error" borderRadius="md">
                            <Alert.Indicator />
                            <Alert.Description>{apiErr}</Alert.Description>
                        </Alert.Root>
                    )}

                    {/* Email */}
                    <Field.Root invalid={!!emailErr} w="100%">
                        <Field.Label>Email address</Field.Label>
                        <Input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        {emailErr && <Field.ErrorText>{emailErr}</Field.ErrorText>}
                    </Field.Root>

                    {/* Password */}
                    <Field.Root invalid={!!pwErr} w="100%">
                        <Field.Label>Password</Field.Label>
                        <HStack w="100%">
                            <Input
                                type={showPw ? "text" : "password"}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                flex={1}
                            />
                            <IconButton
                                aria-label={showPw ? "Hide password" : "Show password"}
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPw((v) => !v)}
                            >
                                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                            </IconButton>
                        </HStack>
                        {pwErr && <Field.ErrorText>{pwErr}</Field.ErrorText>}
                    </Field.Root>

                    {/* Submit */}
                    <Button
                        type="submit"
                        colorPalette="blue"
                        w="100%"
                        loading={loading}
                        loadingText="Signing in…"
                    >
                        Sign In
                    </Button>

                    <OAuthButtons label="continue" />

                    <Text fontSize="sm" color="gray.500">
                        Don't have an account?{" "}
                        <Link asChild color="blue.500" fontWeight="medium">
                            <RouterLink to="/register">Sign up</RouterLink>
                        </Link>
                    </Text>
                </VStack>
            </Box>
        </Center>
    );
}