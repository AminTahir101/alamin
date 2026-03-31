type EmptyStateProps = {
  title: string;
  description: string;
};

function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-[20px] border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/70">
        •
      </div>
      <h3 className="text-base font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
        {description}
      </p>
    </div>
  );
}

export { EmptyState };
export default EmptyState;