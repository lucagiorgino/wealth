"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  BookOpen,
  Car,
  ChevronDown,
  CircleEllipsis,
  Coffee,
  Gamepad2,
  Gift,
  HeartPulse,
  House,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  Shirt,
  ShoppingBasket,
  TrainFront,
  Trash2,
  Utensils,
} from "lucide-react";
import {
  deleteCategoryAction,
  importCategoriesAction,
  saveCategoryAction,
} from "@/app/(app)/categories/actions";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { categoryIcons } from "@/lib/categories";

const icons = {
  house: House,
  "heart-pulse": HeartPulse,
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  "train-front": TrainFront,
  shirt: Shirt,
  "gamepad-2": Gamepad2,
  gift: Gift,
  landmark: Landmark,
  "circle-ellipsis": CircleEllipsis,
  plane: Plane,
  car: Car,
  "book-open": BookOpen,
  coffee: Coffee,
};

function CategoryIcon({ item }) {
  const Icon = icons[item.icon];
  return (
    <Icon
      aria-hidden="true"
      className="size-5 shrink-0"
      style={{ color: item.colour }}
    />
  );
}

function preserveFormEdits(event) {
  // Radix's native reset listeners run before React's bubbling reset handler.
  event.preventDefault();
  event.stopPropagation();
}

function CategoryForm({
  item,
  parent,
  kind: defaultKind,
  label,
  onSaved,
  nameRef,
}) {
  const prefix = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [colour, setColour] = useState(
    item?.colour ?? parent?.colour ?? "#3b82f6",
  );
  const [icon, setIcon] = useState(item?.icon ?? parent?.icon ?? "house");
  const [kind, setKind] = useState(item?.kind ?? defaultKind ?? "expense");
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await saveCategoryAction(previous, form);
    if (result.success) onSaved(result.success, parent?.kind ?? kind);
    return result;
  }, {});

  return (
    <form
      action={action}
      aria-label={label}
      onResetCapture={preserveFormEdits}
      className="space-y-5"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      {parent && <input type="hidden" name="parent_id" value={parent.id} />}
      {!parent && (
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-kind`}>Category family</Label>
          {item ? (
            <>
              <input type="hidden" name="kind" value={kind} />
              <p id={`${prefix}-kind`} className="text-sm capitalize">
                {kind} (cannot be changed)
              </p>
            </>
          ) : (
            <NativeSelect
              id={`${prefix}-kind`}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              disabled={pending}
            >
              <NativeSelectOption value="expense">Expense</NativeSelectOption>
              <NativeSelectOption value="income">Income</NativeSelectOption>
            </NativeSelect>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background">
          <CategoryIcon item={{ icon, colour }} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Preview</p>
          <p className="font-medium [overflow-wrap:anywhere]">
            {name.trim() || "Your category"}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-name`}>Name</Label>
        <Input
          ref={nameRef}
          id={`${prefix}-name`}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={`${prefix}-name-hint`}
          placeholder={parent ? "e.g. Groceries" : "e.g. Everyday spending"}
          disabled={pending}
          required
        />
        <p id={`${prefix}-name-hint`} className="text-xs text-muted-foreground">
          Use 1 to 100 characters.{" "}
          {parent
            ? "Choose a unique name within this category."
            : "Choose a unique name within this category family."}{" "}
          Names are not case-sensitive.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-colour`}>Colour</Label>
        <div className="flex items-center gap-3">
          <Input
            id={`${prefix}-colour`}
            name="colour"
            type="color"
            value={colour}
            onChange={(event) => setColour(event.target.value)}
            className="w-16 cursor-pointer p-1"
            disabled={pending}
            required
          />
          <span className="text-sm text-muted-foreground">
            {colour.toUpperCase()}
          </span>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Icon</legend>
        <RadioGroup
          name="icon"
          aria-label="Icon"
          value={icon}
          onValueChange={setIcon}
          disabled={pending}
          className="grid-cols-4 gap-2 sm:grid-cols-5"
          required
        >
          {categoryIcons.map((option) => (
            <Label
              key={option.value}
              htmlFor={`${prefix}-${option.value}`}
              className={`relative flex min-h-20 cursor-pointer flex-col justify-center gap-1.5 rounded-lg border p-2 text-xs has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                icon === option.value
                  ? "border-primary bg-accent"
                  : "border-border hover:bg-muted"
              }`}
            >
              <RadioGroupItem
                id={`${prefix}-${option.value}`}
                value={option.value}
                className="absolute top-1.5 right-1.5 size-3 aria-checked:border-primary aria-checked:bg-primary"
              />
              <CategoryIcon item={{ icon: option.value, colour }} />
              {option.label}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <Feedback state={state} />
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving..."
            : item
              ? "Save changes"
              : parent
                ? "Add subcategory"
                : "Create category"}
        </Button>
      </div>
    </form>
  );
}

export function CategoryEditorContent({
  item,
  parent,
  kind,
  onSaved,
  onCloseAutoFocus,
}) {
  const nameRef = useRef(null);
  const level = parent ? "subcategory" : "category";
  const title = item
    ? `Edit ${level}`
    : parent
      ? "Add subcategory"
      : "Create category";
  return (
    <DialogContent
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        nameRef.current?.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="[overflow-wrap:anywhere]">
          {parent
            ? `Part of ${parent.name}. Subcategories cannot have children.`
            : "Give your transactions a recognizable name, colour, and icon."}
        </DialogDescription>
      </DialogHeader>
      <CategoryForm
        item={item}
        parent={parent}
        kind={kind}
        label={
          item
            ? `Edit ${level} ${item.name}`
            : parent
              ? `Add subcategory to ${parent.name}`
              : title
        }
        onSaved={onSaved}
        nameRef={nameRef}
      />
    </DialogContent>
  );
}

function DeleteCategory({ item, parent, onDeleted }) {
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await deleteCategoryAction(previous, form);
    if (result.success) onDeleted(result.success);
    return result;
  }, {});
  return (
    <form
      action={action}
      aria-label={`Delete ${item.name}`}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={item.id} />
      {parent && <input type="hidden" name="parent_id" value={parent.id} />}
      <Feedback state={state} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending
            ? "Deleting..."
            : parent
              ? "Delete subcategory"
              : "Delete category"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

export function PresetCategories({ presets, onImported }) {
  const prefix = useId();
  const [selected, setSelected] = useState([]);
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await importCategoriesAction(previous, form);
    if (result.success) onImported(result.success);
    return result;
  }, {});
  return (
    <form
      action={action}
      aria-label="Predefined categories"
      onResetCapture={preserveFormEdits}
      className="flex min-h-0 flex-1 flex-col"
    >
      <fieldset className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-6 pb-6 sm:grid-cols-2">
        <legend className="sr-only">
          Available predefined category groups
        </legend>
        {presets.map((preset) => (
          <Label
            key={preset.key}
            htmlFor={`${prefix}-${preset.key}`}
            className={`block cursor-pointer space-y-3 rounded-lg border p-4 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
              selected.includes(preset.key)
                ? "border-primary bg-accent"
                : "border-border hover:bg-muted"
            }`}
          >
            <span className="flex items-center gap-3">
              <CategoryIcon item={preset} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">
                  {preset.name}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {preset.subcategories.length}{" "}
                  {preset.subcategories.length === 1
                    ? "subcategory"
                    : "subcategories"}
                </span>
              </span>
              <Checkbox
                id={`${prefix}-${preset.key}`}
                aria-label={preset.name}
                aria-describedby={`${prefix}-${preset.key}-children`}
                name="keys"
                value={preset.key}
                checked={selected.includes(preset.key)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked === true
                      ? [...current, preset.key]
                      : current.filter((key) => key !== preset.key),
                  )
                }
                disabled={pending}
                className="aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
              />
            </span>
            <span
              id={`${prefix}-${preset.key}-children`}
              className="block text-sm leading-relaxed font-normal text-muted-foreground [overflow-wrap:anywhere]"
            >
              {preset.subcategories.map((child) => child.name).join(", ")}
            </span>
          </Label>
        ))}
        {!presets.length && (
          <p className="text-muted-foreground sm:col-span-2">
            All predefined groups have already been added. Your copies are ready
            to customize.
          </p>
        )}
      </fieldset>
      <div className="shrink-0 space-y-3 border-t bg-muted/40 p-6">
        <Feedback state={state} />
        <p role="status" className="text-sm text-muted-foreground">
          {selected.length
            ? `${selected.length} ${selected.length === 1 ? "group" : "groups"} selected`
            : "Select the groups you want to add."}
        </p>
        <Button
          type="submit"
          disabled={pending || !selected.length}
          className="w-full"
        >
          {pending ? "Adding..." : "Add selected categories"}
        </Button>
      </div>
    </form>
  );
}

function CategoryActions({ item, parent, onSaved, fallbackFocusRef }) {
  const trigger = useRef(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const level = parent ? "subcategory" : "category";
  function restoreFocus(event) {
    event.preventDefault();
    const target = trigger.current?.isConnected
      ? trigger.current
      : fallbackFocusRef.current;
    target?.focus();
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={`Actions for ${level} ${item.name}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-48"
          onCloseAutoFocus={(event) => {
            if (editing || deleting) event.preventDefault();
          }}
        >
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Edit {level}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 aria-hidden="true" /> Delete {level}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editing} onOpenChange={setEditing}>
        <CategoryEditorContent
          item={item}
          parent={parent}
          onCloseAutoFocus={restoreFocus}
          onSaved={(message) => {
            setEditing(false);
            onSaved(message);
          }}
        />
      </Dialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-open:motion-reduce:animate-none data-closed:motion-reduce:animate-none"
          onCloseAutoFocus={restoreFocus}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              Delete {item.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="[overflow-wrap:anywhere]">
              {parent || !item.subcategories.length
                ? `This ${level} will be permanently deleted.`
                : `This category and its ${item.subcategories.length} ${item.subcategories.length === 1 ? "subcategory" : "subcategories"} will be permanently deleted.`}{" "}
              Transactions using it must be reassigned or deleted first. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DeleteCategory
            item={item}
            parent={parent}
            onDeleted={(message) => {
              setDeleting(false);
              onSaved(message);
            }}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CategoryCard({ category, searching, onSaved, fallbackFocusRef }) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const count = category.subcategories.length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 border-b">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
          <CategoryIcon item={category} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <CardTitle>
            <h3 className="leading-snug [overflow-wrap:anywhere]">
              {category.name}
            </h3>
          </CardTitle>
          <Badge variant="secondary">
            {count} {count === 1 ? "subcategory" : "subcategories"}
          </Badge>
        </div>
        <CategoryActions
          item={category}
          onSaved={onSaved}
          fallbackFocusRef={fallbackFocusRef}
        />
      </CardHeader>
      <CardContent>
        <Collapsible
          open={searching || expanded}
          onOpenChange={setExpanded}
          className="space-y-3"
        >
          {count > 0 && (
            <>
              {searching ? (
                <p className="text-sm font-medium">Subcategories</p>
              ) : (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    {expanded ? "Hide subcategories" : "View subcategories"}
                    <ChevronDown
                      aria-hidden="true"
                      className={expanded ? "rotate-180" : ""}
                    />
                  </Button>
                </CollapsibleTrigger>
              )}
              <CollapsibleContent>
                <section aria-label={`Subcategories of ${category.name}`}>
                  <ul className="space-y-2 border-l pl-3">
                    {category.subcategories.map((child) => (
                      <li
                        key={child.id}
                        className="flex items-center gap-3 rounded-lg border bg-card p-2 pl-3"
                      >
                        <CategoryIcon item={child} />
                        <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">
                          {child.name}
                        </span>
                        <CategoryActions
                          item={child}
                          parent={category}
                          onSaved={onSaved}
                          fallbackFocusRef={fallbackFocusRef}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              </CollapsibleContent>
            </>
          )}
          {!count && (
            <p className="text-sm text-muted-foreground">
              No subcategories yet.
            </p>
          )}
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Plus aria-hidden="true" /> Add subcategory
              </Button>
            </DialogTrigger>
            <CategoryEditorContent
              parent={category}
              onSaved={(message) => {
                setAdding(false);
                setExpanded(true);
                onSaved(message);
              }}
            />
          </Dialog>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function CategoryTree({
  categories,
  searching,
  onSaved,
  fallbackFocusRef,
}) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          searching={searching}
          onSaved={onSaved}
          fallbackFocusRef={fallbackFocusRef}
        />
      ))}
    </div>
  );
}
