"use client";

import { useTransition } from "react";
import { toggleAction } from "./actions";

export function ActionCheckbox({
  memberId,
  actionId,
  completed,
}: {
  memberId: string;
  actionId: string;
  completed: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => toggleAction(memberId, actionId))}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors disabled:opacity-50 shrink-0 ${
        completed
          ? "bg-green-600 border-green-600 hover:bg-green-700"
          : "bg-white border-gray-300 hover:border-gray-400"
      }`}
      aria-label={completed ? "Mark incomplete" : "Mark complete"}
    >
      {completed && (
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="3 8 7 12 13 4" />
        </svg>
      )}
    </button>
  );
}
