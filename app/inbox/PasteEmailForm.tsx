"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SAMPLE = {
  from: "jon.minjoe@eodallas.org",
  to: "imran34@gmail.com",
  subject: "Caught up with a few members",
  body: `Hey team — quick brain dump from this week's calls.

Talked to Faisal Lalani — he's decided not to renew, he's moving over to YPO. Let's make sure we send him a warm send-off.

Amit Kapoor is on the fence about renewing; he wants to talk it through. Can someone set up a call with him before Friday?

Also — met a strong prospect, Sarah Chen at Brightwave, who's ready to apply. Membership should follow up.`,
};

export function PasteEmailForm() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadSample() {
    setFrom(SAMPLE.from);
    setTo(SAMPLE.to);
    setSubject(SAMPLE.subject);
    setEmailBody(SAMPLE.body);
    setResult(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from.trim() || !emailBody.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/ingest/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, body: emailBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setResult(
        `Extracted ${data.proposalsCreated} proposal(s)` +
          (data.unmatched ? ` (${data.unmatched} unmatched member)` : "") +
          ". See below.",
      );
      setEmailBody("");
      setSubject("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Forward an email</h3>
        <button
          type="button"
          onClick={loadSample}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          Load sample
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From (sender email)"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To (comma-separated)"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <textarea
        value={emailBody}
        onChange={(e) => setEmailBody(e.target.value)}
        placeholder="Paste the email body…"
        rows={7}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !from.trim() || !emailBody.trim()}
          className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Reading…" : "Extract"}
        </button>
        {result && <span className="text-xs text-green-700">{result}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}
