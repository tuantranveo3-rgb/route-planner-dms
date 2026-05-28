import { AlertTriangle } from "lucide-react";

export function OverloadWarning({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="mb-2 flex items-center gap-2 font-bold">
        <AlertTriangle size={18} />
        {title}
      </div>
      <div className="grid gap-1 text-sm">
        {items.map((item) => (
          <div key={item}>{item}</div>
        ))}
      </div>
    </div>
  );
}
