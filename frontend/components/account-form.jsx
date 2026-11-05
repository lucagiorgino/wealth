"use client";

import { useActionState, useState } from "react";
import { updateAccountAction } from "@/app/(app)/account/actions";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountForm({ account }) {
  const [displayName, setDisplayName] = useState(account.display_name ?? "");
  const [state, action, pending] = useActionState(updateAccountAction, {});

  // React's post-action form reset must not discard profile edits.
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      aria-label="Account profile"
      className="space-y-6"
    >
      <div className="space-y-2">
        <Label htmlFor="account-name">Display name</Label>
        <Input
          id="account-name"
          name="display_name"
          autoComplete="nickname"
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={pending}
          placeholder="Your name"
          aria-describedby="account-name-help"
        />
        <p id="account-name-help" className="text-sm text-muted-foreground">
          Use 1 to 100 characters. This name is only used in Wealth.
        </p>
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save account"}
      </Button>
    </form>
  );
}
