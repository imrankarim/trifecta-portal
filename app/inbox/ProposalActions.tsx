"use client";

import { useState, useTransition } from "react";
import { acceptExtraction, rejectExtraction } from "./actions";

export function ProposalActions({ extractionId, canApply }: { extractionId: string; canApply: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: (id: string) => Promise<{ error: string | null; ok: boolean }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn(extractionId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600 mr-1">{error}</span>}
      <button
        type="button"
        disabled={pending || !canApply}
        title={canApply ? "" : "No member matched — reject instead"}
        onClick={() => run(acceptExtraction)}
        className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? "…" : "Accept"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(rejectExtraction)}
        className="text-xs font-medium text-gray-600 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-40"
      >
        Reject
      </button>
    </div>
  );
}
