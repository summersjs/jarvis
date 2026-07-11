"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Clipboard,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  Trash2,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const HISTORY_KEY = "jarvis.chloe.history";
const MODE_KEY = "jarvis.chloe.outputMode";
const VOICE_KEY = "jarvis.chloe.voice";

type ChatRole = "user" | "assistant";
type OutputMode = "text" | "voice" | "both";
type VoiceId = "af_bella" | "af_nicole";
type StatusKind = "Offline" | "Connecting" | "Ready" | "Thinking" | "Speaking" | "Error";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  collapsed?: boolean;
};

type AssistantStatus = {
  ollama?: { online: boolean; modelAvailable: boolean; model: string };
  tts?: { online: boolean; defaultVoice: VoiceId; availableVoices: VoiceId[] };
};

const VOICES: Array<{ id: VoiceId; label: string }> = [
  { id: "af_bella", label: "Bella" },
  { id: "af_nicole", label: "Nicole" },
];

const MODES: Array<{ id: OutputMode; label: string }> = [
  { id: "text", label: "Text" },
  { id: "voice", label: "Voice" },
  { id: "both", label: "Both" },
];

export default function ChloePage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages());
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<OutputMode>(() => loadStoredMode());
  const [voice, setVoice] = useState<VoiceId>(() => loadStoredVoice());
  const [status, setStatus] = useState<StatusKind>("Connecting");
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>({});
  const [error, setError] = useState("");
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrls = useRef(new Map<string, string>());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(VOICE_KEY, voice);
  }, [voice]);

  useEffect(() => {
    loadStatus();
    const timer = window.setInterval(loadStatus, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    stopAudio();
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const visibleMessages = useMemo(() => messages, [messages]);
  const model = assistantStatus.ollama?.model || "qwen3:8b";
  const voiceLabel = VOICES.find((item) => item.id === voice)?.label || "Bella";

  async function loadStatus() {
    try {
      const response = await fetch(`${API_BASE}/assistant/status`, { headers: { "x-api-key": API_KEY } });
      const data = await response.json();
      setAssistantStatus(data);
      setStatus(data.ollama?.online && data.ollama?.modelAvailable ? "Ready" : "Offline");
    } catch {
      setStatus("Offline");
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || status === "Thinking") return;
    setInput("");
    setError("");
    stopAudio();

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextHistory = [...messages, userMessage].slice(-20);
    setMessages(nextHistory);
    setStatus("Thinking");

    try {
      const response = await fetch(`${API_BASE}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          messages: nextHistory.map(({ role, content: body }) => ({ role, content: body })),
        }),
      });
      if (!response.ok) throw new Error(await friendlyError(response));
      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message.content,
        collapsed: mode === "voice",
      };
      setMessages((current) => [...current, assistantMessage]);
      setStatus("Ready");
      if (mode !== "text") await speakMessage(assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chloe tripped over the local wire.");
      setStatus("Error");
    }
  }

  async function speakMessage(message: ChatMessage) {
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

  async function previewVoice() {
    stopAudio();
    await speakMessage({ id: "preview", role: "assistant", content: "Good evening, John. Chloe is online." });
  }

  function clearChat() {
    if (!window.confirm("Clear this Chloe conversation?")) return;
    stopAudio();
    setMessages([]);
    setError("");
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrls.current.clear();
  }

  return (
    <main className="chloe-shell">
      <div className="chloe-grid" />
      <section className="chloe-console">
        <header className="chloe-header">
          <div>
            <p>Jarvis Local AI</p>
            <h1>Chloe</h1>
          </div>
          <div className={`chloe-status ${status.toLowerCase()}`}>
            {status === "Offline" ? <WifiOff size={16} /> : <Wifi size={16} />}
            <span>{status}</span>
          </div>
        </header>

        <section className="chloe-meta">
          <InfoPill label="Model" value={model} active={!!assistantStatus.ollama?.modelAvailable} />
          <InfoPill label="Voice" value={voiceLabel} active={!!assistantStatus.tts?.online} />
          <button className="ghost-action" type="button" disabled title="Coming next">
            Morning Brief
          </button>
          <button className="ghost-action" type="button" disabled title="Coming next">
            Daily Debrief
          </button>
        </section>

        <section className="chloe-controls">
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
              <strong>Chloe is waiting.</strong>
              <span>Ask her what to work on, draft a plan, or just say hello.</span>
            </div>
          )}
          {visibleMessages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-bubble">
                <span>{message.role === "assistant" ? "Chloe" : "John"}</span>
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
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </section>

        {error && <div className="chloe-error">{error}</div>}

        <footer className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Talk to Chloe..."
          />
          <div className="composer-actions">
            <Link href="/" className="ghost-action">Command Center</Link>
            <button className="ghost-action" type="button" onClick={clearChat}><Trash2 size={16} /> New</button>
            {activeAudioId && <button className="ghost-action" type="button" onClick={togglePause}>{isPaused ? <Play size={16} /> : <Pause size={16} />} Audio</button>}
            {activeAudioId && <button className="ghost-action" type="button" onClick={() => stopAudio()}><Square size={16} /> Stop</button>}
            <button className="send-button" type="button" onClick={sendMessage} disabled={!input.trim() || status === "Thinking"}>
              {status === "Thinking" ? <X size={18} /> : <Send size={18} />}
              {status === "Thinking" ? "Thinking" : "Send"}
            </button>
          </div>
        </footer>
      </section>
      <ChloeStyles />
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
    const saved = window.localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function loadStoredMode(): OutputMode {
  if (typeof window === "undefined") return "both";
  const saved = window.localStorage.getItem(MODE_KEY) as OutputMode | null;
  return saved && MODES.some((item) => item.id === saved) ? saved : "both";
}

function loadStoredVoice(): VoiceId {
  if (typeof window === "undefined") return "af_bella";
  const saved = window.localStorage.getItem(VOICE_KEY) as VoiceId | null;
  return saved && VOICES.some((item) => item.id === saved) ? saved : "af_bella";
}

function ChloeStyles() {
  return (
    <style>{`
      .chloe-shell { min-height: 100vh; position: relative; overflow: hidden; background: radial-gradient(circle at 25% 40%, rgba(8,191,255,.18), transparent 28rem), radial-gradient(circle at 72% 44%, rgba(255,122,0,.17), transparent 26rem), #020407; color: #ecf8ff; padding: clamp(1rem, 2vw, 2rem); }
      .chloe-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px); background-size: 76px 76px; mask-image: radial-gradient(circle at 50% 50%, black, transparent 80%); pointer-events: none; }
      .chloe-console { position: relative; z-index: 1; display: grid; grid-template-rows: auto auto auto 1fr auto auto; gap: 1rem; max-width: 1180px; height: calc(100vh - clamp(2rem, 4vw, 4rem)); margin: 0 auto; border: 1px solid rgba(98,201,255,.24); border-radius: 16px; background: linear-gradient(135deg, rgba(2,8,12,.76), rgba(0,0,0,.82)); padding: clamp(1rem, 2vw, 1.4rem); backdrop-filter: blur(16px); box-shadow: 0 0 54px rgba(0,0,0,.56), inset 0 0 26px rgba(8,191,255,.06); }
      .chloe-header, .chloe-meta, .chloe-controls, .composer-actions, .voice-control { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
      .chloe-header { justify-content: space-between; border-bottom: 1px solid rgba(98,201,255,.16); padding-bottom: .9rem; }
      .chloe-header p, .info-pill span, .segmented > span { color: #42d1ff; font-size: .68rem; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
      .chloe-header h1 { margin: .18rem 0 0; color: white; font-size: clamp(2rem, 4vw, 4rem); letter-spacing: .08em; text-transform: uppercase; text-shadow: 0 0 22px rgba(8,191,255,.48); }
      .chloe-status, .info-pill, .ghost-action, .icon-button { border: 1px solid rgba(98,201,255,.22); border-radius: 10px; background: rgba(0,13,24,.58); color: #dff8ff; }
      .chloe-status { display: inline-flex; align-items: center; gap: .45rem; padding: .55rem .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
      .chloe-status.ready, .info-pill.active { border-color: rgba(74,222,128,.34); color: #caffbf; }
      .chloe-status.error, .chloe-status.offline { border-color: rgba(248,113,113,.38); color: #fecaca; }
      .info-pill { display: grid; min-width: 10rem; gap: .18rem; padding: .68rem .8rem; }
      .info-pill strong { font-size: .9rem; }
      .segmented { display: flex; align-items: center; gap: .7rem; }
      .segmented div { display: inline-flex; border: 1px solid rgba(98,201,255,.18); border-radius: 10px; background: rgba(0,0,0,.28); padding: .22rem; }
      .segmented button, .ghost-action, .icon-button, .send-button, .message-actions button { cursor: pointer; transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms; }
      .segmented button { border: 0; border-radius: 8px; background: transparent; color: rgba(236,248,255,.68); padding: .52rem .74rem; font-weight: 800; }
      .segmented button.active { background: rgba(255,122,0,.18); color: #fff4e9; box-shadow: inset 0 0 12px rgba(255,122,0,.12); }
      .ghost-action, .icon-button { display: inline-flex; align-items: center; gap: .42rem; padding: .62rem .76rem; text-decoration: none; }
      .ghost-action:hover:not(:disabled), .icon-button:hover, .send-button:hover:not(:disabled), .message-actions button:hover { transform: translateY(-2px); border-color: rgba(255,185,111,.62); background: rgba(25,12,0,.72); box-shadow: 0 0 18px rgba(255,122,0,.2); }
      .ghost-action:disabled { opacity: .45; cursor: not-allowed; }
      .conversation { min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: .8rem; padding: .4rem .25rem; }
      .empty-chat { display: grid; place-items: center; align-content: center; min-height: 18rem; gap: .5rem; color: rgba(236,248,255,.7); text-align: center; }
      .empty-chat svg { color: #ff9f3d; filter: drop-shadow(0 0 10px rgba(255,122,0,.55)); }
      .message { display: flex; }
      .message.user { justify-content: flex-end; }
      .message-bubble { max-width: min(760px, 86%); border: 1px solid rgba(98,201,255,.18); border-radius: 14px; background: rgba(0,13,24,.5); padding: .82rem .92rem; box-shadow: inset 0 0 18px rgba(8,191,255,.05); }
      .message.user .message-bubble { border-color: rgba(255,122,0,.26); background: rgba(25,12,0,.52); }
      .message-bubble > span { color: #42d1ff; font-size: .64rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
      .message-bubble p { white-space: pre-wrap; line-height: 1.55; margin: .42rem 0 0; }
      .message-actions { display: flex; gap: .5rem; margin-top: .72rem; }
      .message-actions button { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid rgba(98,201,255,.18); border-radius: 999px; background: rgba(0,0,0,.26); color: #dff8ff; padding: .38rem .55rem; }
      .chloe-error { border: 1px solid rgba(248,113,113,.34); border-radius: 10px; background: rgba(127,29,29,.2); color: #fecaca; padding: .7rem .8rem; }
      .composer { display: grid; gap: .75rem; border-top: 1px solid rgba(98,201,255,.16); padding-top: .85rem; }
      .composer textarea { min-height: 6rem; resize: vertical; border: 1px solid rgba(98,201,255,.22); border-radius: 12px; background: rgba(0,0,0,.5); color: #ecf8ff; padding: .9rem; outline: none; box-shadow: inset 0 0 18px rgba(0,0,0,.5); }
      .composer textarea:focus { border-color: rgba(255,185,111,.62); box-shadow: 0 0 22px rgba(255,122,0,.14), inset 0 0 18px rgba(0,0,0,.5); }
      .composer-actions { justify-content: flex-end; }
      .send-button { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgba(255,122,0,.42); border-radius: 10px; background: rgba(255,122,0,.18); color: #fff4e9; padding: .72rem 1rem; font-weight: 900; }
      .send-button:disabled { opacity: .5; cursor: not-allowed; }
      details summary { cursor: pointer; color: #ffb466; font-weight: 800; margin-top: .45rem; }
      @media (max-width: 780px) { .chloe-console { height: auto; min-height: calc(100vh - 2rem); } .message-bubble { max-width: 100%; } }
    `}</style>
  );
}
