"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { addAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function ActionForm({ memberId }: { memberId: string }) {
  const action = addAction.bind(null, memberId);
  const [state, formAction] = useFormState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error === null && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex items-end gap-2">
      <div className="flex-1">
        <input
          name="text"
          required
          placeholder="What needs to happen? (e.g. 'Follow up on Jeff's renewal by Friday')"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <input
          name="due_date"
          type="date"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <Submit />
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm bg-gray-900 text-white px-3 py-2 rounded hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
    >
      {pending ? "Adding…" : "+ Action"}
    </button>
  );
}
