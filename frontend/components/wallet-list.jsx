"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteWalletAction } from "@/app/(app)/wallets/actions";
import { Feedback } from "@/components/feedback";
import { WalletForm } from "@/components/wallet-form";
import { WalletIcon } from "@/components/wallet-icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function DeleteWallet({ wallet, onDeleted }) {
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await deleteWalletAction(previous, form);
    if (result.success) onDeleted();
    return result;
  }, {});
  return (
    <form action={action} aria-label={`Delete wallet ${wallet.name}`}>
      <input type="hidden" name="id" value={wallet.id} />
      <Feedback state={state} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Deleting..." : "Delete wallet"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function WalletRow({ wallet, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteTrigger = useRef(null);
  return (
    <TableRow className="group text-foreground">
      <TableCell className="px-4 py-4 whitespace-normal [overflow-wrap:anywhere]">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <WalletIcon
              icon={wallet.icon}
              colour={wallet.colour}
              imageUrl={wallet.icon_image_url}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{wallet.name}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {wallet.type}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-4 font-medium">{wallet.currency}</TableCell>
      <TableCell className="px-4 py-4 text-right whitespace-normal tabular-nums [overflow-wrap:anywhere]">
        {wallet.initial_amount}
      </TableCell>
      <TableCell className="px-4 py-4 text-right font-semibold whitespace-normal tabular-nums [overflow-wrap:anywhere]">
        {wallet.current_amount}
      </TableCell>
      <TableCell className="sticky right-0 bg-card px-2 py-2 shadow-[-1px_0_0_var(--border)] group-hover:bg-muted">
        <div className="flex gap-1">
          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit wallet ${wallet.name}`}
              >
                <Pencil aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit wallet</DialogTitle>
                <DialogDescription>
                  Update its appearance, currency, or starting amount. Changing
                  the starting amount recalculates its balance.
                </DialogDescription>
              </DialogHeader>
              <WalletForm
                key={JSON.stringify(wallet)}
                wallet={wallet}
                onSaved={() => {
                  setEditing(false);
                  onSaved("Wallet updated.");
                }}
              />
            </DialogContent>
          </Dialog>
          <AlertDialog open={deleting} onOpenChange={setDeleting}>
            <AlertDialogTrigger asChild>
              <Button
                ref={deleteTrigger}
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Delete wallet ${wallet.name}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                if (!deleteTrigger.current?.isConnected) {
                  event.preventDefault();
                  document.getElementById("wallets-heading")?.focus();
                }
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Delete wallet?</AlertDialogTitle>
                <AlertDialogDescription className="[overflow-wrap:anywhere]">
                  Permanently delete &quot;{wallet.name}&quot;? Wallets used by
                  transactions cannot be deleted. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <DeleteWallet
                wallet={wallet}
                onDeleted={() => {
                  setDeleting(false);
                  onDeleted();
                }}
              />
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function WalletList({ wallets, page = 1 }) {
  const [notice, setNotice] = useState("");
  const router = useRouter();
  return (
    <div className="space-y-3">
      {notice && <Feedback state={{ success: notice }} />}
      {!wallets.length ? (
        <Empty className="min-h-72 border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No wallets yet</EmptyTitle>
            <EmptyDescription>
              Start with your bank account, cash, or savings. Use Add wallet to
              create your first wallet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Balances through {wallets[0].balance_as_of} (UTC). Scroll
            horizontally on smaller screens; actions stay visible.
          </p>
          <div
            role="region"
            aria-label="Wallet table, scroll horizontally"
            tabIndex={0}
            className="overflow-x-auto rounded-lg border bg-card focus-visible:outline-2 focus-visible:outline-ring [&>[data-slot=table-container]]:overflow-visible"
          >
            <Table className="min-w-[760px] table-fixed">
              <TableCaption className="sr-only">
                Your wallets and exact balances
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%] px-4">Wallet</TableHead>
                  <TableHead className="w-[12%] px-4">Currency</TableHead>
                  <TableHead className="w-[22%] px-4 text-right">
                    Initial amount
                  </TableHead>
                  <TableHead className="w-[22%] px-4 text-right">
                    Current amount
                  </TableHead>
                  <TableHead className="sticky right-0 w-[104px] bg-card px-2">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((wallet) => (
                  <WalletRow
                    key={wallet.id}
                    wallet={wallet}
                    onSaved={setNotice}
                    onDeleted={() => {
                      setNotice("Wallet deleted.");
                      if (wallets.length === 1 && page > 1)
                        router.replace(`/wallets?page=${page - 1}`);
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
