import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PASSCODE_KEY = "kapehu.passcode";

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
        <div className="empty-state" style={{ margin: "auto" }}>
          Loading your conversation…
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
      <div className="passcode-gate">
        <span className="compass" aria-hidden="true">
          🧭
        </span>
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
            {checking ? "Checking…" : "Enter"}
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    try {
      await streamChat(
        passcode,
        text,
        (delta) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + delta };
            return updated;
          });
        },
        (message) => setError(message),
      );
    } catch {
      setError("Couldn't reach Kapehu. Try again in a moment.");
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="compass" aria-hidden="true">
            🧭
          </span>
          <div>
            <h1>Kapehu</h1>
            <p className="tagline">Your Personal AI Wayfinder</p>
          </div>
        </div>
      </header>

      <main className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <p>What's on your mind? Kapehu is here to help you find your bearings.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`bubble ${message.role}`}>
            <div className="bubble-content">
              {message.content || (message.role === "assistant" && isStreaming ? "…" : "")}
            </div>
          </div>
        ))}
        {error && <div className="error">{error}</div>}
      </main>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Talk to Kapehu..."
          rows={2}
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
