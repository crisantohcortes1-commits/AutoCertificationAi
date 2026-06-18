"use client";

interface AiNameAssistantProps {
  onApply: () => void;
  isLoading: boolean;
}

export default function AiNameAssistant({ onApply, isLoading }: AiNameAssistantProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onApply}
        disabled={isLoading}
        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
        title="Clean names with the AI assistant"
      >
        {isLoading ? "Cleaning..." : "AI Clean"}
      </button>
      <span className="text-[11px] text-slate-500">Sorts, trims, and line-breaks names</span>
    </div>
  );
}
