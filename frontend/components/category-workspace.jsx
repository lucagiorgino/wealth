"use client";

import { useId, useRef, useState } from "react";
import {
  CheckCircle2,
  FolderTree,
  Library,
  LockKeyhole,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  CategoryEditorContent,
  CategoryTree,
  PresetCategories,
} from "@/components/category-manager";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { categoryKinds, filterCategories } from "@/lib/categories";

function CreateCategory({
  kind,
  onSaved,
  buttonRef,
  variant,
  children = "Create category",
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button ref={buttonRef} variant={variant}>
          <Plus aria-hidden="true" /> {children}
        </Button>
      </DialogTrigger>
      <CategoryEditorContent
        kind={kind}
        onSaved={(message, savedKind) => {
          setOpen(false);
          onSaved(message, savedKind);
        }}
      />
    </Dialog>
  );
}

function PresetLibrary({ presets, kind, onSaved }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" aria-label={`Browse ${kind} presets`}>
          <Library aria-hidden="true" /> Browse presets
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="shrink-0 pr-14">
          <SheetTitle>Predefined categories</SheetTitle>
          <SheetDescription>
            {kind === "income" ? "Income categories. " : "Expense categories. "}
            A starting point, not a requirement. Add only the groups you want.
            Your private copies are fully editable; existing categories are
            never overwritten.
          </SheetDescription>
        </SheetHeader>
        <PresetCategories
          presets={presets}
          onImported={(message) => {
            setOpen(false);
            onSaved(message);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function CategorySection({
  kind,
  categories,
  presets,
  query,
  onSaved,
  clearSearch,
}) {
  const createButton = useRef(null);
  const family = categories.filter((category) => category.kind === kind);
  const visible = filterCategories(family, query);
  const searching = Boolean(query.trim());
  const subcategories = family.reduce(
    (total, category) => total + category.subcategories.length,
    0,
  );
  return (
    <section
      id={`${kind}-categories`}
      aria-labelledby={`${kind}-categories-heading`}
      className="scroll-mt-24 space-y-5 border-t pt-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h2
            id={`${kind}-categories-heading`}
            className="text-xl font-semibold"
          >
            {kind === "income" ? "Income categories" : "Expense categories"}
          </h2>
          <p className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="px-2.5 py-1 font-normal">
              {family.length} main{" "}
              {family.length === 1 ? "category" : "categories"}
            </Badge>
            <Badge variant="outline" className="px-2.5 py-1 font-normal">
              {subcategories}{" "}
              {subcategories === 1 ? "subcategory" : "subcategories"}
            </Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PresetLibrary
            presets={presets.filter((preset) => preset.kind === kind)}
            kind={kind}
            onSaved={onSaved}
          />
          <CreateCategory
            kind={kind}
            onSaved={onSaved}
            buttonRef={createButton}
            variant="outline"
          >
            Create {kind} category
          </CreateCategory>
        </div>
      </div>
      {visible.length ? (
        <CategoryTree
          categories={visible}
          searching={searching}
          onSaved={onSaved}
          fallbackFocusRef={createButton}
        />
      ) : (
        <Empty className="min-h-60 border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {searching ? (
                <Search aria-hidden="true" />
              ) : (
                <FolderTree aria-hidden="true" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {searching
                ? `No matching ${kind} categories`
                : `No ${kind} categories yet`}
            </EmptyTitle>
            <EmptyDescription>
              {searching
                ? "Try another name. Search includes subcategories, too."
                : `Create an ${kind} category or browse the optional presets above. Nothing is added automatically.`}
            </EmptyDescription>
          </EmptyHeader>
          {searching && (
            <EmptyContent>
              <Button variant="outline" onClick={clearSearch}>
                Clear search
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}
    </section>
  );
}

export function CategoryWorkspace({
  categories,
  presets,
  initialKind = "expense",
}) {
  const searchId = useId();
  const searchInput = useRef(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const searching = Boolean(query.trim());
  const visible = filterCategories(categories, query);
  function saved(message) {
    setQuery("");
    setNotice(message);
  }
  function clearSearch() {
    setQuery("");
    searchInput.current?.focus();
  }
  return (
    <>
      <PageHeading
        eyebrow="Your structure"
        title="Categories"
        description="Organize your transactions, your way. Start with a main category and add detail when you need it."
        actions={<CreateCategory kind={initialKind} onSaved={saved} />}
      />
      <p
        role="status"
        className={
          notice
            ? "flex items-center gap-2 rounded-lg border border-primary/20 bg-accent p-3 text-sm text-accent-foreground"
            : "sr-only"
        }
      >
        {notice && (
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
        )}
        {notice}
      </p>
      <section aria-label="Your categories" className="space-y-6">
        <div className="w-full space-y-2 sm:max-w-xs">
          <Label htmlFor={searchId}>Search categories</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
            />
            <Input
              ref={searchInput}
              id={searchId}
              type="search"
              placeholder="Category or subcategory name"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setNotice("");
              }}
              className="pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear category search"
                className="absolute top-0 right-0"
                onClick={clearSearch}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        {searching && (
          <p role="status" className="text-sm text-muted-foreground">
            Showing {visible.length} of {categories.length} main categories
            across both families. Matching trees are expanded.
          </p>
        )}
        {categoryKinds.map((kind) => (
          <CategorySection
            key={kind}
            kind={kind}
            categories={categories}
            presets={presets}
            query={query}
            onSaved={saved}
            clearSearch={clearSearch}
          />
        ))}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          Private to your account. Categories have two levels.
        </p>
      </section>
    </>
  );
}
