"use client";

import { useActionState } from "react";

type NotesState = {
  error?: string;
  message?: string;
};

type NotesAction = (
  prev: NotesState | undefined,
  formData: FormData,
) => Promise<NotesState>;

/**
 * Server action is passed from the Server Component page so this client
 * module never imports a `"use server"` file (avoids soft-nav webpack stub collisions).
 */
export function QuoteNotesForm({
  quoteId,
  adminNotes,
  action: saveAction,
}: {
  quoteId: string;
  adminNotes: string;
  action: NotesAction;
}) {
  const [state, action, pending] = useActionState(saveAction, {} as NotesState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <textarea
        name="adminNotes"
        rows={5}
        defaultValue={adminNotes}
        placeholder="Internal notes — not visible to the buyer."
        className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
        {state?.message ? (
          <span className="text-[12px] text-[#4E9A6A]">{state.message}</span>
        ) : null}
        {state?.error ? <span className="text-[12px] text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
