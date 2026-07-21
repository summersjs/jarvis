"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Clipboard,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const HISTORY_KEY = "jarvis.assistant.history";
const MODE_KEY = "jarvis.assistant.outputMode";
const VOICE_KEY = "jarvis.assistant.voice";
const MODEL_KEY = "jarvis.assistant.model";
const IDENTITY_VERSION_KEY = "jarvis.assistant.identityVersion";
const IDENTITY_VERSION = "jarvis-2026-07-15-v4-desktop-chat";
const CONVERSATION_KEY = "jarvis.assistant.conversationId";
const EXECUTION_TRUTH_MIGRATION_KEY = "jarvis.assistant.executionTruthMigration";
const LEGACY_STORAGE_KEYS = {
  history: "jarvis.chloe.history",
  mode: "jarvis.chloe.outputMode",
  voice: "jarvis.chloe.voice",
  model: "jarvis.chloe.model",
};
const HAUHAU_MODEL = "fredrezones55/Qwen3.5-Uncensored-HauhauCS-Aggressive:4b";

type ChatRole = "user" | "assistant";
type OutputMode = "text" | "voice" | "both";
type VoiceId = "af_bella" | "af_nicole";
type StatusKind = "Offline" | "Connecting" | "Ready" | "Thinking" | "Speaking" | "Error";
type ReadoutKind = "morning" | "debrief";

type ClientAction = { type: "start_youtube_music" | "pause_music" | "next_track" | "previous_track" | "now_playing" };

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  collapsed?: boolean;
  toolActions?: string[];
  actionReceipts?: ActionReceipt[];
  contextResolution?: ContextResolutionMeta;
};

type ContextResolutionMeta = {
  follow_up?: boolean;
  inherited?: Record<string, string>;
  changed?: Record<string, string>;
  refreshed_live_results?: boolean;
  pending_clarification?: string | null;
  options?: Array<{ id?: string; name?: string; title?: string; action?: string }>;
};

type ActionReceipt = {
  action_id: string;
  requested_action: string;
  execution_status: "proposed" | "awaiting_confirmation" | "executing" | "succeeded" | "failed" | "verification_failed" | "unavailable" | "cancelled";
  tool_name?: string | null;
  user_message: string;
  verification?: { status: "not_required" | "pending" | "verified" | "failed" | "unavailable"; summary?: string | null; verified_at?: string | null } | null;
};

type AssistantStatus = {
  ollama?: { online: boolean; modelAvailable: boolean; model: string; models?: string[] };
  tts?: { online: boolean; defaultVoice: VoiceId; availableVoices: VoiceId[] };
  tools?: { readToolsEnabled: boolean; writeToolsEnabled: boolean; confirmationToolsEnabled: boolean; tools?: Array<{ name: string }> };
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const VOICES: Array<{ id: VoiceId; label: string }> = [
  { id: "af_bella", label: "Bella" },
  { id: "af_nicole", label: "Nicole" },
];

const MODES: Array<{ id: OutputMode; label: string }> = [
  { id: "text", label: "Text" },
  { id: "voice", label: "Voice" },
  { id: "both", label: "Both" },
];

export default function JarvisPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages());
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<OutputMode>(() => loadStoredMode());
  const [voice, setVoice] = useState<VoiceId>(() => loadStoredVoice());
  const [selectedModel, setSelectedModel] = useState(() => loadStoredModel());
  const [status, setStatus] = useState<StatusKind>("Connecting");
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>({});
  const [error, setError] = useState("");
  const [lastFailedMessage, setLastFailedMessage] = useState("");
  const [compact, setCompact] = useState(false);
  const [desktopShell, setDesktopShell] = useState(false);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [activeReadout, setActiveReadout] = useState<ReadoutKind | null>(null);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedContextOption, setSelectedContextOption] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceHint, setVoiceHint] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrls = useRef(new Map<string, string>());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceTranscriptRef = useRef("");
  const speechStopTimerRef = useRef<number | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setCompact(new URLSearchParams(window.location.search).get("mode") === "compact");
    setDesktopShell(Boolean(window.jarvisDesktop?.collapseJarvis));
    for (const key of Object.values(LEGACY_STORAGE_KEYS)) window.localStorage.removeItem(key);
    if (window.localStorage.getItem(EXECUTION_TRUTH_MIGRATION_KEY) !== IDENTITY_VERSION) {
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(MODEL_KEY);
      window.localStorage.setItem(EXECUTION_TRUTH_MIGRATION_KEY, IDENTITY_VERSION);
      setMessages([]);
      setSelectedModel("");
    }
    window.localStorage.setItem(IDENTITY_VERSION_KEY, IDENTITY_VERSION);
    void window.jarvisDesktop?.getDesktopPreferences?.().then((preferences) => {
      if (preferences.jarvisResponseMode) setMode(preferences.jarvisResponseMode);
      setTtsMuted(Boolean(preferences.ttsMuted));
      setAlwaysOnTop(Boolean(preferences.jarvisAlwaysOnTop));
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)));
    if (!userScrolledUpRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    window.localStorage.setItem(MODE_KEY, mode);
    void window.jarvisDesktop?.setDesktopPreference?.("jarvisResponseMode", mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(VOICE_KEY, voice);
  }, [voice]);

  useEffect(() => {
    window.localStorage.setItem(MODEL_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    loadStatus();
    const timer = window.setInterval(loadStatus, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      clearSpeechStopTimer();
    };
  }, []);

  useEffect(() => () => {
    stopAudio();
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const visibleMessages = useMemo(() => messages, [messages]);
  const activeContextOptions = useMemo(() => {
    const latest = messages[messages.length - 1];
    return latest?.role === "assistant" ? latest.contextResolution?.options || [] : [];
  }, [messages]);

  useEffect(() => setSelectedContextOption(0), [activeContextOptions.length, messages.length]);
  const modelOptions = useMemo(() => {
    const models = assistantStatus.ollama?.models || [];
    return Array.from(new Set([selectedModel, assistantStatus.ollama?.model || "qwen3:8b", HAUHAU_MODEL, ...models].filter(Boolean)));
  }, [assistantStatus.ollama?.model, assistantStatus.ollama?.models, selectedModel]);
  const model = selectedModel || assistantStatus.ollama?.model || "qwen3:8b";
  const voiceLabel = VOICES.find((item) => item.id === voice)?.label || "Bella";
  const toolsLabel = assistantStatus.tools?.readToolsEnabled
    ? `Read on / Writes ${assistantStatus.tools.writeToolsEnabled ? "on" : "locked"}`
    : "Offline";

  async function loadStatus() {
    try {
      const response = await fetch(`${API_BASE}/assistant/status`, { headers: { "x-api-key": API_KEY } });
      const data = await response.json();
      setAssistantStatus(data);
      setStatus(data.ollama?.online && data.ollama?.modelAvailable ? "Ready" : "Offline");
      if (!window.localStorage.getItem(MODEL_KEY) && data.ollama?.model) {
        setSelectedModel(data.ollama.model);
      }
    } catch {
      setStatus("Offline");
    }
  }

  async function askJarvis(nextHistory: ChatMessage[], requestId: string, sourceMessageId: string) {
    const response = await fetch(`${API_BASE}/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        model,
        request_id: requestId,
        source_message_id: sourceMessageId,
        conversation_id: getConversationId(),
        messages: nextHistory.map(({ role, content: body }) => ({ role, content: body })),
      }),
    });
    if (!response.ok) throw new Error(await friendlyError(response));
    const data = await response.json();
    return {
      content: data.message.content as string,
      tools: (data.tools || []).map((tool: { tool?: string }) => tool.tool).filter(Boolean) as string[],
      actions: (data.actions || []) as ActionReceipt[],
      contextResolution: (data.contextResolution || undefined) as ContextResolutionMeta | undefined,
      clientActions: (data.clientActions || []) as ClientAction[],
    };
  }

  async function runClientActions(actions: ClientAction[], fallbackContent: string) {
    let content = fallbackContent;
    for (const action of actions) {
      if (!window.jarvisDesktop?.executeMediaAction || !window.jarvisDesktop?.getMediaSession) {
        content = "I can start YouTube Music from the Jarvis desktop app, but this browser tab does not have the desktop media bridge.";
        continue;
      }
      try {
        const isImmediatePlay = action.type === "start_youtube_music";
        const initial = isImmediatePlay ? {} : await window.jarvisDesktop.getMediaSession();
        console.info("[jarvis.music] current player state", sanitizeMediaLog(initial));
        if (!isImmediatePlay && !initial?.available) {
          content = "There is no active media session. Open YouTube Music and choose something once, then I can take it from there.";
          continue;
        }
        const mediaCommand = action.type === "start_youtube_music" ? "play" : action.type === "pause_music" ? "pause" : action.type === "next_track" ? "next" : action.type === "previous_track" ? "previous" : null;
        const command = mediaCommand ? await window.jarvisDesktop.executeMediaAction(mediaCommand) : { available: true };
        console.info("[jarvis.music] playback command result", sanitizeMediaLog(command));
        const verified = mediaCommand === "play"
          ? await waitForPlayingState(window.jarvisDesktop.getMediaSession)
          : mediaCommand === "pause"
            ? await waitForPausedState(window.jarvisDesktop.getMediaSession)
          : mediaCommand
            ? await waitForTrackChange(window.jarvisDesktop.getMediaSession, initial)
            : initial;
        const actionVerified = mediaCommand === "play"
          ? Boolean(verified?.isPlaying && !verified?.stale)
          : mediaCommand === "pause"
            ? Boolean(verified?.available && !verified?.isPlaying && !verified?.stale && verified?.playbackStatus === "paused")
          : mediaCommand
            ? hasTrackChanged(initial, verified)
            : Boolean(verified?.available);
        if (actionVerified) {
          const quick = fastMediaAcknowledgment(action.type);
          const quickMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: quick, collapsed: mode === "voice" };
          console.info("[jarvis.timing] first response token", Math.round(performance.now()));
          setMessages((current) => [...current, quickMessage]);
          if (mode !== "text") void speakMessage(quickMessage);
        }
        console.info("[jarvis.music] verified playback state", sanitizeMediaLog(verified));
        const response = await fetch(`${API_BASE}/assistant/media-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({
            intent: action.type === "start_youtube_music" ? "start_music" : action.type,
            initial_playback_status: initial.playbackStatus || null,
            command_available: Boolean(command?.available),
            verified_playing: Boolean(verified?.isPlaying && !verified?.stale),
            playback_status: verified?.playbackStatus || null,
            title: verified?.title || null,
            artist: verified?.artist || null,
            track_changed: mediaCommand === "next" || mediaCommand === "previous" ? hasTrackChanged(initial, verified) : null,
            command_verified: actionVerified,
          }),
        });
        if (!response.ok) throw new Error("Media response generation failed.");
        const generated = await response.json();
        content = generated.message.content as string;
        console.info("[jarvis.music] final spoken response", content);
      } catch {
        content = "The desktop media control failed, so I won't claim the music command worked.";
      }
    }
    return content;
  }

  async function sendMessage(contentOverride?: string) {
    const content = (contentOverride ?? input).trim();
    if (!content || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    userScrolledUpRef.current = false;
    console.info("[jarvis.timing] speech/text received", Math.round(performance.now()));
    setInput("");
    setError("");
    stopAudio();

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextHistory = [...messages, userMessage].slice(-20);
    setMessages(nextHistory);
    setStatus("Thinking");

    try {
      const requestId = crypto.randomUUID();
      console.info("[jarvis.timing] intent request started", Math.round(performance.now()));
      const reply = await askJarvis(nextHistory, requestId, userMessage.id);
      const replyContent = await runClientActions(reply.clientActions, reply.content);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: replyContent,
        toolActions: reply.tools,
        actionReceipts: reply.actions,
        contextResolution: reply.contextResolution,
        collapsed: mode === "voice",
      };
      setMessages((current) => [...current, assistantMessage]);
      setStatus("Ready");
      if (mode !== "text") await speakMessage(assistantMessage);
    } catch (err) {
      setLastFailedMessage(content);
      setError(err instanceof Error ? err.message : "Jarvis tripped over the local wire.");
      setStatus("Error");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function runReadout(kind: ReadoutKind) {
    if (status === "Thinking") return;
    setError("");
    setActiveReadout(kind);
    stopAudio();
    setStatus("Thinking");

    try {
      const endpoint = kind === "morning" ? "/briefing/morning?user_id=john" : "/debrief/daily?user_id=john";
      const response = await fetch(`${API_BASE}${endpoint}`, { headers: { "x-api-key": API_KEY } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Jarvis readout failed.");

      const sourceText = sanitizeReadoutSource(typeof data.spoken_response === "string" ? data.spoken_response : JSON.stringify(data));
      const prompt = buildReadoutPrompt(kind, sourceText, data);
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: kind === "morning" ? "Give me my morning brief." : "Give me my daily debrief." };
      const nextHistory = [...messages, userMessage].slice(-20);
      setMessages(nextHistory);

      const reply = await askJarvis([...nextHistory, { id: "readout-source", role: "user", content: prompt }], crypto.randomUUID(), userMessage.id);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply.content,
        toolActions: reply.tools,
        actionReceipts: reply.actions,
        collapsed: mode === "voice",
      };
      setMessages((current) => [...current, assistantMessage]);
      setStatus("Ready");
      if (mode !== "text") await speakMessage(assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jarvis could not build that readout.");
      setStatus("Error");
    } finally {
      setActiveReadout(null);
    }
  }

  async function speakMessage(message: ChatMessage) {
    if (ttsMuted) return;
    const text = prepareTextForSpeech(message.content);
    if (!text) return;
    setStatus("Speaking");
    console.info("[jarvis.timing] TTS synthesis started", Math.round(performance.now()), message.content.slice(0, 80));
    try {
      let url = audioUrls.current.get(message.id);
      if (!url) {
        const response = await fetch(`${API_BASE}/assistant/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({ text, voice, speed: 1 }),
        });
        if (!response.ok) throw new Error(await friendlyError(response));
        url = URL.createObjectURL(await response.blob());
        audioUrls.current.set(message.id, url);
      }
      playUrl(message.id, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice service is offline. Text still works.");
      setStatus("Ready");
    }
  }

  function playUrl(messageId: string, url: string) {
    stopAudio(false);
    const audio = new Audio(url);
    audioRef.current = audio;
    setActiveAudioId(messageId);
    setIsPaused(false);
    audio.onended = () => {
      setActiveAudioId(null);
      setStatus("Ready");
    };
    audio.play().then(() => console.info("[jarvis.timing] first audio played", Math.round(performance.now()))).catch(() => {
      setError("Browser blocked autoplay. Hit replay when you are ready.");
      setStatus("Ready");
    });
  }

  function stopAudio(clearStatus = true) {
    audioRef.current?.pause();
    audioRef.current = null;
    setActiveAudioId(null);
    setIsPaused(false);
    if (clearStatus) setStatus("Ready");
  }

  function togglePause() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPaused(false);
      setStatus("Speaking");
    } else {
      audioRef.current.pause();
      setIsPaused(true);
      setStatus("Ready");
    }
  }

  function toggleListening() {
    if (!speechSupported || status === "Thinking") return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceHint(voiceTranscriptRef.current ? "Sending what I heard..." : "Stopped. I did not catch words yet.");
      return;
    }
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setSpeechSupported(false);
      setError("Voice input is not available in this browser.");
      return;
    }
    stopAudio(false);
    clearSpeechStopTimer();
    setVoiceTranscript("");
    setVoiceHint("Listening through Chrome...");
    voiceTranscriptRef.current = "";
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    let latestInterimTranscript = "";
    recognition.onaudiostart = () => setVoiceHint("Mic is open. Start talking.");
    recognition.onspeechstart = () => setVoiceHint("I hear you...");
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      latestInterimTranscript = interimTranscript;
      const heardText = `${finalTranscript} ${latestInterimTranscript}`.trim();
      voiceTranscriptRef.current = heardText;
      setVoiceTranscript(heardText);
      setInput(heardText);
      setVoiceHint("Heard that. Pause or tap Listening to send.");
      scheduleSpeechStop(recognition);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      clearSpeechStopTimer();
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Chrome does not have microphone permission for Jarvis. Allow the mic for this site, then try Talk again.");
      } else if (event.error === "audio-capture") {
        setError("Chrome cannot reach your microphone. Check that your AirPods are selected as the input device.");
      } else if (event.error !== "no-speech") {
        setError("I could not catch that. Try Talk again or type it in.");
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      clearSpeechStopTimer();
      const spokenText = (finalTranscript || voiceTranscriptRef.current).trim();
      if (spokenText) {
        setVoiceHint("Sending what I heard...");
        void sendMessage(spokenText).finally(() => {
          setVoiceTranscript("");
          setVoiceHint("");
          voiceTranscriptRef.current = "";
        });
      } else {
        setVoiceHint("I did not catch words. Check Chrome mic permission and AirPods input.");
      }
    };
    setError("");
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setError("Voice input could not start. Refresh Jarvis and try Talk again.");
    }
  }

  function scheduleSpeechStop(recognition: SpeechRecognitionLike) {
    clearSpeechStopTimer();
    speechStopTimerRef.current = window.setTimeout(() => {
      recognition.stop();
    }, 1400);
  }

  function clearSpeechStopTimer() {
    if (speechStopTimerRef.current !== null) {
      window.clearTimeout(speechStopTimerRef.current);
      speechStopTimerRef.current = null;
    }
  }

  async function previewVoice() {
    stopAudio();
    await speakMessage({ id: "preview", role: "assistant", content: "Good evening, John. Jarvis is online." });
  }

  function clearChat() {
    if (!window.confirm("Clear this Jarvis conversation?")) return;
    stopAudio();
    setMessages([]);
    setError("");
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrls.current.clear();
  }

  async function startNewContext() {
    const conversationId = getConversationId();
    try {
      const response = await fetch(`${API_BASE}/assistant/context/${encodeURIComponent(conversationId)}/reset`, {
        method: "POST",
        headers: { "x-api-key": API_KEY },
      });
      if (!response.ok) throw new Error(await friendlyError(response));
      window.localStorage.removeItem(CONVERSATION_KEY);
      getConversationId();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jarvis could not reset this context.");
    }
  }

  return (
    <main className={`jarvis-shell ${compact ? "compact" : ""}`}>
      <div className="jarvis-grid" />
      <div className="jarvis-ambient-scan" />
      <section className="jarvis-console">
        <span className="console-corner corner-tl" />
        <span className="console-corner corner-tr" />
        <span className="console-corner corner-bl" />
        <span className="console-corner corner-br" />
        <header className="jarvis-header">
          <div>
            <p>Command Operations // Local Intelligence</p>
            <h1>Jarvis</h1>
            <span className="header-subline">Personal operations link for John Summers</span>
          </div>
          <div className="header-actions">
            <div className={`jarvis-status ${status.toLowerCase()}`}>
              {status === "Offline" ? <WifiOff size={16} /> : <Wifi size={16} />}
              <span>{status}</span>
            </div>
            {compact && <SegmentedControl label="Output" showLabel={false} value={mode} options={MODES} onChange={setMode} />}
            {compact && <button className="icon-button" type="button" onClick={() => window.jarvisDesktop?.openFullJarvis?.()} title="Open full Jarvis"><Maximize2 size={17} /></button>}
            {!compact && desktopShell && <button className="icon-button" type="button" onClick={() => window.jarvisDesktop?.collapseJarvis?.()} title="Shrink to compact Jarvis" aria-label="Shrink Jarvis to compact window"><Minimize2 size={17} /></button>}
          </div>
        </header>

        <section className="jarvis-meta">
          <InfoPill label="Model" value={model} active={!!assistantStatus.ollama?.modelAvailable} />
          <InfoPill label="Voice" value={voiceLabel} active={!!assistantStatus.tts?.online} />
          <InfoPill label="Tools" value={toolsLabel} active={!!assistantStatus.tools?.readToolsEnabled} />
          <label className="model-select">
            <span>Ollama</span>
            <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
              {modelOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="ghost-action" type="button" onClick={() => runReadout("morning")} disabled={activeReadout !== null || status === "Thinking"}>
            <Sparkles size={16} /> {activeReadout === "morning" ? "Briefing" : "Morning Brief"}
          </button>
          <button className="ghost-action" type="button" onClick={() => runReadout("debrief")} disabled={activeReadout !== null || status === "Thinking"}>
            <Sparkles size={16} /> {activeReadout === "debrief" ? "Debriefing" : "Daily Debrief"}
          </button>
        </section>

        <section className="jarvis-controls">
          <SegmentedControl label="Output" value={mode} options={MODES} onChange={setMode} />
          <div className="voice-control">
            <SegmentedControl label="Voice" value={voice} options={VOICES} onChange={setVoice} />
            <button className="icon-button" type="button" onClick={previewVoice} title="Preview voice">
              <Volume2 size={18} />
            </button>
          </div>
        </section>

        <section
          className="conversation"
          onScroll={(event) => {
            const element = event.currentTarget;
            userScrolledUpRef.current = element.scrollHeight - element.scrollTop - element.clientHeight > 90;
          }}
        >
          {visibleMessages.length === 0 && (
            <div className="empty-chat">
              <Bot size={38} />
              <strong>Jarvis is waiting.</strong>
              <span>Ask what to work on, draft a plan, or just say hello.</span>
            </div>
          )}
          {visibleMessages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-bubble">
                <span>{message.role === "assistant" ? "Jarvis" : "John"}</span>
                {message.collapsed ? (
                  <details>
                    <summary>Show transcript</summary>
                    <MessageText text={message.content} />
                  </details>
                ) : (
                  <MessageText text={message.content} />
                )}
                {message.role === "assistant" && (
                  <div className="message-actions">
                    <button type="button" onClick={() => navigator.clipboard.writeText(message.content)}>
                      <Clipboard size={15} /> Copy
                    </button>
                    <button type="button" onClick={() => speakMessage(message)}>
                      <RotateCcw size={15} /> Replay
                    </button>
                  </div>
                )}
                {!!message.toolActions?.length && <div className="tool-actions">Backend tool: {message.toolActions.join(", ")}</div>}
                {message.contextResolution && (
                  <ContextResolutionCard
                    context={message.contextResolution}
                    selectedIndex={message === visibleMessages[visibleMessages.length - 1] ? selectedContextOption : -1}
                    onSelect={(option) => void sendMessage(contextOptionCommand(option))}
                  />
                )}
                {!!message.actionReceipts?.length && (
                  <div className="action-receipts" aria-label="Action receipts">
                    {message.actionReceipts.map((receipt) => <ActionReceiptCard key={receipt.action_id} receipt={receipt} />)}
                  </div>
                )}
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </section>

        {error && <div className="jarvis-error">{error} {lastFailedMessage && <button type="button" onClick={() => sendMessage(lastFailedMessage)}>Retry</button>}</div>}

        <footer className="composer">
          {(isListening || voiceHint || voiceTranscript) && (
            <div className={`voice-listener ${isListening ? "active" : ""}`}>
              <div>
                <Mic size={16} />
                <span>{voiceHint || "Voice input ready."}</span>
              </div>
              {voiceTranscript && <strong>{voiceTranscript}</strong>}
            </div>
          )}
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (activeContextOptions.length && event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedContextOption((current) => (current + 1) % activeContextOptions.length);
                return;
              }
              if (activeContextOptions.length && event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedContextOption((current) => (current - 1 + activeContextOptions.length) % activeContextOptions.length);
                return;
              }
              if (activeContextOptions.length && event.key === "Enter" && !event.shiftKey && !input.trim()) {
                event.preventDefault();
                void sendMessage(contextOptionCommand(activeContextOptions[selectedContextOption]));
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Talk to Jarvis..."
          />
          <div className="composer-actions">
            {!compact && <Link href="/" className="ghost-action">Command Center</Link>}
            <button className="ghost-action" type="button" onClick={() => void startNewContext()}><RotateCcw size={16} /> New Context</button>
            <button className="ghost-action destructive-action" type="button" onClick={clearChat}><Trash2 size={16} /> Clear Chat</button>
            <button className="ghost-action" type="button" onClick={() => { const next = !ttsMuted; setTtsMuted(next); stopAudio(); void window.jarvisDesktop?.setDesktopPreference?.("ttsMuted", next); }}>{ttsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />} {ttsMuted ? "Muted" : "Voice"}</button>
            {compact && <button className="ghost-action" type="button" onClick={() => { const next = !alwaysOnTop; setAlwaysOnTop(next); void window.jarvisDesktop?.setDesktopPreference?.("jarvisAlwaysOnTop", next); }}>{alwaysOnTop ? "Unpin" : "Pin"}</button>}
            <button
              className={`ghost-action ${isListening ? "listening" : ""}`}
              type="button"
              onClick={toggleListening}
              disabled={!speechSupported || status === "Thinking"}
              title={speechSupported ? "Talk to Jarvis" : "Voice input is not available in this browser"}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              {isListening ? "Listening" : "Talk"}
            </button>
            {activeAudioId && <button className="ghost-action" type="button" onClick={togglePause}>{isPaused ? <Play size={16} /> : <Pause size={16} />} Audio</button>}
            {activeAudioId && <button className="ghost-action" type="button" onClick={() => stopAudio()}><Square size={16} /> Stop</button>}
            <button className="send-button" type="button" onClick={() => sendMessage()} disabled={!input.trim() || status === "Thinking"}>
              {status === "Thinking" ? <X size={18} /> : <Send size={18} />}
              {status === "Thinking" ? "Thinking" : "Send"}
            </button>
          </div>
        </footer>
      </section>
      <JarvisStyles />
    </main>
  );
}

function InfoPill({ label, value, active }: { label: string; value: string; active: boolean }) {
  return <div className={`info-pill ${active ? "active" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SegmentedControl<T extends string>({ label, showLabel = true, value, options, onChange }: { label: string; showLabel?: boolean; value: T; options: Array<{ id: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="segmented" aria-label={label}>
      {showLabel && <span>{label}</span>}
      <div>
        {options.map((option) => (
          <button key={option.id} type="button" className={value === option.id ? "active" : ""} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  return <p>{text}</p>;
}

function ActionReceiptCard({ receipt }: { receipt: ActionReceipt }) {
  const verified = receipt.execution_status === "succeeded" && receipt.verification?.status === "verified";
  const status = verified ? "Verified" : ({
    proposed: "Proposed",
    awaiting_confirmation: "Awaiting confirmation",
    executing: "Executing",
    succeeded: "Succeeded",
    failed: "Failed",
    verification_failed: "Verification failed",
    unavailable: "Not executed",
    cancelled: "Cancelled",
  } as const)[receipt.execution_status];
  return (
    <section className={`action-receipt ${verified ? "verified" : receipt.execution_status}`}>
      <strong>Action: {friendlyActionName(receipt.requested_action)}</strong>
      <span>Status: {status}</span>
      {receipt.verification?.summary && <small>{receipt.verification.summary}</small>}
      {verified && receipt.verification?.verified_at && <time dateTime={receipt.verification.verified_at}>Verified at: {new Date(receipt.verification.verified_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
    </section>
  );
}

function ContextResolutionCard({ context, selectedIndex, onSelect }: { context: ContextResolutionMeta; selectedIndex: number; onSelect: (option: NonNullable<ContextResolutionMeta["options"]>[number]) => void }) {
  const inherited = Object.entries(context.inherited || {});
  const changed = Object.entries(context.changed || {});
  if (!context.follow_up && !inherited.length && !changed.length && !context.pending_clarification) return null;
  return (
    <section className="context-resolution" aria-label="Context resolution">
      <strong>Context resolution</strong>
      {!!inherited.length && <small>Inherited: {inherited.map(([key, value]) => `${key}: ${value}`).join(" · ")}</small>}
      {!!changed.length && <small>Changed: {changed.map(([key, value]) => `${key}: ${value}`).join(" · ")}</small>}
      {context.refreshed_live_results && <small>Live results refreshed</small>}
      {context.pending_clarification && <small>Pending: {context.pending_clarification}</small>}
      {!!context.options?.length && (
        <div className="context-options" role="listbox" aria-label="Choose an option">
          {context.options.map((option, index) => (
            <button key={option.id || `${option.action}-${index}`} type="button" className={selectedIndex === index ? "active" : ""} onClick={() => onSelect(option)}>
              <span>{index + 1}.</span> {option.action === "create" ? "Add a new item" : option.name || option.title || "Use this option"}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function contextOptionCommand(option: NonNullable<ContextResolutionMeta["options"]>[number]) {
  return option.action === "create" ? "Create a new one" : option.name || option.title || "Use that one";
}

function friendlyActionName(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function friendlyError(response: Response) {
  try {
    const data = await response.json();
    return data.detail?.message || data.detail || "Local assistant request failed.";
  } catch {
    return "Local assistant request failed.";
  }
}

function prepareTextForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "I included a code block in the text response.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "link omitted")
    .replace(/[#*_>\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    if (window.localStorage.getItem(IDENTITY_VERSION_KEY) !== IDENTITY_VERSION) {
      window.localStorage.removeItem(HISTORY_KEY);
      return [];
    }
    const saved = window.localStorage.getItem(HISTORY_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEYS.history);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as ChatMessage[];
    return parsed.map((message) => message.role === "assistant" ? { ...message, content: sanitizeStoredAssistantIdentity(message.content) } : message);
  } catch {
    return [];
  }
}

function getConversationId() {
  const existing = window.localStorage.getItem(CONVERSATION_KEY);
  if (existing) return existing;
  const created = `conv_${crypto.randomUUID().replace(/-/g, "")}`;
  window.localStorage.setItem(CONVERSATION_KEY, created);
  return created;
}

function sanitizeStoredAssistantIdentity(content: string) {
  return content
    .replace(/\bmy name is chloe\b/gi, "my name is Jarvis")
    .replace(/\bi(?:'m| am) chloe\b/gi, "I'm Jarvis")
    .replace(/\bthis is chloe\b/gi, "this is Jarvis")
    .replace(/\bchloe here\b/gi, "Jarvis here");
}

function loadStoredMode(): OutputMode {
  if (typeof window === "undefined") return "both";
  const saved = (window.localStorage.getItem(MODE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEYS.mode)) as OutputMode | null;
  return saved && MODES.some((item) => item.id === saved) ? saved : "both";
}

function loadStoredVoice(): VoiceId {
  if (typeof window === "undefined") return "af_bella";
  const saved = (window.localStorage.getItem(VOICE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEYS.voice)) as VoiceId | null;
  return saved && VOICES.some((item) => item.id === saved) ? saved : "af_bella";
}

function loadStoredModel() {
  if (typeof window === "undefined") return "qwen3:8b";
  return window.localStorage.getItem(MODEL_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEYS.model) || "qwen3:8b";
}

function buildReadoutPrompt(kind: ReadoutKind, spokenText: string, data: unknown) {
  const label = kind === "morning" ? "morning brief" : "daily debrief";
  return [
    `Turn this Jarvis ${label} into Jarvis's own spoken words for John.`,
    "Keep the facts, names, numbers, schedule, workout, money, and priorities accurate.",
    "Only use facts present in the source. Do not invent PRs, gym commentary, threats, intimacy, or extra plans.",
    "Do not sound like the source text. Vary the phrasing so it feels fresh today.",
    "Make it warm, direct, lightly teasing if natural, and useful, but do not use pet names.",
    "Keep it workplace-safe: no explicit sexual content, no romantic roleplay, no threats, and no domination language.",
    "No markdown. No bullet list unless the data truly demands it.",
    "Keep it concise enough to speak out loud, around 90 to 160 words.",
    "",
    `Original spoken text: ${spokenText}`,
    "",
    `Raw Jarvis data: ${JSON.stringify(data).slice(0, 7000)}`,
  ].join("\n");
}

function sanitizeReadoutSource(text: string) {
  return text
    .replace(/\bsexy daddy\b/gi, "John")
    .replace(/\bdaddy\b/gi, "John")
    .replace(/\bsexy\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fastMediaAcknowledgment(action: ClientAction["type"]) {
  const phrases: Record<ClientAction["type"], string[]> = {
    start_youtube_music: ["You got it.", "On it.", "Music coming up.", "Say less.", "Absolutely.", "Let's get some noise in here.", "Consider it handled.", "Firing it up.", "Good call.", "Right away.", "Queueing the vibes.", "Your soundtrack, coming up."],
    next_track: ["Skipping it.", "Next one coming up.", "Moving right along.", "On to the next.", "Consider it skipped.", "Fresh track incoming.", "Advancing the soundtrack.", "Next song, coming up."],
    previous_track: ["Going back.", "Rewinding the choice.", "Back one track.", "Bringing that one back.", "Returning to the last one.", "One step back, musically speaking.", "Previous track coming up.", "Back we go."],
    pause_music: ["You got it.", "Pausing it.", "One second.", "Holding that thought.", "Music down.", "On it."],
    now_playing: ["Let me check.", "Checking the player.", "One second.", "Reading the music session.", "Let's see what's on.", "Checking the soundtrack."],
  };
  const options = phrases[action];
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return options[random[0] % options.length];
}

type VerifiedMediaState = {
  available?: boolean;
  isPlaying?: boolean;
  stale?: boolean;
  playbackStatus?: string;
  title?: string | null;
  artist?: string | null;
  reason?: string;
};

async function waitForPlayingState(getSession: () => Promise<VerifiedMediaState>) {
  let latest: VerifiedMediaState = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 180));
    latest = await getSession();
    if (latest.isPlaying && !latest.stale) return latest;
  }
  return latest;
}

async function waitForPausedState(getSession: () => Promise<VerifiedMediaState>) {
  let latest: VerifiedMediaState = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 180));
    latest = await getSession();
    if (latest.available && !latest.isPlaying && !latest.stale && latest.playbackStatus === "paused") return latest;
  }
  return latest;
}

async function waitForTrackChange(getSession: () => Promise<VerifiedMediaState>, initial: VerifiedMediaState) {
  let latest = initial;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 220));
    latest = await getSession();
    if (hasTrackChanged(initial, latest)) return latest;
  }
  return latest;
}

function hasTrackChanged(before: VerifiedMediaState, after: VerifiedMediaState) {
  const beforeKey = `${before.title || ""}\u0000${before.artist || ""}`;
  const afterKey = `${after.title || ""}\u0000${after.artist || ""}`;
  return Boolean(after.available && afterKey !== "\u0000" && afterKey !== beforeKey);
}

function sanitizeMediaLog(value: VerifiedMediaState | { available?: boolean; reason?: string } | null | undefined) {
  return {
    available: Boolean(value?.available),
    isPlaying: "isPlaying" in (value || {}) ? Boolean((value as VerifiedMediaState).isPlaying) : undefined,
    playbackStatus: (value as VerifiedMediaState | undefined)?.playbackStatus || "unknown",
    title: (value as VerifiedMediaState | undefined)?.title || "unavailable",
    artist: (value as VerifiedMediaState | undefined)?.artist || "unavailable",
    reason: value?.reason || undefined,
  };
}

function JarvisStyles() {
  return (
    <style>{`
      .jarvis-shell { height: 100vh; min-height: 0; position: relative; overflow: hidden; background: radial-gradient(circle at 48% 32%, rgba(34,197,94,.16), transparent 30rem), radial-gradient(circle at 88% 75%, rgba(20,184,166,.09), transparent 26rem), linear-gradient(145deg, #020806, #010403 52%, #000); color: #ecfdf5; padding: clamp(.55rem, 1vw, .9rem); }
      .jarvis-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(74,222,128,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,.04) 1px, transparent 1px); background-size: 52px 52px; mask-image: radial-gradient(circle at 50% 45%, black, transparent 84%); pointer-events: none; }
      .jarvis-ambient-scan { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(134,239,172,.018) 0 1px, transparent 1px 5px); opacity: .7; }
      .jarvis-console { position: relative; z-index: 1; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto auto; gap: .48rem; max-width: 1380px; height: 100%; min-height: 0; margin: 0 auto; overflow: hidden; border: 1px solid rgba(74,222,128,.42); border-radius: .35rem; background: radial-gradient(circle at 18% 0%, rgba(34,197,94,.1), transparent 26rem), linear-gradient(135deg, rgba(3,20,12,.94), rgba(1,9,6,.96) 55%, rgba(0,0,0,.98)); padding: clamp(.65rem, 1vw, .9rem); backdrop-filter: blur(16px); box-shadow: 0 0 0 1px rgba(187,247,208,.06) inset, 0 0 38px rgba(34,197,94,.15), inset 0 0 34px rgba(34,197,94,.06); }
      .jarvis-console::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: -1; background: linear-gradient(90deg, transparent, rgba(187,247,208,.12), transparent); width: 28%; transform: translateX(-140%) skewX(-18deg); animation: jarvis-console-scan 7s linear infinite; }
      .console-corner { position: absolute; z-index: 3; width: 1.1rem; height: 1.1rem; color: rgba(187,247,208,.9); pointer-events: none; }
      .corner-tl { top: .55rem; left: .55rem; border-top: 2px solid; border-left: 2px solid; } .corner-tr { top: .55rem; right: .55rem; border-top: 2px solid; border-right: 2px solid; } .corner-bl { bottom: .55rem; left: .55rem; border-bottom: 2px solid; border-left: 2px solid; } .corner-br { right: .55rem; bottom: .55rem; border-right: 2px solid; border-bottom: 2px solid; }
      .jarvis-header, .jarvis-meta, .jarvis-controls, .composer-actions, .voice-control, .header-actions { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
      .jarvis-header { justify-content: space-between; border-bottom: 1px solid rgba(74,222,128,.22); padding: .05rem .25rem .42rem; }
      .jarvis-header p, .info-pill span, .segmented > span { color: #4ade80; font-size: .68rem; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
      .jarvis-header h1 { margin: .05rem 0 0; color: #dcfce7; font-size: clamp(1.55rem, 2.4vw, 2.4rem); letter-spacing: .08em; line-height: .95; text-transform: uppercase; text-shadow: 0 0 22px rgba(34,197,94,.48); }
      .header-subline { display: block; margin-top: .18rem; color: rgba(187,247,208,.6); font-size: .62rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .jarvis-status, .info-pill, .ghost-action, .icon-button { border: 1px solid rgba(74,222,128,.24); border-radius: .3rem; background: rgba(1,22,11,.68); color: #dcfce7; }
      .jarvis-status { display: inline-flex; align-items: center; gap: .4rem; padding: .4rem .55rem; font-size: .74rem; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; }
      .jarvis-status.ready, .info-pill.active { border-color: rgba(74,222,128,.34); color: #caffbf; }
      .jarvis-status.error, .jarvis-status.offline { border-color: rgba(248,113,113,.38); color: #fecaca; }
      .jarvis-meta { gap: .42rem; }
      .info-pill { display: inline-flex; align-items: baseline; min-width: 0; gap: .38rem; padding: .38rem .55rem; box-shadow: inset 0 0 14px rgba(34,197,94,.05); }
      .info-pill strong { font-size: .76rem; white-space: nowrap; }
      .model-select { display: inline-flex; align-items: center; min-width: min(100%, 19rem); gap: .45rem; border: 1px solid rgba(74,222,128,.24); border-radius: .3rem; background: rgba(1,22,11,.68); padding: .34rem .5rem; color: #dcfce7; }
      .model-select span { color: #4ade80; font-size: .68rem; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
      .model-select select { width: 100%; border: 0; outline: 0; background: #020806; color: #ecf8ff; font-weight: 800; font-size: .82rem; }
      .model-select option { background: #020806; color: #ecf8ff; }
      .jarvis-controls { gap: .7rem; border-top: 1px solid rgba(74,222,128,.08); border-bottom: 1px solid rgba(74,222,128,.08); padding: .28rem .1rem; }
      .segmented { display: flex; align-items: center; gap: .42rem; }
      .segmented div { display: inline-flex; border: 1px solid rgba(74,222,128,.2); border-radius: .3rem; background: rgba(0,0,0,.32); padding: .22rem; }
      .segmented button, .ghost-action, .icon-button, .send-button, .message-actions button { cursor: pointer; transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms; }
      .segmented button { border: 0; border-radius: 6px; background: transparent; color: rgba(236,248,255,.68); padding: .34rem .52rem; font-size: .75rem; font-weight: 800; }
      .segmented button.active { background: rgba(34,197,94,.2); color: #dcfce7; box-shadow: inset 0 0 12px rgba(34,197,94,.14), 0 0 12px rgba(34,197,94,.08); }
      .ghost-action, .icon-button { display: inline-flex; align-items: center; gap: .36rem; padding: .42rem .58rem; font-size: .76rem; text-decoration: none; }
      .ghost-action.listening { border-color: rgba(255,185,111,.78); background: rgba(255,122,0,.22); box-shadow: 0 0 20px rgba(255,122,0,.24), inset 0 0 14px rgba(255,122,0,.12); }
      .ghost-action:hover:not(:disabled), .icon-button:hover, .send-button:hover:not(:disabled), .message-actions button:hover { transform: translateY(-2px); border-color: rgba(134,239,172,.72); background: rgba(4,38,20,.78); box-shadow: 0 0 18px rgba(34,197,94,.2); }
      .ghost-action:disabled { opacity: .45; cursor: not-allowed; }
      .conversation { min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: grid; align-content: start; gap: .72rem; padding: .38rem .32rem .7rem; scrollbar-gutter: stable; }
      .empty-chat { display: grid; place-items: center; align-content: center; min-height: 18rem; gap: .5rem; color: rgba(236,248,255,.7); text-align: center; }
      .empty-chat svg { color: #86efac; filter: drop-shadow(0 0 10px rgba(34,197,94,.55)); }
      .message { display: flex; }
      .message.user { justify-content: flex-end; }
      .message-bubble { max-width: min(900px, 76%); border: 1px solid rgba(74,222,128,.2); border-radius: .35rem; background: rgba(1,22,11,.55); padding: .72rem .82rem; box-shadow: inset 0 0 18px rgba(34,197,94,.05); }
      .message.assistant .message-bubble { max-width: min(980px, 78%); }
      .message.user .message-bubble { border-color: rgba(45,212,191,.3); background: rgba(2,27,24,.56); }
      .message-bubble > span { color: #4ade80; font-size: .64rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
      .message-bubble p { white-space: pre-wrap; line-height: 1.55; margin: .42rem 0 0; }
      .message-actions { display: flex; gap: .35rem; margin-top: .52rem; opacity: .72; }
      .message-actions button { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid rgba(98,201,255,.18); border-radius: 999px; background: rgba(0,0,0,.26); color: #dff8ff; padding: .38rem .55rem; }
      .tool-actions { margin-top: .6rem; color: #fbbf24; font-size: .72rem; font-weight: 800; text-transform: uppercase; }
      .context-resolution { display: grid; gap: .2rem; margin-top: .65rem; border-left: 3px solid #38bdf8; border-radius: .25rem; background: rgba(3,105,161,.12); padding: .5rem .65rem; }
      .context-resolution strong { color: #7dd3fc; font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; }
      .context-resolution small { color: rgba(224,242,254,.76); font-size: .68rem; }
      .context-options { display: grid; gap: .3rem; margin-top: .35rem; }
      .context-options button { cursor: pointer; border: 1px solid rgba(56,189,248,.28); border-radius: .35rem; background: rgba(2,35,54,.7); color: #dff7ff; padding: .42rem .55rem; text-align: left; }
      .context-options button.active, .context-options button:hover { border-color: #7dd3fc; background: rgba(3,105,161,.3); box-shadow: 0 0 12px rgba(56,189,248,.18); }
      .context-options button span { color: #7dd3fc; font-weight: 900; }
      .action-receipts { display: grid; gap: .45rem; margin-top: .7rem; }
      .action-receipt { display: grid; gap: .2rem; border-left: 3px solid #fbbf24; border-radius: .25rem; background: rgba(0,0,0,.3); padding: .55rem .65rem; }
      .action-receipt.verified { border-left-color: #4ade80; background: rgba(20,83,45,.18); }
      .action-receipt.failed, .action-receipt.verification_failed { border-left-color: #f87171; background: rgba(127,29,29,.16); }
      .action-receipt.unavailable, .action-receipt.cancelled { border-left-color: #94a3b8; }
      .action-receipt strong { color: #ecfdf5; font-size: .74rem; text-transform: none; }
      .action-receipt span { color: #fbbf24; font-size: .7rem; font-weight: 900; text-transform: uppercase; }
      .action-receipt.verified span { color: #86efac; }
      .action-receipt small, .action-receipt time { color: rgba(236,248,255,.62); font-size: .68rem; }
      .jarvis-error { border: 1px solid rgba(248,113,113,.34); border-radius: 10px; background: rgba(127,29,29,.2); color: #fecaca; padding: .7rem .8rem; }
      .composer { position: relative; z-index: 2; display: grid; gap: .42rem; border-top: 1px solid rgba(74,222,128,.26); background: rgba(1,9,6,.94); padding-top: .48rem; }
      .voice-listener { border: 1px solid rgba(98,201,255,.24); border-radius: 10px; background: rgba(0,13,24,.62); color: rgba(236,248,255,.78); padding: .68rem .78rem; display: grid; gap: .38rem; }
      .voice-listener.active { border-color: rgba(255,185,111,.7); box-shadow: 0 0 18px rgba(255,122,0,.16), inset 0 0 14px rgba(8,191,255,.06); }
      .voice-listener div { display: flex; align-items: center; gap: .45rem; color: #42d1ff; font-size: .72rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
      .voice-listener strong { color: #fff4e9; font-size: .94rem; line-height: 1.4; }
      .composer textarea { min-height: 3.6rem; max-height: 8rem; resize: vertical; border: 1px solid rgba(74,222,128,.24); border-radius: .35rem; background: rgba(0,0,0,.52); color: #ecfdf5; padding: .68rem .75rem; outline: none; box-shadow: inset 0 0 18px rgba(0,0,0,.5); }
      .composer textarea:focus { border-color: rgba(134,239,172,.7); box-shadow: 0 0 22px rgba(34,197,94,.16), inset 0 0 18px rgba(0,0,0,.5); }
      .composer-actions { justify-content: flex-end; gap: .38rem; }
      .composer-actions .destructive-action { border-color: rgba(248,113,113,.28); color: #fecaca; }
      .send-button { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgba(74,222,128,.52); border-radius: .3rem; background: rgba(34,197,94,.2); color: #dcfce7; padding: .72rem 1rem; font-weight: 900; }
      .send-button:disabled { opacity: .5; cursor: not-allowed; }
      .jarvis-shell.compact { padding: 0; }
      .jarvis-shell.compact .jarvis-console { height: 100vh; border-radius: 0; border: 0; padding: .55rem; gap: .38rem; }
      .jarvis-shell.compact .jarvis-meta, .jarvis-shell.compact .model-select, .jarvis-shell.compact .header-subline, .jarvis-shell.compact .jarvis-controls, .jarvis-shell.compact .ghost-action.listening { display: none; }
      .jarvis-shell.compact .jarvis-header { flex-wrap: nowrap; padding: .05rem .18rem .4rem; gap: .4rem; }
      .jarvis-shell.compact .jarvis-header > div:first-child { flex: 1; min-width: 0; }
      .jarvis-shell.compact .jarvis-header h1 { font-size: 1.35rem; margin: 0; }
      .jarvis-shell.compact .jarvis-header p { display: none; }
      .jarvis-shell.compact .header-actions { flex-wrap: nowrap; gap: .3rem; }
      .jarvis-shell.compact .jarvis-status { padding: .35rem .45rem; font-size: .66rem; }
      .jarvis-shell.compact .segmented { gap: 0; }
      .jarvis-shell.compact .segmented div { padding: .12rem; }
      .jarvis-shell.compact .segmented button { padding: .3rem .42rem; font-size: .68rem; }
      .jarvis-shell.compact .icon-button { padding: .38rem; }
      .jarvis-shell.compact .conversation { padding: .18rem .12rem; gap: .55rem; }
      .jarvis-shell.compact .message-bubble { max-width: 94%; padding: .62rem .7rem; }
      .jarvis-shell.compact .composer { gap: .38rem; padding-top: .45rem; }
      .jarvis-shell.compact .composer textarea { min-height: 3rem; max-height: 5rem; padding: .62rem; }
      .jarvis-shell.compact .composer-actions { gap: .3rem; }
      .jarvis-shell.compact .composer-actions .ghost-action, .jarvis-shell.compact .send-button { padding: .42rem .5rem; font-size: .7rem; }
      details summary { cursor: pointer; color: #86efac; font-weight: 800; margin-top: .45rem; }
      @keyframes jarvis-console-scan { 0%, 72% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 76% { opacity: .5; } 100% { transform: translateX(470%) skewX(-18deg); opacity: 0; } }
      @media (max-width: 1100px) { .jarvis-shell { padding: .4rem; } .jarvis-console { padding: .55rem; } .jarvis-meta { gap: .3rem; } .info-pill { padding: .3rem .42rem; } .model-select { flex: 1 1 16rem; } .message-bubble, .message.assistant .message-bubble { max-width: 84%; } .composer-actions { justify-content: flex-start; } }
      @media (max-width: 780px) { .jarvis-header p, .header-subline { display: none; } .jarvis-controls { flex-wrap: wrap; } .message-bubble, .message.assistant .message-bubble { max-width: 94%; } }
    `}</style>
  );
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}
