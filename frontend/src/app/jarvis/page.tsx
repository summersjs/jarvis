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

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  collapsed?: boolean;
  toolActions?: string[];
  actionReceipts?: ActionReceipt[];
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
  const [speechSupported, setSpeechSupported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceHint, setVoiceHint] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrls = useRef(new Map<string, string>());
  const bottomRef = useRef<HTMLDivElement | null>(null);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    };
  }

  async function sendMessage(contentOverride?: string) {
    const content = (contentOverride ?? input).trim();
    if (!content || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setInput("");
    setError("");
    stopAudio();

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextHistory = [...messages, userMessage].slice(-20);
    setMessages(nextHistory);
    setStatus("Thinking");

    try {
      const requestId = crypto.randomUUID();
      const reply = await askJarvis(nextHistory, requestId, userMessage.id);
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
    audio.play().catch(() => {
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
          <div className={`jarvis-status ${status.toLowerCase()}`}>
            {status === "Offline" ? <WifiOff size={16} /> : <Wifi size={16} />}
            <span>{status}</span>
          </div>
          {compact && <button className="icon-button" type="button" onClick={() => window.jarvisDesktop?.openFullJarvis?.()} title="Open full Jarvis"><Maximize2 size={17} /></button>}
          {!compact && desktopShell && <button className="icon-button" type="button" onClick={() => window.jarvisDesktop?.collapseJarvis?.()} title="Shrink to compact Jarvis" aria-label="Shrink Jarvis to compact window"><Minimize2 size={17} /></button>}
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

        <section className="conversation">
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
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Talk to Jarvis..."
          />
          <div className="composer-actions">
            {!compact && <Link href="/" className="ghost-action">Command Center</Link>}
            <button className="ghost-action" type="button" onClick={clearChat}><Trash2 size={16} /> New</button>
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

function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="segmented" aria-label={label}>
      <span>{label}</span>
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

function JarvisStyles() {
  return (
    <style>{`
      .jarvis-shell { min-height: 100vh; position: relative; overflow: hidden; background: radial-gradient(circle at 48% 32%, rgba(34,197,94,.16), transparent 30rem), radial-gradient(circle at 88% 75%, rgba(20,184,166,.09), transparent 26rem), linear-gradient(145deg, #020806, #010403 52%, #000); color: #ecfdf5; padding: clamp(1rem, 2vw, 2rem); }
      .jarvis-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(74,222,128,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,.04) 1px, transparent 1px); background-size: 52px 52px; mask-image: radial-gradient(circle at 50% 45%, black, transparent 84%); pointer-events: none; }
      .jarvis-ambient-scan { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(134,239,172,.018) 0 1px, transparent 1px 5px); opacity: .7; }
      .jarvis-console { position: relative; z-index: 1; display: grid; grid-template-rows: auto auto auto 1fr auto auto; gap: 1rem; max-width: 1180px; height: calc(100vh - clamp(2rem, 4vw, 4rem)); margin: 0 auto; overflow: hidden; border: 1px solid rgba(74,222,128,.42); border-radius: .35rem; background: radial-gradient(circle at 18% 0%, rgba(34,197,94,.1), transparent 26rem), linear-gradient(135deg, rgba(3,20,12,.94), rgba(1,9,6,.96) 55%, rgba(0,0,0,.98)); padding: clamp(1rem, 2vw, 1.4rem); backdrop-filter: blur(16px); box-shadow: 0 0 0 1px rgba(187,247,208,.06) inset, 0 0 38px rgba(34,197,94,.15), inset 0 0 34px rgba(34,197,94,.06); }
      .jarvis-console::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: -1; background: linear-gradient(90deg, transparent, rgba(187,247,208,.12), transparent); width: 28%; transform: translateX(-140%) skewX(-18deg); animation: jarvis-console-scan 7s linear infinite; }
      .console-corner { position: absolute; z-index: 3; width: 1.1rem; height: 1.1rem; color: rgba(187,247,208,.9); pointer-events: none; }
      .corner-tl { top: .55rem; left: .55rem; border-top: 2px solid; border-left: 2px solid; } .corner-tr { top: .55rem; right: .55rem; border-top: 2px solid; border-right: 2px solid; } .corner-bl { bottom: .55rem; left: .55rem; border-bottom: 2px solid; border-left: 2px solid; } .corner-br { right: .55rem; bottom: .55rem; border-right: 2px solid; border-bottom: 2px solid; }
      .jarvis-header, .jarvis-meta, .jarvis-controls, .composer-actions, .voice-control { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
      .jarvis-header { justify-content: space-between; border-bottom: 1px solid rgba(74,222,128,.22); padding: .2rem .35rem .9rem; }
      .jarvis-header p, .info-pill span, .segmented > span { color: #4ade80; font-size: .68rem; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
      .jarvis-header h1 { margin: .18rem 0 0; color: #dcfce7; font-size: clamp(2rem, 4vw, 4rem); letter-spacing: .08em; line-height: .95; text-transform: uppercase; text-shadow: 0 0 22px rgba(34,197,94,.48); }
      .header-subline { display: block; margin-top: .45rem; color: rgba(187,247,208,.6); font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .jarvis-status, .info-pill, .ghost-action, .icon-button { border: 1px solid rgba(74,222,128,.24); border-radius: .3rem; background: rgba(1,22,11,.68); color: #dcfce7; }
      .jarvis-status { display: inline-flex; align-items: center; gap: .45rem; padding: .55rem .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
      .jarvis-status.ready, .info-pill.active { border-color: rgba(74,222,128,.34); color: #caffbf; }
      .jarvis-status.error, .jarvis-status.offline { border-color: rgba(248,113,113,.38); color: #fecaca; }
      .info-pill { display: grid; min-width: 10rem; gap: .18rem; padding: .68rem .8rem; box-shadow: inset 0 0 14px rgba(34,197,94,.05); }
      .info-pill strong { font-size: .9rem; }
      .model-select { display: grid; min-width: min(100%, 25rem); gap: .22rem; border: 1px solid rgba(74,222,128,.24); border-radius: .3rem; background: rgba(1,22,11,.68); padding: .54rem .68rem; color: #dcfce7; }
      .model-select span { color: #4ade80; font-size: .68rem; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
      .model-select select { width: 100%; border: 0; outline: 0; background: #020806; color: #ecf8ff; font-weight: 800; font-size: .82rem; }
      .model-select option { background: #020806; color: #ecf8ff; }
      .segmented { display: flex; align-items: center; gap: .7rem; }
      .segmented div { display: inline-flex; border: 1px solid rgba(74,222,128,.2); border-radius: .3rem; background: rgba(0,0,0,.32); padding: .22rem; }
      .segmented button, .ghost-action, .icon-button, .send-button, .message-actions button { cursor: pointer; transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms; }
      .segmented button { border: 0; border-radius: 8px; background: transparent; color: rgba(236,248,255,.68); padding: .52rem .74rem; font-weight: 800; }
      .segmented button.active { background: rgba(34,197,94,.2); color: #dcfce7; box-shadow: inset 0 0 12px rgba(34,197,94,.14), 0 0 12px rgba(34,197,94,.08); }
      .ghost-action, .icon-button { display: inline-flex; align-items: center; gap: .42rem; padding: .62rem .76rem; text-decoration: none; }
      .ghost-action.listening { border-color: rgba(255,185,111,.78); background: rgba(255,122,0,.22); box-shadow: 0 0 20px rgba(255,122,0,.24), inset 0 0 14px rgba(255,122,0,.12); }
      .ghost-action:hover:not(:disabled), .icon-button:hover, .send-button:hover:not(:disabled), .message-actions button:hover { transform: translateY(-2px); border-color: rgba(134,239,172,.72); background: rgba(4,38,20,.78); box-shadow: 0 0 18px rgba(34,197,94,.2); }
      .ghost-action:disabled { opacity: .45; cursor: not-allowed; }
      .conversation { min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: .8rem; padding: .4rem .25rem; }
      .empty-chat { display: grid; place-items: center; align-content: center; min-height: 18rem; gap: .5rem; color: rgba(236,248,255,.7); text-align: center; }
      .empty-chat svg { color: #86efac; filter: drop-shadow(0 0 10px rgba(34,197,94,.55)); }
      .message { display: flex; }
      .message.user { justify-content: flex-end; }
      .message-bubble { max-width: min(760px, 86%); border: 1px solid rgba(74,222,128,.2); border-radius: .35rem; background: rgba(1,22,11,.55); padding: .82rem .92rem; box-shadow: inset 0 0 18px rgba(34,197,94,.05); }
      .message.user .message-bubble { border-color: rgba(45,212,191,.3); background: rgba(2,27,24,.56); }
      .message-bubble > span { color: #4ade80; font-size: .64rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
      .message-bubble p { white-space: pre-wrap; line-height: 1.55; margin: .42rem 0 0; }
      .message-actions { display: flex; gap: .5rem; margin-top: .72rem; }
      .message-actions button { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid rgba(98,201,255,.18); border-radius: 999px; background: rgba(0,0,0,.26); color: #dff8ff; padding: .38rem .55rem; }
      .tool-actions { margin-top: .6rem; color: #fbbf24; font-size: .72rem; font-weight: 800; text-transform: uppercase; }
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
      .composer { display: grid; gap: .75rem; border-top: 1px solid rgba(74,222,128,.2); padding-top: .85rem; }
      .voice-listener { border: 1px solid rgba(98,201,255,.24); border-radius: 10px; background: rgba(0,13,24,.62); color: rgba(236,248,255,.78); padding: .68rem .78rem; display: grid; gap: .38rem; }
      .voice-listener.active { border-color: rgba(255,185,111,.7); box-shadow: 0 0 18px rgba(255,122,0,.16), inset 0 0 14px rgba(8,191,255,.06); }
      .voice-listener div { display: flex; align-items: center; gap: .45rem; color: #42d1ff; font-size: .72rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
      .voice-listener strong { color: #fff4e9; font-size: .94rem; line-height: 1.4; }
      .composer textarea { min-height: 6rem; resize: vertical; border: 1px solid rgba(74,222,128,.24); border-radius: .35rem; background: rgba(0,0,0,.52); color: #ecfdf5; padding: .9rem; outline: none; box-shadow: inset 0 0 18px rgba(0,0,0,.5); }
      .composer textarea:focus { border-color: rgba(134,239,172,.7); box-shadow: 0 0 22px rgba(34,197,94,.16), inset 0 0 18px rgba(0,0,0,.5); }
      .composer-actions { justify-content: flex-end; }
      .send-button { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgba(74,222,128,.52); border-radius: .3rem; background: rgba(34,197,94,.2); color: #dcfce7; padding: .72rem 1rem; font-weight: 900; }
      .send-button:disabled { opacity: .5; cursor: not-allowed; }
      .jarvis-shell.compact { padding: 0; }
      .jarvis-shell.compact .jarvis-console { height: 100vh; border-radius: 0; border: 0; padding: .8rem; gap: .65rem; }
      .jarvis-shell.compact .jarvis-meta, .jarvis-shell.compact .model-select, .jarvis-shell.compact .header-subline, .jarvis-shell.compact .jarvis-controls .voice-control, .jarvis-shell.compact .ghost-action.listening { display: none; }
      .jarvis-shell.compact .jarvis-header h1 { font-size: 1.7rem; }
      .jarvis-shell.compact .jarvis-header p { font-size: .58rem; }
      .jarvis-shell.compact .composer textarea { min-height: 4.5rem; }
      details summary { cursor: pointer; color: #86efac; font-weight: 800; margin-top: .45rem; }
      @keyframes jarvis-console-scan { 0%, 72% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 76% { opacity: .5; } 100% { transform: translateX(470%) skewX(-18deg); opacity: 0; } }
      @media (max-width: 780px) { .jarvis-console { height: auto; min-height: calc(100vh - 2rem); } .message-bubble { max-width: 100%; } }
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
