"use client";

import { useEffect, useState } from "react";
import { loadTemplates, deleteTemplate } from "@/lib/templateStorage";
import { CertificateTemplate } from "@/types";

interface TemplateLibraryProps {
  onLoad: (template: CertificateTemplate) => void;
}

export default function TemplateLibrary({ onLoad }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  function handleDelete(id: string) {
    deleteTemplate(id);
    setTemplates(loadTemplates());
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Template Library</h2>
      <p className="text-sm text-slate-500">Saved templates from this browser.</p>
      <div className="mt-4 space-y-3">
        {templates.length === 0 ? <p className="text-sm text-slate-500">No saved templates yet.</p> : templates.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-slate-500">{t.fileName}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onLoad(t)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">Load</button>
              <button onClick={() => handleDelete(t.id)} className="rounded-lg bg-slate-200 px-3 py-2 text-sm">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
