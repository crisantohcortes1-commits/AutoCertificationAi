import PlaceholderChips from "@/components/PlaceholderChips";
import AiNameAssistant from "@/components/AiNameAssistant";
import { FormValues, PlaceholderInfo } from "@/types";

interface CertificateFormProps {
  placeholders: PlaceholderInfo[];
  values: FormValues;
  onChange: (name: string, value: string) => void;
  names: string;
  onNamesChange: (value: string) => void;
  onCleanNames: () => void;
  onUseAiAssistant: () => void;
  isAiLoading: boolean;
  nameCount: number;
}

export default function CertificateForm({ placeholders, values, onChange, names, onNamesChange, onCleanNames, onUseAiAssistant, isAiLoading, nameCount }: CertificateFormProps) {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Fill the placeholders</h2>
        <p className="text-sm text-slate-500">These fields are auto-detected from the template.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Detected placeholders</p>
        <div className="mt-2">
          <PlaceholderChips placeholders={placeholders.filter((placeholder) => placeholder.name.toLowerCase() !== "name" && placeholder.name.toLowerCase() !== "student")} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {placeholders
          .filter((p) => p.name.toLowerCase() !== "name" && p.name.toLowerCase() !== "student")
          .map((placeholder) => (
            <label key={placeholder.name} className="space-y-1 text-sm font-medium text-slate-700">
              <span>{placeholder.name}</span>
              <input
                value={values[placeholder.name] ?? ""}
                onChange={(e) => onChange(placeholder.name, e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 focus:border-blue-500"
                placeholder={placeholder.name}
              />
            </label>
          ))}
      </div>

      <label className="space-y-1 block text-sm font-medium text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Student names</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCleanNames}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
            >
              Clean names
            </button>
            <AiNameAssistant onApply={onUseAiAssistant} isLoading={isAiLoading} />
          </div>
        </div>
        <textarea
          value={names}
          onChange={(e) => onNamesChange(e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
          placeholder="Jane Doe\nJohn Smith"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>Paste one name per line, or separate them with commas or semicolons.</p>
          <p>{nameCount} name{nameCount === 1 ? "" : "s"} entered</p>
        </div>
      </label>
    </div>
  );
}
