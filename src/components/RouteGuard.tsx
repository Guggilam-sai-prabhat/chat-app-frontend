import { Navigate } from "react-router-dom";
import { Center, Spinner, Text, VStack } from "@chakra-ui/react";
import { useAuth } from "../context/AuthContext";

/** Wrap around routes that require authentication */
export function RequireAuth({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <Center h="100vh">
                <VStack gap={4}>
                    <Spinner size="xl" color="blue.500" />
                    <Text color="gray.500">Loading…</Text>
                </VStack>
            </Center>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

/** Redirect already-authed users away from login/register */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <Center h="100vh">
                <Spinner size="xl" color="blue.500" />
            </Center>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/channels" replace />;
    }

    return <>{children}</>;
}