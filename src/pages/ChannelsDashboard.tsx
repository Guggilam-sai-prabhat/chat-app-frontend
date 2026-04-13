import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Box, Button, Flex, Heading, HStack, IconButton, Input,
    Text, VStack, Spinner, Center, Field, Badge, Textarea,
    DialogRoot, DialogContent, DialogHeader, DialogBody,
    DialogFooter, DialogTitle, DialogCloseTrigger,
    Alert,
} from "@chakra-ui/react";
import {
    Plus, LogOut, Send, Hash, MessageCircle,
    Clock, Check, RotateCcw, AlertCircle, Compass,
    DoorOpen,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useMessaging, type ChatMessage } from "../context/MessagingContext";
import ChannelBrowser from "../components/ChannelBrowser";

// ── Message Bubble ──

function MessageBubble({
    msg,
    isOwn,
    onRetry,
}: {
    msg: ChatMessage;
    isOwn: boolean;
    onRetry?: () => void;
}) {
    return (
        <Box
            borderWidth={msg.status === "error" ? 1 : 0}
            borderColor="red.400"
            borderRadius="md"
            px={msg.status === "error" ? 3 : 0}
            py={msg.status === "error" ? 2 : 0}
            opacity={msg.status === "pending" ? 0.65 : 1}
        >
            <HStack gap={2}>
                <Text fontWeight="bold" fontSize="sm" color={isOwn ? "blue.600" : undefined}>
                    {isOwn ? "You" : msg.displayName}
                </Text>
                <Text fontSize="xs" color="gray.400">
                    {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </Text>
                {/* Status indicator */}
                {msg.status === "pending" && <Spinner size="xs" />}
                {msg.status === "sent" && <Check size={12} color="var(--chakra-colors-green-500)" />}
                {msg.status === "error" && (
                    <HStack gap={1}>
                        <AlertCircle size={12} color="var(--chakra-colors-red-500)" />
                        <Text fontSize="xs" color="red.500">
                            {msg.errorReason || "Failed to send"}
                        </Text>
                        {msg.errorRetryable && onRetry && (
                            <IconButton
                                aria-label="Retry"
                                size="xs"
                                variant="ghost"
                                colorPalette="red"
                                onClick={onRetry}
                            >
                                <RotateCcw size={12} />
                            </IconButton>
                        )}
                    </HStack>
                )}
            </HStack>
            <Text fontSize="sm">{msg.content}</Text>
        </Box>
    );
}

// ── Reconnecting Banner ──

function ConnectionBanner({ status }: { status: string }) {
    if (status === "connected" || status === "disconnected") return null;
    return (
        <Alert.Root status="warning" size="sm" borderRadius={0}>
            <Alert.Indicator />
            <Alert.Description>
                {status === "connecting" && "Connecting to server…"}
                {status === "reconnecting" && "Connection lost. Reconnecting…"}
            </Alert.Description>
        </Alert.Root>
    );
}

// ── Main Dashboard ──

export default function ChannelsDashboard() {
    const { email, displayName, userId, logout } = useAuth();
    const {
        state,
        selectChannel,
        sendMessage,
        retryMessage,
        loadOlderMessages,
        createChannel,
        leaveChannel,
    } = useMessaging();
    const { id: urlChannelId } = useParams();
    const navigate = useNavigate();

    const [msgInput, setMsgInput] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Create channel modal
    const [modalOpen, setModalOpen] = useState(false);
    const [browseOpen, setBrowseOpen] = useState(false);
    const [newChName, setNewChName] = useState("");
    const [newChDesc, setNewChDesc] = useState("");
    const [creatingCh, setCreatingCh] = useState(false);

    // Leave channel confirmation modal
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
    const [leavingCh, setLeavingCh] = useState(false);

    // Sync URL param → context active channel
    // Use a ref to avoid re-selecting the same channel on every render
    const prevChannelRef = useRef<string | null>(null);
    useEffect(() => {
        if (urlChannelId && urlChannelId !== prevChannelRef.current) {
            prevChannelRef.current = urlChannelId;
            selectChannel(urlChannelId);
        }
    }, [urlChannelId, selectChannel]);

    // The URL param is the source of truth for active channel
    const activeChannelId = urlChannelId ?? null;

    // Auto-scroll on new messages
    const activeMessages = activeChannelId
        ? state.messages[activeChannelId] || []
        : [];

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeMessages.length]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height =
                Math.min(textareaRef.current.scrollHeight, 120) + "px";
        }
    }, [msgInput]);

    // ── Handlers ──

    function handleSend(e?: FormEvent) {
        e?.preventDefault();
        if (!msgInput.trim() || !activeChannelId) return;
        sendMessage(activeChannelId, msgInput.trim());
        setMsgInput("");
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    async function handleCreateChannel() {
        if (!newChName.trim()) return;
        setCreatingCh(true);
        try {
            const newId = await createChannel(newChName.trim(), newChDesc.trim() || undefined);
            setModalOpen(false);
            setNewChName("");
            setNewChDesc("");
            navigate(`/channels/${newId}`);
        } catch {
            /* handle */
        } finally {
            setCreatingCh(false);
        }
    }

    async function handleLeaveChannel() {
        if (!activeChannelId) return;
        setLeavingCh(true);
        try {
            await leaveChannel(activeChannelId);
            setLeaveConfirmOpen(false);
            // Navigate to /channels (no channel selected) after leaving
            const remaining = state.channels.filter((c) => c.channelId !== activeChannelId);
            if (remaining.length > 0) {
                navigate(`/channels/${remaining[0].channelId}`);
            } else {
                navigate("/channels");
            }
        } catch {
            /* handle */
        } finally {
            setLeavingCh(false);
        }
    }

    function handleChannelClick(channelId: string) {
        navigate(`/channels/${channelId}`);
    }

    const activeChannel = state.channels.find((c) => c.channelId === activeChannelId);
    const hasMore = activeChannelId
        ? state.hasMore[activeChannelId] ?? false
        : false;
    const isLoadingHistory = activeChannelId
        ? state.loadingHistory[activeChannelId] ?? false
        : false;

    return (
        <Flex h="100vh" overflow="hidden">
            {/* ══════════ Sidebar ══════════ */}
            <Box
                w="260px"
                minW="260px"
                bg="gray.100"
                _dark={{ bg: "gray.800" }}
                borderRight="1px solid"
                borderColor="gray.200"
                display="flex"
                flexDirection="column"
            >
                {/* App header */}
                <HStack p={4} gap={2} borderBottom="1px solid" borderColor="gray.200">
                    <MessageCircle size={22} />
                    <Heading size="sm">ChatApp</Heading>
                    {/* WS status dot */}
                    <Box
                        ml="auto"
                        w={2}
                        h={2}
                        borderRadius="full"
                        bg={
                            state.wsStatus === "connected"
                                ? "green.400"
                                : state.wsStatus === "reconnecting"
                                    ? "yellow.400"
                                    : "red.400"
                        }
                    />
                </HStack>

                {/* User info */}
                <Box px={4} py={3} borderBottom="1px solid" borderColor="gray.200">
                    <Text fontWeight="medium" fontSize="sm" truncate>
                        {displayName || "User"}
                    </Text>
                    <Text fontSize="xs" color="gray.500" truncate>
                        {email}
                    </Text>
                </Box>

                {/* Create / Browse channel buttons */}
                <Box px={4} pt={3}>
                    <VStack gap={2}>
                        <Button w="100%" size="sm" variant="outline" onClick={() => setModalOpen(true)}>
                            <Plus size={16} />
                            Create Channel
                        </Button>
                        <Button w="100%" size="sm" variant="ghost" onClick={() => setBrowseOpen(true)}>
                            <Compass size={16} />
                            Browse Channels
                        </Button>
                    </VStack>
                </Box>

                {/* Channel list */}
                <VStack flex={1} overflow="auto" p={2} gap={1} align="stretch">
                    {state.channels.length === 0 ? (
                        <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
                            No channels yet
                        </Text>
                    ) : (
                        state.channels.map((ch) => {
                            const unread = state.unreadCounts[ch.channelId] || 0;
                            const isActive = ch.channelId === activeChannelId;
                            return (
                                <Button
                                    key={ch.channelId}
                                    variant={isActive ? "solid" : "ghost"}
                                    colorPalette={isActive ? "blue" : "gray"}
                                    justifyContent="flex-start"
                                    size="sm"
                                    onClick={() => handleChannelClick(ch.channelId)}
                                >
                                    <Hash size={14} />
                                    <Text truncate flex={1} textAlign="left">
                                        {ch.name}
                                    </Text>
                                    {unread > 0 && (
                                        <Badge colorPalette="red" size="sm" borderRadius="full">
                                            {unread > 99 ? "99+" : unread}
                                        </Badge>
                                    )}
                                </Button>
                            );
                        })
                    )}
                </VStack>

                {/* Sign out */}
                <Box p={4} borderTop="1px solid" borderColor="gray.200">
                    <Button w="100%" size="sm" variant="ghost" onClick={logout}>
                        <LogOut size={16} />
                        Sign Out
                    </Button>
                </Box>
            </Box>

            {/* ══════════ Main Panel ══════════ */}
            <Flex flex={1} direction="column" overflow="hidden">
                {/* Connection banner */}
                <ConnectionBanner status={state.wsStatus} />

                {!activeChannelId ? (
                    <Center flex={1}>
                        <VStack gap={2}>
                            <Hash size={40} />
                            <Text color="gray.500">Select a channel to start chatting</Text>
                        </VStack>
                    </Center>
                ) : (
                    <>
                        {/* Channel header */}
                        <HStack
                            px={6}
                            py={3}
                            borderBottom="1px solid"
                            borderColor="gray.200"
                            bg="white"
                            _dark={{ bg: "gray.900" }}
                        >
                            <Hash size={18} />
                            <Heading size="sm">{activeChannel?.name ?? "Channel"}</Heading>
                            {state.channelStats[activeChannelId!]?.memberCount != null && (
                                <Badge variant="subtle" ml={2}>
                                    {state.channelStats[activeChannelId!].memberCount} members
                                </Badge>
                            )}
                            {/* Leave channel button */}
                            <Button
                                ml="auto"
                                size="xs"
                                variant="ghost"
                                colorPalette="red"
                                onClick={() => setLeaveConfirmOpen(true)}
                            >
                                <DoorOpen size={14} />
                                Leave
                            </Button>
                        </HStack>

                        {/* Messages area */}
                        <Box flex={1} overflow="auto" px={6} py={4}>
                            {/* Loading spinner for initial history load */}
                            {isLoadingHistory && activeMessages.length === 0 ? (
                                <Center py={8}>
                                    <VStack gap={2}>
                                        <Spinner size="lg" color="blue.500" />
                                        <Text fontSize="sm" color="gray.400">Loading messages…</Text>
                                    </VStack>
                                </Center>
                            ) : (
                                <>
                                    {/* Load older button */}
                                    {hasMore && (
                                        <Center mb={4}>
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                onClick={() => loadOlderMessages(activeChannelId!)}
                                                loading={isLoadingHistory}
                                                loadingText="Loading…"
                                            >
                                                <Clock size={12} />
                                                Load earlier messages
                                            </Button>
                                        </Center>
                                    )}

                                    {activeMessages.length === 0 ? (
                                        <Center py={8}>
                                            <Text color="gray.400">No messages yet. Say something!</Text>
                                        </Center>
                                    ) : (
                                        <VStack gap={3} align="stretch">
                                            {activeMessages.map((msg) => (
                                                <MessageBubble
                                                    key={msg.clientRequestId || msg.id}
                                                    msg={msg}
                                                    isOwn={msg.senderId === userId}
                                                    onRetry={
                                                        msg.status === "error" && msg.errorRetryable && msg.clientRequestId
                                                            ? () =>
                                                                retryMessage(
                                                                    msg.clientRequestId!,
                                                                    msg.channelId,
                                                                    msg.content
                                                                )
                                                            : undefined
                                                    }
                                                />
                                            ))}
                                            <div ref={bottomRef} />
                                        </VStack>
                                    )}
                                </>
                            )}
                        </Box>

                        {/* Message input */}
                        <Box px={6} py={3} borderTop="1px solid" borderColor="gray.200">
                            <HStack align="flex-end">
                                <Textarea
                                    ref={textareaRef}
                                    flex={1}
                                    resize="none"
                                    rows={1}
                                    placeholder={`Message #${activeChannel?.name ?? "channel"}…`}
                                    value={msgInput}
                                    onChange={(e) => setMsgInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    style={{ minHeight: "40px", maxHeight: "120px" }}
                                />
                                <IconButton
                                    aria-label="Send message"
                                    colorPalette="blue"
                                    disabled={!msgInput.trim()}
                                    onClick={() => handleSend()}
                                >
                                    <Send size={18} />
                                </IconButton>
                            </HStack>
                        </Box>
                    </>
                )}
            </Flex>

            {/* ══════════ Create Channel Modal ══════════ */}
            <DialogRoot open={modalOpen} onOpenChange={(e) => setModalOpen(e.open)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create a channel</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <VStack gap={4}>
                            <Field.Root w="100%">
                                <Field.Label>Channel name</Field.Label>
                                <Input
                                    placeholder="general"
                                    value={newChName}
                                    onChange={(e) => setNewChName(e.target.value)}
                                />
                            </Field.Root>
                            <Field.Root w="100%">
                                <Field.Label>Description (optional)</Field.Label>
                                <Textarea
                                    placeholder="What's this channel about?"
                                    value={newChDesc}
                                    onChange={(e) => setNewChDesc(e.target.value)}
                                />
                            </Field.Root>
                        </VStack>
                    </DialogBody>
                    <DialogFooter>
                        <DialogCloseTrigger asChild>
                            <Button variant="ghost">Cancel</Button>
                        </DialogCloseTrigger>
                        <Button
                            colorPalette="blue"
                            onClick={handleCreateChannel}
                            loading={creatingCh}
                            disabled={!newChName.trim()}
                        >
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </DialogRoot>

            {/* ══════════ Leave Channel Confirmation Modal ══════════ */}
            <DialogRoot open={leaveConfirmOpen} onOpenChange={(e) => setLeaveConfirmOpen(e.open)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Leave #{activeChannel?.name ?? "channel"}?</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                            You'll no longer receive messages from this channel. You can rejoin it later from Browse Channels.
                        </Text>
                    </DialogBody>
                    <DialogFooter>
                        <DialogCloseTrigger asChild>
                            <Button variant="ghost" disabled={leavingCh}>Cancel</Button>
                        </DialogCloseTrigger>
                        <Button
                            colorPalette="red"
                            onClick={handleLeaveChannel}
                            loading={leavingCh}
                        >
                            <DoorOpen size={14} />
                            Leave channel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </DialogRoot>

            {/* ══════════ Browse Channels Modal ══════════ */}
            <ChannelBrowser open={browseOpen} onClose={() => setBrowseOpen(false)} />
        </Flex>
    );
}