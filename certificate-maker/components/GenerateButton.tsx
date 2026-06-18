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
      className="w-full rounded-2xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      Generate {nameCount || 0} Certificate{nameCount === 1 ? "" : "s"}
    </button>
  );
}
