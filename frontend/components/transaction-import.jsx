"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import {
  uploadCSVAction,
  validateCSVAction,
  confirmCSVAction,
} from "@/app/(app)/transactions/actions";
import { importFields, mappedValue } from "@/lib/transaction-imports";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

function ValueControl({
  field,
  wallets,
  categories,
  category,
  blankLabel = "No fallback",
  ...props
}) {
  let options;
  if (field.endsWith("wallet_id")) options = wallets;
  if (field === "category_id") options = categories;
  if (field === "subcategory_id")
    options =
      categories.find((item) => item.id === category)?.subcategories ?? [];
  if (field === "type")
    options = ["income", "expense", "transfer"].map((value) => ({
      id: value,
      name: value,
    }));
  if (field === "recurrence")
    options = ["weekly", "monthly", "annually"].map((value) => ({
      id: value,
      name: value,
    }));
  return options ? (
    <NativeSelect {...props}>
      <NativeSelectOption value="">{blankLabel}</NativeSelectOption>
      {options.map(({ id, name }) => (
        <NativeSelectOption key={id} value={id}>
          {name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  ) : (
    <Input
      {...props}
      type={field === "date" ? "date" : "text"}
      maxLength={field === "description" ? 500 : 1000}
    />
  );
}

function ImportWizard({ wallets, categories, onComplete, onDiscard, onBusy }) {
  const [data, setData] = useState(null);
  const [report, setReport] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [step, setStep] = useState("upload");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [page, setPage] = useState(1);
  const focusRef = useRef(null);
  const busyRef = useRef(false);
  const confirmationRef = useRef(false);
  const selected = data?.rows.filter((row) => row.included).length ?? 0;

  function change(next) {
    setData({
      ...next,
      approved_creations: [],
      import_id: crypto.randomUUID(),
    });
    setReviewed(false);
    setError("");
  }
  function perform(operation) {
    if (busyRef.current) return;
    busyRef.current = true;
    onBusy(true);
    startTransition(async () => {
      try {
        await operation();
      } finally {
        busyRef.current = false;
        onBusy(confirmationRef.current);
        requestAnimationFrame(() => focusRef.current?.focus());
      }
    });
  }
  function showReport(validation) {
    setReport(validation);
    setReviewed(true);
    setStep(validation.creations_approved ? "review" : "references");
    setPage(1);
  }
  function validate(next = data) {
    perform(async () => {
      const result = await validateCSVAction(next);
      setError(result.error ?? "");
      if (result.validation) {
        showReport(result.validation);
      }
    });
  }
  function confirm() {
    setSent(true);
    confirmationRef.current = true;
    perform(async () => {
      const result = await confirmCSVAction(data);
      if (result.imported) {
        confirmationRef.current = false;
        onComplete(result.imported);
      } else {
        setError(result.error);
        if ([401, 413, 415, 422].includes(result.status)) {
          if (result.validation) showReport(result.validation);
          setSent(false);
          confirmationRef.current = false;
          setReviewed(Boolean(result.validation));
        }
      }
    });
  }
  const invalid =
    report?.rows.filter(
      (row) =>
        data.rows[row.number - 2].included && Object.keys(row.errors).length,
    ).length ?? 0;
  return (
    <div className="space-y-5">
      <p
        ref={focusRef}
        tabIndex={-1}
        className="font-medium outline-none"
        aria-live="polite"
      >
        {step === "upload"
          ? "1. Upload CSV"
          : step === "map"
            ? "2. Map columns"
            : step === "references"
              ? "3. Approve missing records"
              : "4. Review and confirm"}
      </p>
      <Feedback state={{ error }} />
      {step === "upload" ? (
        <form
          aria-label="Upload transaction CSV"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            perform(async () => {
              const result = await uploadCSVAction(form);
              setError(result.error ?? "");
              if (result.document) {
                setData({
                  ...result.document,
                  defaults: {},
                  import_id: crypto.randomUUID(),
                });
                setStep("map");
              }
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="transaction-csv">CSV file</Label>
            <Input
              id="transaction-csv"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              disabled={pending}
            />
            <p className="text-sm text-muted-foreground">
              UTF-8, up to 512 KiB, 500 data rows and 32 columns. Include column
              headers. Quoted values and comma, semicolon, or tab separators are
              supported.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="csv-delimiter">Delimiter</Label>
            <NativeSelect
              id="csv-delimiter"
              name="delimiter"
              disabled={pending}
            >
              <NativeSelectOption value="auto">
                Detect automatically
              </NativeSelectOption>
              <NativeSelectOption value=",">Comma</NativeSelectOption>
              <NativeSelectOption value=";">Semicolon</NativeSelectOption>
              <NativeSelectOption value={"\t"}>Tab</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button disabled={pending} type="submit">
            {pending ? "Loading..." : "Load CSV"}
          </Button>
        </form>
      ) : step === "map" ? (
        <>
          <p className="text-sm text-muted-foreground">
            Review automatic matches. Required fields are marked *. Fallback
            values apply only to unmapped or blank cells. Names must uniquely
            match existing records or be approved for creation. UUIDs also work.
            Currency markers and dates are normalized without converting
            currencies. Income, expenses and transfers require a main category.
            Balance Adjustment rows use type balance_adjustment and must leave
            categories, destination and recurrence blank.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="import-decimal">Decimal separator</Label>
              <NativeSelect
                id="import-decimal"
                value={data.decimal_separator ?? "auto"}
                disabled={pending}
                onChange={(event) =>
                  change({ ...data, decimal_separator: event.target.value })
                }
              >
                <NativeSelectOption value="auto">
                  Automatic (single . or , is decimal)
                </NativeSelectOption>
                <NativeSelectOption value="dot">
                  Dot decimal: 1,234.56
                </NativeSelectOption>
                <NativeSelectOption value="comma">
                  Comma decimal: 1.234,56
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-date-order">CSV date order</Label>
              <NativeSelect
                id="import-date-order"
                value={data.date_order ?? "auto"}
                disabled={pending}
                onChange={(event) =>
                  change({ ...data, date_order: event.target.value })
                }
              >
                <NativeSelectOption value="auto">
                  Detect from unambiguous dates
                </NativeSelectOption>
                <NativeSelectOption value="day-first">
                  Day first: DD/MM/YYYY
                </NativeSelectOption>
                <NativeSelectOption value="month-first">
                  Month first: MM/DD/YYYY
                </NativeSelectOption>
                <NativeSelectOption value="year-first">
                  Year first: YYYY/MM/DD
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <fieldset disabled={pending} className="space-y-4">
            {importFields.map(([field, label, required]) => (
              <div
                key={field}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label htmlFor={`map-${field}`}>
                    {label}
                    {required ? " *" : ""}
                  </Label>
                  <NativeSelect
                    id={`map-${field}`}
                    value={data.mapping[field] ?? ""}
                    onChange={(event) =>
                      change({
                        ...data,
                        mapping: {
                          ...data.mapping,
                          [field]:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        },
                      })
                    }
                  >
                    <NativeSelectOption value="">Not mapped</NativeSelectOption>
                    {data.headers.map((header, index) => (
                      <NativeSelectOption key={index} value={index}>
                        {index + 1}. {header || "(empty header)"}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {data.mapping[field] !== null &&
                    data.mapping[field] !== undefined && (
                      <p className="text-xs break-all text-muted-foreground">
                        Example:{" "}
                        {data.rows[0].values[data.mapping[field]] || "(blank)"}
                      </p>
                    )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`default-${field}`}>
                    Fallback {label.toLowerCase()}
                  </Label>
                  <ValueControl
                    id={`default-${field}`}
                    field={field}
                    wallets={wallets}
                    categories={categories}
                    category={data.defaults.category_id}
                    value={data.defaults[field] ?? ""}
                    onChange={(event) =>
                      change({
                        ...data,
                        defaults: {
                          ...data.defaults,
                          [field]: event.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </fieldset>
          <Button disabled={pending} onClick={() => validate()}>
            {pending ? "Validating..." : "Validate and review"}
          </Button>
        </>
      ) : step === "references" ? (
        <>
          <p className="text-sm text-muted-foreground">
            The selected rows reference these missing records. Approve this
            recap before reviewing transactions. They will be created only with
            the final import; discarding now or during review creates nothing.
          </p>
          <div
            role="region"
            aria-label="Missing records to create"
            className="space-y-3"
          >
            {report.creations.map((item) => (
              <article
                key={item.id}
                className="space-y-1 break-words rounded-lg border p-4"
              >
                <h3 className="font-medium">
                  {item.kind === "category"
                    ? "Main category"
                    : item.kind === "subcategory"
                      ? "Subcategory"
                      : "Wallet"}
                  : {item.name}
                </h3>
                {item.category_kind && (
                  <p className="text-sm capitalize">
                    Category family: {item.category_kind}
                  </p>
                )}
                {item.parent_name && (
                  <p className="text-sm">
                    Under main category: {item.parent_name}
                  </p>
                )}
                {item.preset_key && (
                  <p className="text-sm">
                    Matches predefined group: {item.name} ({item.preset_key}).
                    Only referenced records will be created.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Icon: {item.icon}. Colour: {item.colour}.
                  {item.kind === "wallet" &&
                    " Initial amount: 0. Currency: EUR."}
                </p>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setStep("map")}
            >
              Back to mapping
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                const next = {
                  ...data,
                  approved_creations: report.creations.map((item) => item.id),
                  import_id: crypto.randomUUID(),
                };
                setData(next);
                validate(next);
              }}
            >
              {pending
                ? "Validating..."
                : "Approve records and review transactions"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p role="status">
            {selected} of {data.rows.length} rows selected. {invalid} selected
            rows have errors.{" "}
            {!reviewed && "Validate changes before confirmation."}
          </p>
          {sent && error && (
            <p role="alert" className="text-sm">
              Confirmation was sent and its outcome is unconfirmed. Retry
              without changing the data to retrieve the result safely; do not
              start another import.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending || sent}
              onClick={() => setStep("map")}
            >
              Back to mapping
            </Button>
            <Button
              variant="outline"
              disabled={pending || sent}
              onClick={() =>
                change({
                  ...data,
                  rows: data.rows.map((row) => ({ ...row, included: true })),
                })
              }
            >
              Include all rows
            </Button>
            <Button
              variant="outline"
              disabled={pending || sent}
              onClick={() =>
                change({
                  ...data,
                  rows: data.rows.map((row) => ({ ...row, included: false })),
                })
              }
            >
              Discard all rows
            </Button>
          </div>
          <div className="space-y-3" role="region" aria-label="CSV rows">
            {data.rows.slice((page - 1) * 20, page * 20).map((row) => {
              const result = report.rows[row.number - 2];
              return (
                <article
                  key={row.number}
                  aria-label={`CSV row ${row.number}`}
                  className={`space-y-3 rounded-lg border p-4 ${row.included ? "" : "bg-muted/50"}`}
                >
                  <label className="flex min-h-11 items-center gap-3 font-medium">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={row.included}
                      disabled={pending || sent}
                      onChange={(event) =>
                        change({
                          ...data,
                          rows: data.rows.map((item) =>
                            item.number === row.number
                              ? { ...item, included: event.target.checked }
                              : item,
                          ),
                        })
                      }
                    />
                    Include row {row.number}
                    {!row.included && " (discarded)"}
                  </label>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {importFields
                      .filter(([field]) => mappedValue(data, row, field))
                      .map(([field, label]) => (
                        <div key={field} className="min-w-0">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="break-all">
                            {(reviewed
                              ? result.normalized[field]
                              : undefined) ?? mappedValue(data, row, field)}
                            {reviewed &&
                              result.normalized[field] !== undefined &&
                              result.normalized[field] !==
                                mappedValue(data, row, field) && (
                                <span className="block text-xs text-muted-foreground">
                                  CSV: {mappedValue(data, row, field)}
                                </span>
                              )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {reviewed && result.currency && (
                    <p className="text-xs text-muted-foreground">
                      Currency marker recognized: {result.currency}. No currency
                      conversion or currency storage.
                    </p>
                  )}
                  {Object.keys(result.errors).length > 0 && (
                    <div
                      role={row.included ? "alert" : undefined}
                      className="space-y-1 text-sm text-destructive"
                    >
                      {Object.entries(result.errors).map(([field, message]) => (
                        <p key={field} id={`error-${row.number}-${field}`}>
                          <a
                            href={`#edit-${row.number}-${field === "_row" ? "description" : field}`}
                            className="underline"
                            onClick={(event) => {
                              event.preventDefault();
                              event.currentTarget
                                .closest("article")
                                .querySelector("details").open = true;
                              document
                                .getElementById(
                                  `override-${row.number}-${field === "_row" ? "description" : field}`,
                                )
                                ?.focus();
                            }}
                          >
                            {importFields.find(
                              ([name]) => name === field,
                            )?.[1] ?? "Row"}
                            : {message}
                          </a>
                        </p>
                      ))}
                    </div>
                  )}
                  {row.values.length !== data.headers.length && (
                    <p className="text-sm">
                      CSV values: {row.values.join(" | ")}
                    </p>
                  )}
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 font-medium">
                      Correct row {row.number}
                    </summary>
                    <fieldset
                      disabled={pending || sent}
                      className="grid gap-3 pt-3 sm:grid-cols-2"
                    >
                      {importFields.map(([field, label]) => (
                        <div key={field} className="space-y-2">
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              id={`override-${row.number}-${field}`}
                              type="checkbox"
                              className="size-5 accent-primary"
                              checked={Object.hasOwn(row.overrides, field)}
                              onChange={(event) =>
                                change({
                                  ...data,
                                  rows: data.rows.map((item) => {
                                    if (item.number !== row.number) return item;
                                    const overrides = { ...item.overrides };
                                    if (event.target.checked)
                                      overrides[field] = "";
                                    else delete overrides[field];
                                    return { ...item, overrides };
                                  }),
                                })
                              }
                            />
                            Override {label.toLowerCase()}
                          </label>
                          <Label htmlFor={`edit-${row.number}-${field}`}>
                            {label} override
                          </Label>
                          <ValueControl
                            id={`edit-${row.number}-${field}`}
                            field={field}
                            wallets={wallets}
                            categories={categories}
                            category={
                              row.overrides.category_id ||
                              result.transaction?.category_id ||
                              data.defaults.category_id
                            }
                            value={row.overrides[field] ?? ""}
                            blankLabel="Leave blank"
                            disabled={!Object.hasOwn(row.overrides, field)}
                            aria-invalid={Boolean(result.errors[field])}
                            aria-describedby={
                              result.errors[field]
                                ? `error-${row.number}-${field}`
                                : undefined
                            }
                            onChange={(event) =>
                              change({
                                ...data,
                                rows: data.rows.map((item) => {
                                  if (item.number !== row.number) return item;
                                  const overrides = { ...item.overrides };
                                  overrides[field] = event.target.value;
                                  return { ...item, overrides };
                                }),
                              })
                            }
                          />
                        </div>
                      ))}
                    </fieldset>
                  </details>
                </article>
              );
            })}
          </div>
          {data.rows.length > 20 && (
            <nav
              aria-label="CSV preview pages"
              className="flex items-center justify-between gap-2"
            >
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous rows
              </Button>
              <span>
                Page {page} of {Math.ceil(data.rows.length / 20)}
              </span>
              <Button
                variant="outline"
                disabled={page * 20 >= data.rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next rows
              </Button>
            </nav>
          )}
          <p className="text-sm text-muted-foreground">
            Nothing has been saved before confirmation. All selected rows must
            be valid; recurring rows create entire series, not individual
            occurrences.
          </p>
          <div className="flex flex-wrap gap-2">
            {!reviewed && (
              <Button disabled={pending || sent} onClick={() => validate()}>
                Validate changes
              </Button>
            )}
            <Button
              disabled={
                pending ||
                !reviewed ||
                !report.creations_approved ||
                invalid > 0 ||
                selected === 0
              }
              onClick={confirm}
            >
              {pending
                ? "Working..."
                : sent
                  ? "Retry confirmation"
                  : `Confirm import of ${selected} ${selected === 1 ? "row" : "rows"}`}
            </Button>
          </div>
        </>
      )}
      <Button variant="outline" disabled={pending || sent} onClick={onDiscard}>
        Discard import
      </Button>
    </div>
  );
}

export function TransactionImport({ wallets, categories }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" aria-label="Import transactions">
            <Upload aria-hidden="true" />
            <span className="hidden sm:inline">Import CSV</span>
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>Import transactions from CSV</DialogTitle>
            <DialogDescription>
              Upload, map, and review your rows before approving an import.
              Discarding before confirmation saves nothing and removes the
              uploaded data.
            </DialogDescription>
          </DialogHeader>
          <ImportWizard
            wallets={wallets}
            categories={categories}
            onBusy={setBusy}
            onDiscard={() => setOpen(false)}
            onComplete={(count) => {
              setOpen(false);
              setSuccess(
                `${count} ${count === 1 ? "transaction" : "transactions"} imported.`,
              );
              router.push("/transactions?month=all", { scroll: false });
            }}
          />
        </DialogContent>
      </Dialog>
      {success && (
        <p
          role="status"
          className="order-last basis-full text-sm text-primary-ink"
        >
          {success}
        </p>
      )}
    </>
  );
}
