"use client";

import { useFormState, useFormStatus } from "react-dom";
import { runHubSpotSync, type SyncFormState } from "./actions";

const initial: SyncFormState = { result: null, error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
    >
      {pending ? "Syncing…" : "Run sync"}
    </button>
  );
}

export function SyncButton() {
  const [state, formAction] = useFormState(runHubSpotSync, initial);
  const { result, error } = state;

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-xs text-gray-600">
          {result.membersInserted} added · {result.membersUpdated} updated ·{" "}
          {result.recordsSkippedNoSignal} skipped
          {result.membersFailed > 0 && (
            <span className="text-red-600"> · {result.membersFailed} failed</span>
          )}
          {result.errors.length > 0 && (
            <span className="text-amber-600"> · {result.errors.length} warnings</span>
          )}
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
      <form action={formAction}>
        <SubmitButton />
      </form>
    </div>
  );
}
