export function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
