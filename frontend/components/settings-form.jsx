"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Moon, Sun } from "lucide-react";
import { updateSettingsAction } from "@/app/(app)/settings/actions";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sidebarPages } from "@/lib/settings";

const themes = [
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "A bright, clear workspace.",
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
    description: "A softer workspace after dark.",
  },
];

export function SettingsForm({ settings }) {
  const [theme, setTheme] = useState(settings.theme);
  const [order, setOrder] = useState(settings.sidebar_order);
  const [announcement, setAnnouncement] = useState("");
  const [state, action, pending] = useActionState(updateSettingsAction, {});

  function move(id, direction, event) {
    const next = [...order];
    const index = next.indexOf(id);
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    if (target === 0 || target === order.length - 1) {
      // Move focus before the clicked boundary control becomes disabled.
      const otherButton =
        direction < 0
          ? event.currentTarget.nextElementSibling
          : event.currentTarget.previousElementSibling;
      otherButton.focus();
    }
    setOrder(next);
    const label = sidebarPages.find((page) => page.id === id).label;
    setAnnouncement(
      `${label} moved to position ${target + 1} of ${order.length}.`,
    );
  }

  return (
    <form
      action={action}
      aria-label="Workspace settings"
      className="space-y-6"
      onResetCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-6">
        <legend className="sr-only">Appearance and sidebar</legend>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Appearance</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Your saved theme applies throughout Wealth, including menus and
              dialogs.
            </p>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">Theme</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {themes.map(({ value, label, icon: Icon, description }) => (
                  <label
                    key={value}
                    className="flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border bg-background p-4 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={value}
                      checked={theme === value}
                      onChange={() => setTheme(value)}
                      className="size-4 shrink-0 accent-primary"
                      aria-label={label}
                    />
                    <Icon
                      aria-hidden="true"
                      className="size-5 shrink-0 text-primary-ink"
                    />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Sidebar order</h2>
            </CardTitle>
            <p
              id="sidebar-order-help"
              className="text-sm text-muted-foreground"
            >
              Move features up or down. This order also applies to mobile
              navigation; your account menu stays in place.
            </p>
          </CardHeader>
          <CardContent>
            <ol
              aria-label="Sidebar features"
              aria-describedby="sidebar-order-help"
              className="space-y-2"
            >
              {order.map((id, index) => {
                const { label } = sidebarPages.find((page) => page.id === id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <input type="hidden" name="sidebar_order" value={id} />
                    <span
                      aria-hidden="true"
                      className="w-5 text-sm text-muted-foreground"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {label}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Move ${label} up`}
                        disabled={index === 0}
                        onClick={(event) => move(id, -1, event)}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Move ${label} down`}
                        disabled={index === order.length - 1}
                        onClick={(event) => move(id, 1, event)}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p aria-live="polite" aria-atomic="true" className="sr-only">
              {announcement}
            </p>
          </CardContent>
        </Card>
      </fieldset>
      <Feedback state={state} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Saved to your account, across devices.
        </p>
      </div>
    </form>
  );
}
