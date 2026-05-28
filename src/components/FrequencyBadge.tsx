import type { Frequency } from "@/types/outlet";

const styles: Record<Frequency, string> = {
  F8: "bg-purple-100 text-purple-700 ring-purple-200",
  F4: "bg-red-100 text-red-700 ring-red-200",
  F2: "bg-blue-100 text-blue-700 ring-blue-200",
  F1: "bg-green-100 text-green-700 ring-green-200",
  "F0.5": "bg-slate-100 text-slate-700 ring-slate-200",
  "F0.3": "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export function FrequencyBadge({ frequency }: { frequency: Frequency }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${styles[frequency]}`}>{frequency}</span>;
}
