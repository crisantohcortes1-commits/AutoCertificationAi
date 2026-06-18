interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  nameCount: number;
}

export default function GenerateButton({ onClick, disabled, nameCount }: GenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white shadow transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      <span className="text-base">⚡</span>
      Generate {nameCount || 0} Certificate{nameCount === 1 ? "" : "s"}
    </button>
  );
}
