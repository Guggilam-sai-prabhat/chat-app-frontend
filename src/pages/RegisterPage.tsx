import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
    Box, Button, Center, Field, Heading, Input, Link,
    Text, VStack, Alert, IconButton, HStack,
} from "@chakra-ui/react";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import OAuthButtons from "../components/OAuthButtons";
import { AxiosError } from "axios";

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    const [nameErr, setNameErr] = useState("");
    const [emailErr, setEmailErr] = useState("");
    const [pwErr, setPwErr] = useState("");
    const [confirmErr, setConfirmErr] = useState("");
    const [apiErr, setApiErr] = useState("");

    function validate(): boolean {
        let ok = true;
        setNameErr("");
        setEmailErr("");
        setPwErr("");
        setConfirmErr("");

        if (!displayName.trim() || displayName.length > 256) {
            setNameErr("Display name is required (max 256 chars)");
            ok = false;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailErr("Enter a valid email address");
            ok = false;
        }
        if (password.length < 8) {
            setPwErr("Password must be at least 8 characters");
            ok = false;
        }
        if (password !== confirmPw) {
            setConfirmErr("Passwords do not match");
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
            await register(displayName.trim(), email, password);
            navigate("/channels");
        } catch (err) {
            const axErr = err as AxiosError<{ code?: string }>;
            const code = axErr.response?.data?.code;
            if (axErr.response?.status === 409 || code === "EMAIL_TAKEN") {
                setApiErr("An account with this email already exists. Sign in instead?");
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
                <VStack gap={5} as="form" onSubmit={handleSubmit}>
                    <HStack gap={2}>
                        <MessageCircle size={28} />
                        <Heading size="lg">ChatApp</Heading>
                    </HStack>

                    <Heading size="md">Create your account</Heading>

                    {apiErr && (
                        <Alert.Root status="error" borderRadius="md">
                            <Alert.Indicator />
                            <Alert.Description>{apiErr}</Alert.Description>
                        </Alert.Root>
                    )}

                    {/* Display Name */}
                    <Field.Root invalid={!!nameErr} w="100%">
                        <Field.Label>Display name</Field.Label>
                        <Input
                            placeholder="Alice"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                        {nameErr && <Field.ErrorText>{nameErr}</Field.ErrorText>}
                    </Field.Root>

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
                                aria-label="Toggle password visibility"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPw((v) => !v)}
                            >
                                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                            </IconButton>
                        </HStack>
                        <Field.HelperText>At least 8 characters</Field.HelperText>
                        {pwErr && <Field.ErrorText>{pwErr}</Field.ErrorText>}
                    </Field.Root>

                    {/* Confirm Password */}
                    <Field.Root invalid={!!confirmErr} w="100%">
                        <Field.Label>Confirm password</Field.Label>
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                        />
                        {confirmErr && <Field.ErrorText>{confirmErr}</Field.ErrorText>}
                    </Field.Root>

                    <Button
                        type="submit"
                        colorPalette="blue"
                        w="100%"
                        loading={loading}
                        loadingText="Creating account…"
                    >
                        Create Account
                    </Button>

                    <OAuthButtons label="sign up" />

                    <Text fontSize="sm" color="gray.500">
                        Already have an account?{" "}
                        <Link asChild color="blue.500" fontWeight="medium">
                            <RouterLink to="/login">
                                Sign in
                            </RouterLink>
                        </Link>
                    </Text>
                </VStack>
            </Box>
        </Center>
    );
}