import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box, Button, HStack, VStack, Text, Input, Spinner, Center,
    Badge, DialogRoot, DialogContent, DialogHeader, DialogBody,
    DialogTitle, DialogCloseTrigger, IconButton,
} from "@chakra-ui/react";
import { Search, Hash, Users, Check, X } from "lucide-react";
import { channelsApi, type BrowseChannel } from "../api/client";
import { useMessaging } from "../context/MessagingContext";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function ChannelBrowser({ open, onClose }: Props) {
    const navigate = useNavigate();
    const { selectChannel } = useMessaging();

    const [channels, setChannels] = useState<BrowseChannel[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [joiningId, setJoiningId] = useState<string | null>(null);

    // Fetch on open
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        channelsApi
            .browse()
            .then(({ data }) => setChannels(data))
            .catch(() => setChannels([]))
            .finally(() => setLoading(false));
    }, [open]);

    // Filter by search
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return channels;
        return channels.filter(
            (ch) =>
                ch.name.toLowerCase().includes(q) ||
                (ch.description?.toLowerCase().includes(q) ?? false)
        );
    }, [channels, search]);

    async function handleJoin(ch: BrowseChannel) {
        setJoiningId(ch.channelId);
        try {
            await channelsApi.join(ch.channelId);
            // Update local state to reflect membership
            setChannels((prev) =>
                prev.map((c) =>
                    c.channelId === ch.channelId
                        ? { ...c, isMember: true, memberCount: c.memberCount + 1 }
                        : c
                )
            );
        } catch {
            /* handle error */
        } finally {
            setJoiningId(null);
        }
    }

    function handleOpen(ch: BrowseChannel) {
        selectChannel(ch.channelId);
        navigate(`/channels/${ch.channelId}`);
        onClose();
    }

    return (
        <DialogRoot
            open={open}
            onOpenChange={(e) => { if (!e.open) onClose(); }}
            size="lg"
        >
            <DialogContent maxH="80vh" display="flex" flexDirection="column">
                <DialogHeader>
                    <HStack justify="space-between" w="100%">
                        <DialogTitle>Browse Channels</DialogTitle>
                        <DialogCloseTrigger asChild>
                            <IconButton aria-label="Close" variant="ghost" size="sm">
                                <X size={16} />
                            </IconButton>
                        </DialogCloseTrigger>
                    </HStack>
                </DialogHeader>

                <DialogBody flex={1} overflow="hidden" display="flex" flexDirection="column" pb={4}>
                    {/* Search */}
                    <HStack mb={4}>
                        <Search size={16} color="var(--chakra-colors-gray-400)" />
                        <Input
                            placeholder="Search channels…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            size="sm"
                        />
                    </HStack>

                    {/* Channel list */}
                    <Box flex={1} overflow="auto">
                        {loading ? (
                            <Center py={8}>
                                <VStack gap={2}>
                                    <Spinner size="md" color="blue.500" />
                                    <Text fontSize="sm" color="gray.400">Loading channels…</Text>
                                </VStack>
                            </Center>
                        ) : filtered.length === 0 ? (
                            <Center py={8}>
                                <Text color="gray.400" fontSize="sm">
                                    {search ? "No channels match your search" : "No channels available"}
                                </Text>
                            </Center>
                        ) : (
                            <VStack gap={2} align="stretch">
                                {filtered.map((ch) => (
                                    <Box
                                        key={ch.channelId}
                                        p={3}
                                        borderRadius="md"
                                        borderWidth={1}
                                        borderColor="gray.200"
                                        _dark={{ borderColor: "gray.600" }}
                                        _hover={{ bg: "gray.50", _dark: { bg: "gray.700" } }}
                                        cursor="pointer"
                                        onClick={() => ch.isMember && handleOpen(ch)}
                                    >
                                        <HStack justify="space-between" align="flex-start">
                                            <VStack align="flex-start" gap={1} flex={1} minW={0}>
                                                <HStack gap={2}>
                                                    <Hash size={14} />
                                                    <Text fontWeight="medium" fontSize="sm" truncate>
                                                        {ch.name}
                                                    </Text>
                                                </HStack>

                                                {ch.description && (
                                                    <Text fontSize="xs" color="gray.500" maxLines={2}>
                                                        {ch.description}
                                                    </Text>
                                                )}

                                                <HStack gap={1}>
                                                    <Users size={12} color="var(--chakra-colors-gray-400)" />
                                                    <Text fontSize="xs" color="gray.400">
                                                        {ch.memberCount} {ch.memberCount === 1 ? "member" : "members"}
                                                    </Text>
                                                </HStack>
                                            </VStack>

                                            {/* Join / Joined button */}
                                            {ch.isMember ? (
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    colorPalette="green"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpen(ch);
                                                    }}
                                                >
                                                    <Check size={12} />
                                                    Joined
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="xs"
                                                    colorPalette="blue"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleJoin(ch);
                                                    }}
                                                    loading={joiningId === ch.channelId}
                                                    loadingText="Joining…"
                                                >
                                                    Join
                                                </Button>
                                            )}
                                        </HStack>
                                    </Box>
                                ))}
                            </VStack>
                        )}
                    </Box>

                    {/* Footer count */}
                    {!loading && (
                        <Text fontSize="xs" color="gray.400" mt={3} textAlign="center">
                            {filtered.length} channel{filtered.length !== 1 ? "s" : ""}
                            {search ? " found" : " available"}
                        </Text>
                    )}
                </DialogBody>
            </DialogContent>
        </DialogRoot>
    );
}