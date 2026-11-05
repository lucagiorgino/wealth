"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function ErrorPage({ reset }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-5 py-12">
      <Empty className="w-full border bg-card py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h1>Unable to load this page</h1>
          </EmptyTitle>
          <EmptyDescription>
            We could not finish loading this page. Please retry. If the problem
            persists, contact the operator.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft aria-hidden="true" /> Back to home
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
