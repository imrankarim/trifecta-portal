import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Not found</h1>
        <p className="text-sm text-gray-600 mb-4">
          We couldn&apos;t find what you were looking for.
        </p>
        <Link
          href="/dashboard"
          className="text-sm bg-gray-900 text-white px-3 py-2 rounded hover:bg-gray-800 inline-block"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
