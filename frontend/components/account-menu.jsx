"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MoreVertical, Settings, UserRound } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({ account, email, failure }) {
  const pathname = usePathname();
  return (
    <div className="min-w-0 max-w-36 space-y-2 md:max-w-none md:border-t md:pt-3">
      {failure && (
        <p
          role="alert"
          className="text-xs text-destructive [overflow-wrap:anywhere]"
        >
          Profile unavailable. {failure}
        </p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Account menu"
            variant={
              ["/account", "/settings"].includes(pathname)
                ? "secondary"
                : "ghost"
            }
            className="h-auto w-11 min-w-0 justify-start gap-3 p-1.5 text-left md:w-full md:px-2 md:py-2.5"
          >
            <AccountAvatar
              icon={account?.icon ?? "user-round"}
              avatarUrl={account?.avatar_url}
              className="size-8"
            />
            <span className="hidden min-w-0 flex-1 md:block">
              <span className="block truncate text-sm font-semibold">
                {failure
                  ? "Account unavailable"
                  : (account.display_name ?? "Your account")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {email || "Wealth account"}
              </span>
            </span>
            <MoreVertical
              aria-hidden="true"
              className="hidden size-4 shrink-0 md:block"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="min-w-52">
          <DropdownMenuLabel>My account</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link
              href="/account"
              aria-current={pathname === "/account" ? "page" : undefined}
            >
              <UserRound aria-hidden="true" />
              Manage account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
            >
              <Settings aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/auth/logout">
              <LogOut aria-hidden="true" />
              Sign out
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
