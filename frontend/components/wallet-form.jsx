"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  createWalletAction,
  previewWalletIconAction,
  updateWalletAction,
} from "@/app/(app)/wallets/actions";
import { Feedback } from "@/components/feedback";
import { WalletIcon } from "@/components/wallet-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  decimalAmount,
  walletCurrencyOptions,
  walletIcons,
  walletTypes,
} from "@/lib/wallets";

export function CreateWalletDialog() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2 px-4" onClick={() => setSaved(false)}>
            <Plus aria-hidden="true" /> Add wallet
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a wallet</DialogTitle>
            <DialogDescription>
              A home for an account, cash, or savings. Choose a look that makes
              it easy to recognize.
            </DialogDescription>
          </DialogHeader>
          <WalletForm
            onSaved={() => {
              setOpen(false);
              setSaved(true);
            }}
          />
        </DialogContent>
      </Dialog>
      {saved && (
        <p role="status" className="text-sm text-primary-ink">
          Wallet created.
        </p>
      )}
    </div>
  );
}

export function WalletForm({ wallet, onSaved }) {
  const [values, setValues] = useState({
    name: "",
    colour: "#3b82f6",
    icon: "wallet",
    initial_amount: "0",
    currency: "EUR",
    type: "bank",
    ...wallet,
    favicon_url: "",
  });
  const [preview, setPreview] = useState(null);
  const faviconUrl = values.icon === "custom" ? values.favicon_url.trim() : "";
  const currentPreview = preview?.url === faviconUrl ? preview : null;
  const previewLoading = Boolean(faviconUrl && !currentPreview);
  const imageUrl = faviconUrl
    ? currentPreview?.icon_image_url
    : wallet?.icon_image_url;
  useEffect(() => {
    if (!faviconUrl) return;
    let active = true;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await previewWalletIconAction(faviconUrl);
        if (active) setPreview({ url: faviconUrl, ...result });
      });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [faviconUrl]);
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await (wallet ? updateWalletAction : createWalletAction)(
      previous,
      form,
    );
    if (result.success) onSaved?.();
    return result;
  }, {});
  function change(event) {
    const { name, value } = event.target;
    setValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  return (
    <form
      action={action}
      aria-label={wallet ? `Edit wallet ${wallet.name}` : "Create wallet"}
      onResetCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="space-y-5"
    >
      {wallet && <input type="hidden" name="id" value={wallet.id} />}
      <div
        role="group"
        aria-label="Wallet preview"
        aria-busy={previewLoading}
        className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card">
          <WalletIcon
            icon={values.icon}
            colour={values.colour}
            imageUrl={imageUrl}
          />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Preview</p>
          <p className="font-medium [overflow-wrap:anywhere]">
            {values.name.trim() || "Your wallet"}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="wallet-name">Name</Label>
        <Input
          id="wallet-name"
          name="name"
          required
          maxLength={100}
          value={values.name}
          onChange={change}
          disabled={pending}
          placeholder="e.g. Everyday spending"
        />
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-5">
        <div className="space-y-2">
          <Label htmlFor="wallet-colour">Colour</Label>
          <Input
            id="wallet-colour"
            name="colour"
            type="color"
            value={values.colour}
            onChange={change}
            disabled={pending}
            required
            className="w-20 cursor-pointer p-1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wallet-type">Type</Label>
          <NativeSelect
            id="wallet-type"
            name="type"
            value={values.type}
            onChange={change}
            disabled={pending}
            required
          >
            {walletTypes.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {type[0].toUpperCase() + type.slice(1)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Icon</legend>
        <RadioGroup
          name="icon"
          aria-label="Icon"
          value={values.icon}
          onValueChange={(icon) =>
            setValues((current) => ({ ...current, icon }))
          }
          disabled={pending}
          className="grid-cols-3 gap-2"
          required
        >
          {walletIcons.map((option) => (
            <Label
              key={option.value}
              htmlFor={`wallet-icon-${option.value}`}
              className={`relative flex min-h-20 cursor-pointer flex-col justify-center gap-1.5 rounded-lg border p-2 text-xs has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                values.icon === option.value
                  ? "border-primary bg-accent"
                  : "border-border hover:bg-muted"
              }`}
            >
              <RadioGroupItem
                id={`wallet-icon-${option.value}`}
                value={option.value}
                className="absolute top-1.5 right-1.5 size-3 aria-checked:border-primary aria-checked:bg-primary"
              />
              <WalletIcon
                icon={option.value}
                colour={values.colour}
                imageUrl={imageUrl}
              />
              {option.label}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      {values.icon === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="wallet-favicon">Favicon URL</Label>
          <Input
            id="wallet-favicon"
            name="favicon_url"
            type="url"
            value={values.favicon_url}
            onChange={change}
            disabled={pending}
            required={!wallet?.icon_image_url}
            maxLength={2048}
            placeholder="https://example.com/favicon.ico"
            aria-invalid={Boolean(currentPreview?.error)}
            aria-describedby={`wallet-favicon-help${currentPreview?.error ? " wallet-favicon-error" : ""}`}
          />
          <p id="wallet-favicon-help" className="text-sm text-muted-foreground">
            A direct public HTTPS URL to a static ICO, PNG, JPEG, or WebP image,
            up to 2 MiB. Preview updates automatically; the image is stored only
            when you save. Redirects are refused.
            {wallet?.icon_image_url &&
              " Leave blank to keep your saved favicon."}
          </p>
          {currentPreview?.error ? (
            <p
              id="wallet-favicon-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {currentPreview.error}
            </p>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {previewLoading
                ? "Loading favicon preview..."
                : currentPreview?.icon_image_url
                  ? "Favicon preview updated."
                  : ""}
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="wallet-currency">Currency</Label>
        <NativeSelect
          id="wallet-currency"
          name="currency"
          value={values.currency}
          onChange={change}
          disabled={pending}
          required
          aria-describedby="wallet-currency-help"
        >
          {wallet?.currency &&
            !walletCurrencyOptions.some(
              (option) => option.value === wallet.currency,
            ) && (
              <NativeSelectOption value={wallet.currency}>
                {wallet.currency} (existing wallet)
              </NativeSelectOption>
            )}
          {walletCurrencyOptions.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p id="wallet-currency-help" className="text-sm text-muted-foreground">
          Transfers require the same currency. Currency cannot change once this
          wallet has transactions.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="wallet-amount">Initial amount</Label>
        <input
          type="range"
          aria-label="Adjust initial amount"
          min="-100000"
          max="100000"
          step="0.01"
          value={
            decimalAmount.test(values.initial_amount)
              ? values.initial_amount
              : "0"
          }
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              initial_amount: event.target.value,
            }))
          }
          disabled={pending}
          aria-describedby="wallet-amount-help"
          className="h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
        />
        <Input
          id="wallet-amount"
          name="initial_amount"
          inputMode="decimal"
          value={values.initial_amount}
          onChange={change}
          disabled={pending}
          aria-describedby="wallet-amount-help"
        />
        <p id="wallet-amount-help" className="text-sm text-muted-foreground">
          Slide from -100,000 to 100,000 in steps of 0.01, or enter any exact
          amount below the slider, including more decimal places. Defaults to 0.
          Current balance includes transactions due through today UTC. After a
          month-end close is frozen, use Balance Adjustment to reconcile a later
          opening balance rather than changing this initial amount.
        </p>
      </div>
      <Feedback state={state} />
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving wallet..."
            : wallet
              ? "Save changes"
              : "Create wallet"}
        </Button>
      </div>
    </form>
  );
}
