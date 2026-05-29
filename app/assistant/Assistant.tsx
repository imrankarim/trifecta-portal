"use client";

import { useRef, useState } from "react";

const PRESETS = [
  "Who should I call this week?",
  "Give me a chapter health summary.",
  "Which forums need attention?",
  "Who are our most at-risk members and why?",
  "Which members haven't engaged in a long time?",
];

export function Assistant() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || loading) return;
    setAsked(query);
    setQuestion("");
    setAnswer("");
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          /* keep default */
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-5">
      {/* Ask box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about your chapter…"
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="text-sm bg-indigo-600 text-white px-4 py-2.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => ask(p)}
            disabled={loading}
            className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-full hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Answer */}
      {asked && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50">
            <div className="text-xs uppercase tracking-wide text-indigo-700 font-medium">You asked</div>
            <div className="text-sm text-gray-900 mt-0.5">{asked}</div>
          </div>
          <div className="p-5">
            {error ? (
              <div className="text-sm text-red-700">{error}</div>
            ) : answer ? (
              <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{answer}</p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="inline-block w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                Reading your chapter data…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
