import { FormValues, PlaceholderInfo } from "@/types";

interface CertificateFormProps {
  placeholders: PlaceholderInfo[];
  values: FormValues;
  onChange: (name: string, value: string) => void;
  names: string;
  onNamesChange: (value: string) => void;
  nameCount: number;
}

export default function CertificateForm({ placeholders, values, onChange, names, onNamesChange, nameCount }: CertificateFormProps) {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Fill the placeholders</h2>
        <p className="text-sm text-slate-500">These fields are auto-detected from the template.</p>
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
        <span>Student names</span>
        <textarea
          value={names}
          onChange={(e) => onNamesChange(e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
          placeholder="Jane Doe\nJohn Smith"
        />
        <p className="text-xs text-slate-500">{nameCount} name{nameCount === 1 ? "" : "s"} entered</p>
      </label>
    </div>
  );
}
