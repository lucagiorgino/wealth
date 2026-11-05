"use client";

import Link from "next/link";
import { useState } from "react";
import { categoriesForType } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  transactionMonthLabel,
  transactionTypes,
  transactionTypeLabel,
  transactionViewQuery,
} from "@/lib/transactions";

export function TransactionFilters({
  filters,
  month,
  today,
  wallets,
  categories,
}) {
  const [period, setPeriod] = useState(month);
  const [category, setCategory] = useState(filters.category_id ?? "");
  const [subcategory, setSubcategory] = useState(filters.subcategory_id ?? "");
  const [type, setType] = useState(filters.type ?? "");
  const availableCategories = categoriesForType(categories, type);
  const children = category
    ? availableCategories.filter((item) => item.id === category)
    : availableCategories;
  return (
    <form
      action="/transactions"
      method="get"
      aria-label="Filter transactions"
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="filter-period">Period</Label>
        <NativeSelect
          id="filter-period"
          name="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <NativeSelectOption
            value={month === "all" ? today.slice(0, 7) : month}
          >
            {transactionMonthLabel(month === "all" ? today.slice(0, 7) : month)}
          </NativeSelectOption>
          <NativeSelectOption value="all">
            All dates / custom range
          </NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="filter-q">Description contains</Label>
          <Input
            id="filter-q"
            name="q"
            maxLength={500}
            defaultValue={filters.q ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-type">Type</Label>
          <NativeSelect
            id="filter-type"
            name="type"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setCategory("");
              setSubcategory("");
            }}
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            {transactionTypes.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {transactionTypeLabel(type)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-wallet">Wallet</Label>
          <NativeSelect
            id="filter-wallet"
            name="wallet_id"
            defaultValue={filters.wallet_id ?? ""}
          >
            <NativeSelectOption value="">All wallets</NativeSelectOption>
            {wallets.map((wallet) => (
              <NativeSelectOption key={wallet.id} value={wallet.id}>
                {wallet.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-category">Main category</Label>
          <NativeSelect
            id="filter-category"
            name="category_id"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setSubcategory("");
            }}
          >
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {availableCategories.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
                {!type ? ` (${item.kind})` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-subcategory">Subcategory</Label>
          <NativeSelect
            id="filter-subcategory"
            name="subcategory_id"
            value={subcategory}
            onChange={(event) => setSubcategory(event.target.value)}
          >
            <NativeSelectOption value="">All subcategories</NativeSelectOption>
            {children.flatMap((item) =>
              item.subcategories.map((child) => (
                <NativeSelectOption key={child.id} value={child.id}>
                  {item.name} / {child.name}
                </NativeSelectOption>
              )),
            )}
          </NativeSelect>
        </div>
        {period === "all" &&
          ["from", "to"].map((bound) => (
            <div key={bound} className="space-y-2">
              <Label htmlFor={`filter-${bound}`}>
                {bound === "from" ? "From date" : "Through date"}
              </Label>
              <Input
                id={`filter-${bound}`}
                name={`date_${bound}`}
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                defaultValue={
                  month === "all" ? (filters[`date_${bound}`] ?? "") : ""
                }
              />
            </div>
          ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit">Apply filters</Button>
        <Button asChild variant="outline">
          <Link
            href={`/transactions?${transactionViewQuery({ page: 1 }, month)}`}
          >
            Clear filters
          </Link>
        </Button>
      </div>
    </form>
  );
}
