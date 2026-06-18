import { GenerationProgress } from "@/types";

export default function ProgressBar({ progress }: { progress: GenerationProgress }) {
  const percent = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">Creating {progress.completed} of {progress.total} certificates…</p>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-600">Current: {progress.current || "Preparing…"}</p>
    </div>
  );
}
