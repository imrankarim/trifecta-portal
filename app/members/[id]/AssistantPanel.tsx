"use client";

import { useState } from "react";

interface ExplainResponse {
  narrative: string;
  error?: string;
}

interface DraftResponse {
  subject: string;
  body: string;
  error?: string;
}

type Loading = "idle" | "explain" | "draft";

export function AssistantPanel({ memberId }: { memberId: string }) {
  const [loading, setLoading] = useState<Loading>("idle");
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function runExplain() {
    setLoading("explain");
    setError(null);
    setDraft(null);
    try {
      const res = await fetch(`/api/members/${memberId}/explain`, { method: "POST" });
      const data: ExplainResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setNarrative(data.narrative);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading("idle");
    }
  }

  async function runDraft() {
    setLoading("draft");
    setError(null);
    setNarrative(null);
    try {
      const res = await fetch(`/api/members/${memberId}/draft-outreach`, { method: "POST" });
      const data: DraftResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setDraft({ subject: data.subject, body: data.body });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading("idle");
    }
  }

  async function copyDraft() {
    if (!draft) return;
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  return (
    <section className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-5 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
            <span className="text-base">✨</span> AI assistant
          </h2>
          <p className="text-xs text-indigo-700/80 mt-0.5">
            Powered by Claude. Reads everything we know about this member.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={runExplain}
            disabled={loading !== "idle"}
            className="text-sm bg-indigo-600 text-white px-3 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {loading === "explain" ? "Thinking…" : "Explain this member"}
          </button>
          <button
            type="button"
            onClick={runDraft}
            disabled={loading !== "idle"}
            className="text-sm bg-white text-indigo-700 border border-indigo-300 px-3 py-2 rounded-md hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {loading === "draft" ? "Drafting…" : "Draft outreach"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {narrative && (
        <div className="mt-4 bg-white border border-indigo-200 rounded-md p-4">
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{narrative}</p>
        </div>
      )}

      {draft && (
        <div className="mt-4 bg-white border border-indigo-200 rounded-md">
          <div className="flex items-center justify-between border-b border-indigo-100 px-4 py-2">
            <div className="text-xs uppercase tracking-wide text-indigo-700 font-medium">
              Draft email
            </div>
            <button
              type="button"
              onClick={copyDraft}
              className="text-xs text-indigo-700 hover:text-indigo-900 border border-indigo-300 px-2 py-0.5 rounded hover:bg-indigo-50"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="p-4 space-y-3">
            {draft.subject && (
              <div className="text-sm">
                <span className="text-gray-500">Subject: </span>
                <span className="text-gray-900 font-medium">{draft.subject}</span>
              </div>
            )}
            <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
              {draft.body}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
