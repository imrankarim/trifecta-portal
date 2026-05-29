"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { addNote, type FormState } from "./actions";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "outreach", label: "Outreach" },
  { value: "renewal", label: "Renewal conversation" },
  { value: "forum", label: "Forum check-in" },
  { value: "sponsor", label: "Sponsor talk" },
  { value: "event", label: "Event" },
];

const initialState: FormState = { error: null };

export function NoteForm({ memberId }: { memberId: string }) {
  const action = addNote.bind(null, memberId);
  const [state, formAction] = useFormState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the textarea after a successful submit (no error)
  useEffect(() => {
    if (state.error === null && formRef.current) {
      const textarea = formRef.current.querySelector<HTMLTextAreaElement>("textarea[name='text']");
      if (textarea) textarea.value = "";
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <textarea
        name="text"
        required
        rows={2}
        placeholder="Add a note — e.g. 'Called Jeff, planning to renew but wants to see speaker schedule first.'"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
      />
      <div className="flex items-center gap-2">
        <select
          name="category"
          defaultValue="general"
          className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-700"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Submit />
        {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="ml-auto text-sm bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-800 disabled:opacity-50"
    >
      {pending ? "Adding…" : "Add note"}
    </button>
  );
}
