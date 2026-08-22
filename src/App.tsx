import { useEffect, useRef, useState } from "react";
import { CompassMark } from "./Compass";
import { MicIcon, SpeakerIcon } from "./Icons";
import { useSpeechInput, useSpeechOutput } from "./useSpeech";

const SPEAK_KEY = "kapehu.speak";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PASSCODE_KEY = "kapehu.passcode";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good evening";
}

async function fetchMessages(passcode: string): Promise<ChatMessage[] | null> {
  const response = await fetch("/api/messages", {
    headers: { Authorization: `Bearer ${passcode}` },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Failed to load messages (${response.status})`);
  const data = (await response.json()) as { messages: ChatMessage[] };
  return data.messages;
}

async function streamChat(
  passcode: string,
  message: string,
  onDelta: (text: string) => void,
  onError: (message: string) => void,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${passcode}`,
    },
    body: JSON.stringify({ message }),
  });

  if (response.status === 401) {
    onError("Passcode no longer valid — reload and sign in again.");
    return;
  }
  if (!response.body) {
    onError("No response body from server.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const eventMatch = rawEvent.match(/^event: (.+)$/m);
      const dataMatch = rawEvent.match(/^data: (.+)$/m);
      const eventType = eventMatch?.[1];
      const data = dataMatch?.[1] ? JSON.parse(dataMatch[1]) : {};

      if (eventType === "delta") onDelta(data.text);
      else if (eventType === "error") onError(data.message);

      boundary = buffer.indexOf("\n\n");
    }
  }
}

export default function App() {
  const [passcode, setPasscode] = useState<string | null>(() =>
    localStorage.getItem(PASSCODE_KEY),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!passcode) {
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    fetchMessages(passcode)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded === null) {
          localStorage.removeItem(PASSCODE_KEY);
          setPasscode(null);
        } else {
          setMessages(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [passcode]);

  if (!passcode) {
    return (
      <PasscodeGate
        onUnlocked={(code) => {
          localStorage.setItem(PASSCODE_KEY, code);
          setLoadingHistory(true);
          setPasscode(code);
        }}
      />
    );
  }

  if (loadingHistory) {
    return (
      <div className="app">
        <div className="loading-state">
          <CompassMark size={40} seeking />
          <p>Finding your bearings…</p>
        </div>
      </div>
    );
  }

  return <Chat passcode={passcode} initialMessages={messages} />;
}

function PasscodeGate({ onUnlocked }: { onUnlocked: (passcode: string) => void }) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || checking) return;
    setChecking(true);
    setError(null);
    try {
      const result = await fetchMessages(value.trim());
      if (result === null) {
        setError("Wrong passcode.");
      } else {
        onUnlocked(value.trim());
      }
    } catch {
      setError("Couldn't reach Kapehu — try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="app">
      <div className="backdrop-rose" aria-hidden="true">
        <CompassMark size={520} />
      </div>
      <div className="passcode-gate">
        <CompassMark size={64} seeking={checking} />
        <h1>Kapehu</h1>
        <p className="tagline">Your Personal AI Wayfinder</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Passcode"
            autoFocus
          />
          <button type="submit" disabled={checking || !value.trim()}>
            {checking ? "Finding bearings…" : "Enter"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

function Chat({
  passcode,
  initialMessages,
}: {
  passcode: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakEnabled, setSpeakEnabled] = useState(
    // On by default (talks back automatically) — explicit "false" is the only way off.
    () => localStorage.getItem(SPEAK_KEY) !== "false",
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantTextRef = useRef("");
  const inputRef = useRef(input);
  const isStreamingRef = useRef(isStreaming);
  const speakEnabledRef = useRef(speakEnabled);
  const suppressMicAutoSendRef = useRef(false);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  useEffect(() => {
    speakEnabledRef.current = speakEnabled;
  }, [speakEnabled]);

  const speech = useSpeechOutput();
  const mic = useSpeechInput(
    (text) => setInput(text),
    // Fires once recognition actually stops (mic button clicked, or the
    // browser detected silence) — auto-send, closing the voice loop the way
    // ChatGPT's voice mode does, rather than requiring a separate tap on Send.
    // Suppressed when the stop was itself triggered by a manual Send, so a
    // still-listening mic doesn't cause the same message to send twice.
    () => {
      if (suppressMicAutoSendRef.current) {
        suppressMicAutoSendRef.current = false;
        return;
      }
      const text = inputRef.current.trim();
      if (text && !isStreamingRef.current) void sendMessage(text);
    },
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function toggleSpeak() {
    setSpeakEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SPEAK_KEY, String(next));
      if (!next) speech.stop();
      return next;
    });
  }

  function toggleMic() {
    if (mic.isListening) {
      mic.stop();
    } else {
      speech.stop();
      mic.start(input);
    }
  }

  async function sendMessage(text: string) {
    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);
    assistantTextRef.current = "";

    try {
      await streamChat(
        passcode,
        text,
        (delta) => {
          assistantTextRef.current += delta;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + delta };
            return updated;
          });
        },
        (message) => setError(message),
      );
      if (speakEnabledRef.current && assistantTextRef.current) {
        speech.speak(assistantTextRef.current);
      }
    } catch {
      setError("Couldn't reach Kapehu. Try again in a moment.");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    if (mic.isListening) {
      suppressMicAutoSendRef.current = true;
      mic.stop();
    }
    void sendMessage(text);
  }

  return (
    <div className="app">
      <div className="backdrop-rose" aria-hidden="true">
        <CompassMark size={640} seeking={isStreaming || speech.isSpeaking} />
      </div>

      <header className="header">
        <div className="brand">
          <CompassMark size={34} seeking={isStreaming || speech.isSpeaking} />
          <div>
            <h1>Kapehu</h1>
            <p className="tagline">Your Personal AI Wayfinder</p>
          </div>
        </div>
        {speech.supported && (
          <button
            type="button"
            className={`icon-toggle${speakEnabled ? " active" : ""}`}
            onClick={toggleSpeak}
            title={speakEnabled ? "Kapehu will read replies aloud" : "Read replies aloud"}
            aria-pressed={speakEnabled}
          >
            <SpeakerIcon muted={!speakEnabled} />
          </button>
        )}
      </header>

      <main className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <CompassMark size={48} />
            <p className="empty-greeting">{greeting()}.</p>
            <p>What's on your mind? Kapehu is here to help you find your bearings.</p>
          </div>
        )}
        {messages.map((message, index) => {
          const isLiveAssistant =
            isStreaming && index === messages.length - 1 && message.role === "assistant";
          return (
            <div key={index} className={`bubble ${message.role} enter`}>
              <div className="bubble-content">
                {message.content}
                {isLiveAssistant && !message.content && (
                  <span className="thinking">
                    <CompassMark size={18} seeking />
                    seeking direction…
                  </span>
                )}
                {isLiveAssistant && message.content && <span className="caret" />}
              </div>
            </div>
          );
        })}
        {error && <div className="error">{error}</div>}
      </main>

      <form className="composer" onSubmit={handleSubmit}>
        {mic.supported && (
          <button
            type="button"
            className={`mic-button${mic.isListening ? " listening" : ""}`}
            onClick={toggleMic}
            disabled={isStreaming}
            title={mic.isListening ? "Stop dictating" : "Speak your message"}
            aria-pressed={mic.isListening}
          >
            <MicIcon />
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={mic.isListening ? "Listening…" : "Talk to Kapehu..."}
          rows={2}
          disabled={isStreaming}
        />
        <button type="submit" className="send-button" disabled={isStreaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
