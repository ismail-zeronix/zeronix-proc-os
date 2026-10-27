/** The one-row page top used across the portal: small title, a short muted summary, then controls pushed right. */
export function PageToolbar({ title, meta, children }: { title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="text-sm font-semibold">{title}</h1>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
