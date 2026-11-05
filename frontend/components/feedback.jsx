import { AlertCircle, CheckCircle2 } from "lucide-react";

export function Feedback({ state }) {
  return (
    <>
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-primary/20 bg-accent p-3 text-sm text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{state.success}</span>
        </p>
      )}
    </>
  );
}
