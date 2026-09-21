export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink"
        role="status"
        aria-label="جارٍ التحميل"
      />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 px-6 py-12 text-center">
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {description && <p className="text-sm text-ink-400">{description}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <p className="font-display text-base font-bold text-danger">حدث خطأ</p>
      <p className="text-sm text-ink-400">{message}</p>
    </div>
  );
}
