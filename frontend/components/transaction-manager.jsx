"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowDown,
  ArrowLeftRight,
  ArrowUpRight,
  Pencil,
  Repeat2,
  Trash2,
  MoreHorizontal,
  Pin,
  PinOff,
  SlidersHorizontal,
} from "lucide-react";
import {
  deleteTransactionAction,
  saveTransactionAction,
  bulkUpdateTransactionsAction,
  bulkDeleteTransactionsAction,
} from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { WalletIcon } from "@/components/wallet-icon";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { categoriesForType } from "@/lib/categories";
import { MoneyAmount } from "@/components/money-amount";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  recurrenceFrequencies,
  transactionMonthLabel,
  transactionTypes,
  transactionDateLabel,
  transactionDisplayAmount,
  transactionTypeLabel,
  adjustmentEffectiveDate,
} from "@/lib/transactions";

export function TransactionForm({
  item,
  wallets,
  categories,
  today,
  defaultDate = today,
  onSaved,
  bulkIds,
}) {
  const prefix = useId();
  const [changed, setChanged] = useState([]);
  const [values, setValues] = useState({
    description: item?.description ?? "",
    amount: item?.amount ?? "",
    date: item?.date ?? defaultDate,
    type: item?.type ?? "expense",
    source_wallet_id: item?.source_wallet_id ?? "",
    destination_wallet_id: item?.destination_wallet_id ?? "",
    category_id: item?.category_id ?? "",
    subcategory_id: item?.subcategory_id ?? "",
    recurrence: item?.recurrence ?? "",
    recurrence_count: item?.recurrence_count?.toString() ?? "",
  });
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await (
      bulkIds ? bulkUpdateTransactionsAction : saveTransactionAction
    )(previous, form);
    if (result.success) onSaved?.(form.get("date"));
    return result;
  }, {});
  const availableCategories =
    bulkIds && !changed.includes("type")
      ? categories
      : categoriesForType(categories, values.type);
  const categoryKind = values.type === "income" ? "income" : "expense";
  const children =
    availableCategories.find((category) => category.id === values.category_id)
      ?.subcategories ?? [];
  function change(event) {
    const { name, value } = event.target;
    setValues((current) => ({
      ...current,
      [name]: value,
      ...(name === "category_id" ? { subcategory_id: "" } : {}),
      ...(name === "type" ? { category_id: "", subcategory_id: "" } : {}),
      ...(name === "type" && value === "balance_adjustment"
        ? { recurrence: "", recurrence_count: "" }
        : {}),
      ...(name === "type" && value !== "transfer"
        ? { destination_wallet_id: "" }
        : {}),
      ...(name === "source_wallet_id" && value === current.destination_wallet_id
        ? { destination_wallet_id: "" }
        : {}),
      ...(name === "recurrence" && value === ""
        ? { recurrence_count: "" }
        : {}),
    }));
  }
  const field = (name, label, children) =>
    bulkIds ? (
      <div className="space-y-2">
        <Label
          htmlFor={`${prefix}-change-${name}`}
          className="min-h-11 cursor-pointer"
        >
          <Checkbox
            id={`${prefix}-change-${name}`}
            name="fields"
            value={name}
            checked={changed.includes(name)}
            disabled={pending}
            onCheckedChange={(checked) =>
              setChanged((current) =>
                checked
                  ? [...current, name]
                  : current.filter((field) => field !== name),
              )
            }
          />
          Change {label.toLowerCase()}
        </Label>
        <fieldset disabled={pending || !changed.includes(name)}>
          {children}
        </fieldset>
      </div>
    ) : (
      children
    );
  const input = (name, label, props = {}) =>
    field(
      name,
      label,
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
        <Input
          id={`${prefix}-${name}`}
          name={name}
          value={values[name]}
          onChange={change}
          {...props}
        />
      </div>,
    );
  const select = (name, label, options, placeholder, required = false) =>
    field(
      name,
      label,
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
        <NativeSelect
          id={`${prefix}-${name}`}
          name={name}
          value={values[name]}
          onChange={change}
          required={required}
          aria-describedby={
            name === "category_id" ? `${prefix}-category-hint` : undefined
          }
        >
          {placeholder && (
            <NativeSelectOption value="">{placeholder}</NativeSelectOption>
          )}
          {options.map(({ id, name: optionName }) => (
            <NativeSelectOption key={id} value={id}>
              {optionName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>,
    );
  return (
    <form
      action={action}
      aria-label={
        bulkIds
          ? "Edit selected transactions"
          : item
            ? `Edit transaction ${item.description || "Untitled transaction"}`
            : "Add transaction"
      }
      onResetCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="space-y-4"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      {bulkIds?.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      {bulkIds && (
        <p className="text-sm text-muted-foreground">
          Only checked fields change. Changes affect each entire series,
          including other pages and past occurrences. Every selected series must
          accept the changes or nothing is saved. Changing a main category
          clears the old subcategory unless you choose a replacement.
        </p>
      )}
      {item?.recurrence && (
        <p className="text-sm text-muted-foreground">
          Changes apply to the entire recurring series, including past
          occurrences. Date is the original start date.
        </p>
      )}
      {input("description", "Description", {
        maxLength: 500,
        placeholder: "Optional description",
      })}
      <div className="grid gap-4 sm:grid-cols-2">
        {input("amount", "Amount", {
          required: true,
          inputMode: ["expense", "balance_adjustment"].includes(values.type)
            ? "text"
            : "decimal",
          placeholder: "12.50",
        })}
        {input("date", "Date", {
          required: true,
          type: "date",
          min: "0001-01-01",
          max: "9999-12-31",
        })}
        {select(
          "type",
          "Type",
          transactionTypes.map((type) => ({
            id: type,
            name: transactionTypeLabel(type),
          })),
          null,
          true,
        )}
        {select(
          "source_wallet_id",
          values.type === "income" ? "Receiving wallet" : "Source wallet",
          wallets,
          "Choose a wallet",
          true,
        )}
        {(values.type === "transfer" || bulkIds) &&
          select(
            "destination_wallet_id",
            "Destination wallet",
            wallets.filter((wallet) => wallet.id !== values.source_wallet_id),
            "Choose a destination",
            !bulkIds,
          )}
        {values.type !== "balance_adjustment" && (
          <div className="space-y-2">
            {select(
              "category_id",
              "Main category",
              bulkIds
                ? availableCategories.map((category) => ({
                    ...category,
                    name: `${category.name} (${category.kind})`,
                  }))
                : availableCategories,
              bulkIds
                ? "Choose a category"
                : `Choose an ${categoryKind} category`,
              true,
            )}
            <p
              id={`${prefix}-category-hint`}
              className="text-sm text-muted-foreground"
            >
              {bulkIds && !changed.includes("type") ? (
                "The category family must match every selected transaction."
              ) : availableCategories.length ? (
                `Only ${categoryKind} categories are shown.`
              ) : (
                <>
                  No {categoryKind} categories yet.{" "}
                  <Link
                    href={`/categories?kind=${categoryKind}#${categoryKind}-categories`}
                    className="underline underline-offset-4"
                  >
                    Create a category or browse presets
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        )}
        {values.type !== "balance_adjustment" &&
          select("subcategory_id", "Subcategory", children, "No subcategory")}
        {values.type !== "balance_adjustment" &&
          select(
            "recurrence",
            "Repeat",
            recurrenceFrequencies.map((frequency) => ({
              id: frequency,
              name: frequency,
            })),
            "Does not repeat",
          )}
        {values.type !== "balance_adjustment" &&
          (values.recurrence || bulkIds) &&
          input(
            "recurrence_count",
            "Total occurrences (blank for indefinitely)",
            { type: "number", min: 1, max: 10000, step: 1 },
          )}
      </div>
      {values.type === "balance_adjustment" && (
        <>
          <input type="hidden" name="category_id" value="" />
          <input type="hidden" name="subcategory_id" value="" />
          <input type="hidden" name="recurrence" value="" />
          <input type="hidden" name="recurrence_count" value="" />
          <p className="text-sm text-muted-foreground">
            A signed reconciliation only: positive increases and negative
            decreases the following month&apos;s starting balance. It is
            excluded from income, expenses and cash flow. No category or
            recurrence applies. Frozen closes never change; use a new adjustment
            to reconcile a later opening.
          </p>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Expenses may be negative (refunds), but never zero. Income and transfers
        must be positive. Balance adjustments can be positive or negative and
        take effect on the first day of the following month.
      </p>
      {values.source_wallet_id && (
        <p className="text-sm text-muted-foreground">
          Amounts use{" "}
          {
            wallets.find((wallet) => wallet.id === values.source_wallet_id)
              ?.currency
          }
          . Transfers require wallets with the same currency; no currency
          conversion is performed.
        </p>
      )}
      {values.recurrence && (
        <p className="text-sm text-muted-foreground">
          The total includes the first occurrence. Monthly/yearly repeats keep
          the original day, or the last day of shorter months. Only occurrences
          due through today are listed.
        </p>
      )}
      <Feedback state={state} />
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          disabled={pending || (bulkIds && !changed.length)}
        >
          {pending
            ? "Saving..."
            : bulkIds
              ? "Save selected transactions"
              : item
                ? "Save changes"
                : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}

function DeleteTransaction({ item, ids, onDeleted }) {
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await (
      ids ? bulkDeleteTransactionsAction : deleteTransactionAction
    )(previous, form);
    if (result.success) onDeleted();
    return result;
  }, {});
  return (
    <form
      action={action}
      aria-label={
        ids
          ? "Delete selected transactions"
          : `Delete transaction ${item.description || "Untitled transaction"}`
      }
      className="space-y-2"
    >
      {ids ? (
        ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)
      ) : (
        <input type="hidden" name="id" value={item.id} />
      )}
      <Feedback state={state} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending
            ? "Deleting..."
            : ids
              ? "Delete selected transactions"
              : item.recurrence
                ? "Delete series"
                : "Delete transaction"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function TransactionEntry({
  item,
  wallets,
  categories,
  today,
  onSaved,
  showMonths,
  selected,
  onSelect,
  onPin,
  pending,
}) {
  const description = item.description || "Untitled transaction";
  const Heading = showMonths || item.is_pinned ? "h4" : "h3";
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const actionTrigger = useRef(null);
  const selectionId = useId();
  const wallet = wallets.find((wallet) => wallet.id === item.source_wallet_id);
  const display = transactionDisplayAmount(item);
  function restoreFocus(event) {
    event.preventDefault();
    if (actionTrigger.current?.isConnected) actionTrigger.current.focus();
    else document.getElementById("transactions-heading")?.focus();
  }
  const Icon =
    item.type === "balance_adjustment"
      ? SlidersHorizontal
      : item.type === "income"
        ? ArrowDownLeft
        : item.type === "expense"
          ? ArrowUpRight
          : ArrowLeftRight;
  return (
    <TableRow
      className="group text-foreground"
      data-transaction-id={item.id}
      data-state={selected ? "selected" : undefined}
    >
      <TableCell className="p-1">
        <Label
          htmlFor={selectionId}
          className="flex min-h-11 min-w-11 cursor-pointer justify-center"
        >
          <Checkbox
            id={selectionId}
            checked={selected}
            disabled={pending}
            onCheckedChange={onSelect}
            aria-label={`Select transaction ${description} on ${item.occurrence_date}`}
          />
        </Label>
      </TableCell>
      <TableCell className="px-3 py-3 whitespace-normal [overflow-wrap:anywhere]">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <WalletIcon
              icon={wallet.icon}
              colour={wallet.colour}
              imageUrl={wallet.icon_image_url}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{item.source_wallet_name}</p>
            {item.destination_wallet_name && (
              <p className="text-xs text-muted-foreground">
                to {item.destination_wallet_name}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="space-y-1 px-3 py-3 whitespace-normal [overflow-wrap:anywhere]">
        <Heading className="flex items-center gap-1.5 font-medium">
          {item.is_pinned && (
            <span>
              <Pin aria-hidden="true" className="size-3.5 text-primary-ink" />
              <span className="sr-only">Pinned: </span>
            </span>
          )}
          {description}
        </Heading>
        <p className="text-xs text-muted-foreground">
          {item.type === "balance_adjustment"
            ? `Opening balance adjustment, effective ${adjustmentEffectiveDate(item.date)}`
            : item.category_name}
          {item.subcategory_name && ` / ${item.subcategory_name}`}
        </p>
        <Badge
          variant="secondary"
          className={`gap-1.5 capitalize ${
            {
              income: "bg-income text-income-foreground",
              expense: "bg-expense text-expense-foreground",
              transfer: "bg-transfer text-transfer-foreground",
              balance_adjustment: "bg-muted text-muted-foreground",
            }[item.type]
          }`}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {transactionTypeLabel(item.type)}
        </Badge>
        {item.recurrence && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Repeat2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Repeats {item.recurrence}; occurrence {item.occurrence_number}
              {item.recurrence_count
                ? ` of ${item.recurrence_count}`
                : ", indefinitely"}
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className="px-3 py-3 text-muted-foreground">
        <time
          dateTime={item.occurrence_date}
          title={item.occurrence_date}
          className="text-xs tabular-nums"
        >
          {transactionDateLabel(item.occurrence_date, today)}
        </time>
      </TableCell>
      <TableCell
        className={`px-3 py-3 text-right font-semibold whitespace-normal tabular-nums [overflow-wrap:anywhere] ${display.positive ? "text-primary-ink" : ""}`}
      >
        <span className="sr-only">
          Amount ({transactionTypeLabel(item.type)}){" "}
        </span>
        <span>{display.sign}</span>
        <MoneyAmount amount={display.amount} currency={item.currency} />
      </TableCell>
      <TableCell className="sticky right-0 bg-card px-2 py-2 shadow-[-1px_0_0_var(--border)] group-hover:bg-muted group-data-[state=selected]:bg-muted">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={actionTrigger}
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Actions for transaction ${description} on ${item.occurrence_date}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-52"
            onCloseAutoFocus={(event) => {
              if (editing || deleting) event.preventDefault();
            }}
          >
            <DropdownMenuItem
              onSelect={() => setEditing(true)}
              aria-label={`${item.recurrence ? "Edit recurring series" : "Edit transaction"} ${description}`}
            >
              <Pencil aria-hidden="true" />{" "}
              {item.recurrence ? "Edit recurring series" : "Edit transaction"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onPin(item.id, !item.is_pinned)}>
              {item.is_pinned ? (
                <PinOff aria-hidden="true" />
              ) : (
                <Pin aria-hidden="true" />
              )}
              {item.is_pinned ? "Unpin transaction" : "Pin transaction"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleting(true)}
              aria-label={`Delete ${item.recurrence ? "recurring series" : "transaction"} ${description}`}
            >
              <Trash2 aria-hidden="true" />{" "}
              {item.recurrence
                ? "Delete recurring series"
                : "Delete transaction"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
            onCloseAutoFocus={restoreFocus}
          >
            <DialogHeader>
              <DialogTitle>
                {item.recurrence ? "Edit recurring series" : "Edit transaction"}
              </DialogTitle>
              <DialogDescription>
                {item.recurrence
                  ? "Changes apply to every occurrence in this series, including history."
                  : "Update the details of this transaction."}
              </DialogDescription>
            </DialogHeader>
            <TransactionForm
              key={JSON.stringify(item)}
              item={item}
              wallets={wallets}
              categories={categories}
              today={today}
              onSaved={() => {
                setEditing(false);
                onSaved("Transaction saved.");
              }}
            />
          </DialogContent>
        </Dialog>
        <AlertDialog open={deleting} onOpenChange={setDeleting}>
          <AlertDialogContent
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onCloseAutoFocus={restoreFocus}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {item.recurrence
                  ? "Delete recurring series?"
                  : "Delete transaction?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="[overflow-wrap:anywhere]">
                {item.recurrence
                  ? `This deletes the entire recurring series "${description}", including all past occurrences.`
                  : `The transaction "${description}" will be permanently deleted.`}{" "}
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <DeleteTransaction
              item={item}
              onDeleted={() => {
                setDeleting(false);
                onSaved({ success: "Transaction deleted." });
              }}
            />
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

export function TransactionList({
  transactions,
  wallets,
  categories,
  today,
  showMonths = true,
}) {
  const [notice, setNotice] = useState({});
  const [selection, setSelection] = useState([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const ids = [...new Set(transactions.map((item) => item.id))];
  const selectedIds = ids.filter((id) => selection.includes(id));
  const allSelected = selectedIds.length === ids.length;
  const selectAllId = useId();
  const bulkEditTrigger = useRef(null);
  const bulkDeleteTrigger = useRef(null);
  function toggle(id) {
    setSelection((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }
  function saved(result) {
    setNotice(typeof result === "string" ? { success: result } : result);
  }
  function pin(ids, value) {
    const form = new FormData();
    ids.forEach((id) => form.append("ids", id));
    form.set("fields", "is_pinned");
    form.set("is_pinned", String(value));
    startTransition(async () => {
      const result = await bulkUpdateTransactionsAction({}, form);
      setNotice(
        result.error
          ? result
          : {
              success: value
                ? "Transactions pinned."
                : "Transactions unpinned.",
            },
      );
    });
  }
  const months = new Map();
  for (const item of transactions) {
    const month = item.is_pinned ? "pinned" : item.occurrence_date.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(item);
  }
  return (
    <div className="space-y-4">
      <Feedback state={notice} />
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
        aria-label="Transaction selection"
      >
        <Label htmlFor={selectAllId} className="min-h-11 cursor-pointer">
          <Checkbox
            id={selectAllId}
            disabled={pending}
            checked={
              allSelected ? true : selectedIds.length ? "indeterminate" : false
            }
            onCheckedChange={() => setSelection(allSelected ? [] : ids)}
          />
          Select all on this page
        </Label>
        <span
          role="status"
          aria-label="Transaction selection count"
          className="mr-auto text-xs text-muted-foreground"
        >
          {selectedIds.length} series selected
        </span>
        {selectedIds.length > 0 && (
          <>
            <Button
              ref={bulkEditTrigger}
              variant="outline"
              disabled={pending}
              onClick={() => setBulkEditing(true)}
            >
              <Pencil aria-hidden="true" /> Edit selected
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => pin(selectedIds, true)}
            >
              <Pin aria-hidden="true" /> Pin selected
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => pin(selectedIds, false)}
            >
              <PinOff aria-hidden="true" /> Unpin selected
            </Button>
            <Button
              ref={bulkDeleteTrigger}
              variant="destructive"
              disabled={pending}
              onClick={() => setBulkDeleting(true)}
            >
              <Trash2 aria-hidden="true" /> Delete selected
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setSelection([])}
            >
              Clear selection
            </Button>
          </>
        )}
      </div>
      <Dialog open={bulkEditing} onOpenChange={setBulkEditing}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (bulkEditTrigger.current?.isConnected)
              bulkEditTrigger.current.focus();
            else document.getElementById("transactions-heading")?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit selected transactions</DialogTitle>
            <DialogDescription>
              Apply checked fields to {selectedIds.length} selected series in
              one atomic save. Unchecked fields stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            key={selectedIds.join(",")}
            bulkIds={selectedIds}
            wallets={wallets}
            categories={categories}
            today={today}
            onSaved={() => {
              setBulkEditing(false);
              setSelection([]);
              setNotice({ success: "Selected transactions saved." });
            }}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={bulkDeleting} onOpenChange={setBulkDeleting}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (bulkDeleteTrigger.current?.isConnected)
              bulkDeleteTrigger.current.focus();
            else document.getElementById("transactions-heading")?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {selectedIds.length} selected series,
              including every past and future occurrence. No other transactions
              are deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DeleteTransaction
            ids={selectedIds}
            onDeleted={() => {
              setBulkDeleting(false);
              setSelection([]);
              setNotice({ success: "Selected transactions deleted." });
            }}
          />
        </AlertDialogContent>
      </AlertDialog>
      <p className="text-xs text-muted-foreground">
        Pinned series first, then newest dates. Selection is limited to this
        page; selecting an occurrence selects its whole series. Bulk changes and
        deletion affect all occurrences, including those on other pages. Scroll
        horizontally on smaller screens.
      </p>
      {[...months].map(([month, entries]) => {
        const label =
          month === "pinned" ? "Pinned" : transactionMonthLabel(month);
        return (
          <section
            key={month}
            aria-label={`${label} transactions`}
            className="space-y-3"
          >
            {(showMonths || month === "pinned") && (
              <h3 className="font-semibold">{label}</h3>
            )}
            <div
              role="region"
              aria-label={`${label} table, scroll horizontally`}
              tabIndex={0}
              className="overflow-x-auto rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>[data-slot=table-container]]:overflow-visible"
            >
              <Table
                className="min-w-[808px] table-fixed"
                aria-label={`Transactions for ${label}`}
              >
                <TableCaption className="sr-only">
                  {label} transactions on this page, ordered by date descending.
                </TableCaption>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead scope="col" className="w-14 px-1">
                      <Label
                        htmlFor={`${selectAllId}-${month}`}
                        className="flex min-h-11 min-w-11 cursor-pointer justify-center"
                      >
                        <Checkbox
                          id={`${selectAllId}-${month}`}
                          aria-label={`Select all transactions on this page (${label})`}
                          disabled={pending}
                          checked={
                            allSelected
                              ? true
                              : selectedIds.length
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={() =>
                            setSelection(allSelected ? [] : ids)
                          }
                        />
                      </Label>
                    </TableHead>
                    <TableHead scope="col" className="w-40 px-3">
                      Wallet
                    </TableHead>
                    <TableHead scope="col" className="w-60 px-3">
                      Description and categories
                    </TableHead>
                    <TableHead
                      scope="col"
                      aria-sort="descending"
                      className="w-28 px-3"
                    >
                      <span className="flex items-center gap-1.5">
                        Date{" "}
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      </span>
                    </TableHead>
                    <TableHead scope="col" className="w-44 px-3 text-right">
                      Amount
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="sticky right-0 z-10 w-16 bg-muted px-2 text-center shadow-[-1px_0_0_var(--border)]"
                    >
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((item) => (
                    <TransactionEntry
                      key={`${item.id}-${item.occurrence_number}`}
                      item={item}
                      wallets={wallets}
                      categories={categories}
                      today={today}
                      onSaved={saved}
                      showMonths={showMonths}
                      selected={selectedIds.includes(item.id)}
                      onSelect={() => toggle(item.id)}
                      onPin={(id, value) => pin([id], value)}
                      pending={pending}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
