"use client";

import { useActionState, useId, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  createAssetAction,
  deleteAssetAction,
  recordAssetValuationAction,
} from "@/app/(app)/assets/actions";
import { Feedback } from "@/components/feedback";
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
import { assetGroups } from "@/lib/assets";
import { walletCurrencies } from "@/lib/wallets";

function AssetForm({ asset, today, onSaved }) {
  const id = useId();
  const [values, setValues] = useState({
    name: "",
    asset_group: "stocks",
    currency: "EUR",
    date: today,
    amount: "",
  });
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await (
      asset ? recordAssetValuationAction : createAssetAction
    )(previous, form);
    if (result.success) onSaved();
    return result;
  }, {});
  const change = (event) =>
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  return (
    <form
      action={action}
      aria-label={asset ? `Value ${asset.name}` : "Add asset"}
      onReset={(event) => event.preventDefault()}
      className="space-y-5"
    >
      {asset ? (
        <input type="hidden" name="id" value={asset.id} />
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              name="name"
              required
              maxLength={100}
              value={values.name}
              onChange={change}
              disabled={pending}
              placeholder="Account, holding, or loan"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-group`}>Asset group</Label>
              <NativeSelect
                id={`${id}-group`}
                name="asset_group"
                value={values.asset_group}
                onChange={change}
                disabled={pending}
              >
                {assetGroups.map((group) => (
                  <NativeSelectOption key={group.value} value={group.value}>
                    {group.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-currency`}>Currency</Label>
              <NativeSelect
                id={`${id}-currency`}
                name="currency"
                value={values.currency}
                onChange={change}
                disabled={pending}
              >
                {walletCurrencies.map((currency) => (
                  <NativeSelectOption key={currency} value={currency}>
                    {currency}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-date`}>Valuation date</Label>
          <Input
            id={`${id}-date`}
            name="date"
            type="date"
            required
            min="0001-01-01"
            max={today}
            value={values.date}
            onChange={change}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-amount`}>
            Value ({asset?.currency ?? values.currency})
          </Label>
          <Input
            id={`${id}-amount`}
            name="amount"
            inputMode="decimal"
            required
            value={values.amount}
            onChange={change}
            disabled={pending}
            placeholder="0.00"
            aria-describedby={`${id}-help`}
          />
        </div>
      </div>
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        Enter the total holding value, not its price or quantity. Values carry
        forward until the next valuation. Saving the same date replaces its
        value. Enter debt as a positive liability, or zero to close a position.
      </p>
      <Feedback state={state} />
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : asset ? "Save valuation" : "Add asset"}
        </Button>
      </div>
    </form>
  );
}

export function AssetDialog({ asset, today }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asset ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Record valuation for ${asset.name}`}
            title="Record valuation"
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" /> Add asset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {asset ? `Value ${asset.name}` : "Add an asset or liability"}
          </DialogTitle>
          <DialogDescription>
            {asset
              ? "Record a dated valuation. Historical months use the latest value known at that time."
              : "Wallet balances are already included as cash. Add only holdings not included in those balances to avoid double counting."}
          </DialogDescription>
        </DialogHeader>
        <AssetForm asset={asset} today={today} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAssetButton({ asset }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await deleteAssetAction(previous, form);
    if (result.success) setOpen(false);
    return result;
  }, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive"
          aria-label={`Delete asset ${asset.name}`}
          title="Delete asset"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {asset.name}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the holding and every recorded valuation.
            Frozen month-end balances remain visible as a closed holding.
            Wallets and transactions are not deleted.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={asset.id} />
          <Feedback state={state} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting..." : "Delete asset and valuations"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
