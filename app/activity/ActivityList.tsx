"use client";

import { useMemo, useState, useTransition } from "react";
import { undoActivity } from "./actions";

export interface ActivityRow {
  id: string;
  actor_type: string;
  actorName: string | null;
  action: string;
  source: string | null;
  summary: string;
  reversible: boolean;
  reverted_at: string | null;
  created_at: string;
  canUndo: boolean;
}

const ACTION_BADGE: Record<string, string> = {
  email_extraction_auto_applied: "bg-indigo-100 text-indigo-800",
  proposal_accepted: "bg-green-100 text-green-800",
  proposal_rejected: "bg-gray-100 text-gray-600",
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActivityList({ rows }: { rows: ActivityRow[] }) {
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.summary.toLowerCase().includes(needle) ||
        r.action.toLowerCase().includes(needle) ||
        (r.actorName ?? "").toLowerCase().includes(needle) ||
        (r.source ?? "").toLowerCase().includes(needle),
    );
  }, [q, rows]);

  function undo(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const res = await undoActivity(id);
      if (!res.ok) setError(res.error);
      setPendingId(null);
    });
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search activity…"
        className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          {rows.length === 0 ? "No activity yet." : "No matches."}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.map((r) => (
            <div key={r.id} className="px-5 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${ACTION_BADGE[r.action] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {r.action.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {r.actor_type === "system" ? "Trifecta" : r.actorName ?? "A chair"} · {timeAgo(r.created_at)}
                    {r.source ? ` · ${r.source}` : ""}
                  </span>
                  {r.reverted_at && (
                    <span className="text-[10px] text-gray-400 italic">undone</span>
                  )}
                </div>
                <div className={`text-sm mt-1 ${r.reverted_at ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {r.summary}
                </div>
              </div>
              {r.reversible && !r.reverted_at && r.canUndo && (
                <button
                  type="button"
                  disabled={pendingId === r.id}
                  onClick={() => undo(r.id)}
                  className="shrink-0 text-xs font-medium text-gray-600 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-40"
                >
                  {pendingId === r.id ? "Undoing…" : "Undo"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
