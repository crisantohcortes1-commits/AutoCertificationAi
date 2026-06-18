import { PlaceholderInfo } from "@/types";

export default function PlaceholderChips({ placeholders }: { placeholders: PlaceholderInfo[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {placeholders.map((p) => (
        <span key={p.name} className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">{p.name}</span>
      ))}
    </div>
  );
}
