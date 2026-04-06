type EmptyStateProps = {
  title: string;
  description: string;
};

function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-[22px] border border-dashed border-[var(--border-strong)] bg-[var(--card-subtle)] px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-faint)]">
        •
      </div>
      <h3 className="text-base font-bold text-[var(--foreground)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--foreground-muted)]">
        {description}
      </p>
    </div>
  );
}

export { EmptyState };
export default EmptyState;