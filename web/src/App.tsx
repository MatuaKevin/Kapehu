import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "kapehu.conversation";

function loadInitialMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onError: (message: string) => void,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

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
  const [messages, setMessages] = useState<ChatMessage[]>(loadInitialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // localStorage unavailable — conversation just won't persist across reloads.
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    setError(null);
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      await streamChat(
        nextMessages,
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
      setError("Couldn't reach Kapehu. Is the server running?");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleNewConversation() {
    setMessages([]);
    setError(null);
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
        <button className="new-chat" onClick={handleNewConversation} disabled={isStreaming}>
          New conversation
        </button>
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
