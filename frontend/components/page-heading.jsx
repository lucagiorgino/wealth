export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-2">
        <p className="text-xs font-semibold tracking-widest text-primary-ink uppercase">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      )}
    </header>
  );
}
