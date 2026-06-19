interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  nameCount: number;
  isGenerating?: boolean;
}

export default function GenerateButton({ onClick, disabled, nameCount, isGenerating = false }: GenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isGenerating}
      className="btn-shimmer flex w-full items-center justify-center gap-2 rounded-[20px] bg-primary px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {isGenerating ? (
        <>
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4Z" />
          </svg>
          <span className="loading-text">Generating…</span>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-[20px]">bolt</span>
          <span>Generate {nameCount || 0} Certificate{nameCount === 1 ? "" : "s"}</span>
        </>
      )}
    </button>
  );
}
