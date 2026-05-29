"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white border border-red-200 rounded-lg p-6">
        <h1 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-700 mb-4">{error.message || "Unknown error"}</p>
        {error.digest && (
          <p className="text-xs text-gray-500 mb-4">Digest: {error.digest}</p>
        )}
        <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto max-h-64 mb-4">
          {error.stack ?? "(no stack trace)"}
        </pre>
        <button
          type="button"
          onClick={reset}
          className="text-sm bg-gray-900 text-white px-3 py-2 rounded hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
