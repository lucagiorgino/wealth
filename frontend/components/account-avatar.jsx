"use client";

import { AccountIcon } from "@/components/account-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function AccountAvatar({ icon, avatarUrl, className }) {
  return (
    <Avatar className={cn("rounded-lg after:rounded-lg", className)}>
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt="Profile image"
          className="rounded-lg"
        />
      )}
      <AvatarFallback className="rounded-lg">
        <AccountIcon icon={icon} aria-hidden="true" className="size-3/4" />
      </AvatarFallback>
    </Avatar>
  );
}
