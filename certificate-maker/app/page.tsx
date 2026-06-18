"use client";

import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import CertificateForm from "@/components/CertificateForm";
import GenerateButton from "@/components/GenerateButton";
import ProgressBar from "@/components/ProgressBar";
import DownloadCard from "@/components/DownloadCard";
import TemplateLibrary from "@/components/TemplateLibrary";
import { parseTemplate } from "@/lib/docxParser";
import { generateCertificate } from "@/lib/docxGenerator";
import { buildAndDownloadMergedDocx } from "@/lib/docxMerger";
import { saveTemplate } from "@/lib/templateStorage";
import { CertificateTemplate, FormValues, GenerationProgress } from "@/types";

const MAX_CERTIFICATES = 100;

export default function HomePage() {
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [names, setNames] = useState("");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  async function handleFileSelected(file: File) {
    setIsReading(true);
    setError(null);
    setTemplate(null);
    setDone(false);
    setProgress(null);
    try {
      const buffer = await file.arrayBuffer();
      const placeholders = await parseTemplate(buffer);
      if (placeholders.length === 0) {
        setError("No placeholders like {name} were found in this template.");
        return;
      }
      const newTemplate: CertificateTemplate = {
        id: Date.now().toString(),
        name: file.name.replace(/\.docx$/i, ""),
        fileName: file.name,
        rawDocxBuffer: buffer,
        placeholders,
        uploadedAt: Date.now(),
      };
      setTemplate(newTemplate);
      saveTemplate(newTemplate);
    } catch {
      setError("This file could not be read. Make sure it is a valid .docx file.");
    } finally {
      setIsReading(false);
    }
  }

  function handleFormChange(placeholder: string, value: string) {
    setFormValues((prev) => ({ ...prev, [placeholder]: value }));
  }

  async function handleGenerate() {
    if (!template) return;
    const namesList = names.split("\n").map((n) => n.trim()).filter(Boolean);
    if (namesList.length === 0) {
      setError("Please enter at least one name.");
      return;
    }
    if (namesList.length > MAX_CERTIFICATES) {
      setError(`Maximum ${MAX_CERTIFICATES} certificates per batch.`);
      return;
    }

    setError(null);
    setDone(false);
    setProgress({ total: namesList.length, completed: 0, current: "", results: [] });

    const entries: { name: string; buffer: ArrayBuffer }[] = [];
    for (let i = 0; i < namesList.length; i++) {
      const name = namesList[i];
      setProgress((prev) => (prev ? { ...prev, current: name, completed: i } : null));
      try {
        const values = { ...formValues };
        const autoNamePlaceholder = template.placeholders.find((p) => ["name", "student", "fullname", "recipient", "user"].includes(p.name));
        values[(autoNamePlaceholder ?? template.placeholders[0]).name] = name;
        const buffer = await generateCertificate(template.rawDocxBuffer, values, template.placeholders);
        entries.push({ name, buffer });
        setProgress((prev) => (prev ? { ...prev, completed: i + 1, results: [...prev.results, { status: "success", name }] } : null));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        setProgress((prev) => (prev ? { ...prev, completed: i + 1, results: [...prev.results, { status: "error", name, errorMessage: message }] } : null));
      }
    }

    if (entries.length > 0) {
      await buildAndDownloadMergedDocx(entries);
      setDone(true);
    }
    setProgress(null);
  }

  const nameCount = names.split("\n").map((n) => n.trim()).filter(Boolean).length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f9ff_0%,#eef4fc_100%)] text-slate-900">
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined rounded-xl bg-blue-100 p-2 text-blue-700">verified</span>
            <div>
              <p className="text-lg font-semibold text-slate-900">Certificate Maker</p>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Professional Credentialing Suite</p>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#templates" className="hover:text-blue-700">Templates</a>
            <a href="#history" className="hover:text-blue-700">History</a>
            <a href="#docs" className="hover:text-blue-700">Documentation</a>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">Sign In</button>
          </div>
        </div>
      </nav>

      <section className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-16 pt-10 md:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
          <p className="text-sm uppercase tracking-[0.35em] text-blue-600">Certificate Maker Philippines</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold text-slate-900 md:text-5xl">Upload once. Generate hundreds of certificates in your browser.</h1>
          <p className="mt-4 max-w-3xl text-slate-600">Use the polished workflow below to upload a DOCX template, detect fields, fill in the placeholders, and download a ready-to-use certificate batch — no server upload required.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {['Free', 'No account needed', 'Works offline'].map((chip) => (
              <span key={chip} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"> <span className="material-symbols-outlined text-base">check_circle</span> {chip}</span>
            ))}
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">{error}</div>}

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">1. Upload Template</h2>
                  <p className="text-sm text-slate-500">Drop a .docx file or click to browse.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-500">Step 1 of 3</span>
              </div>
              <UploadZone onFileSelected={handleFileSelected} isLoading={isReading} />
              {template && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Template ready</p><p className="text-sm text-emerald-700">{template.fileName} · {template.placeholders.length} placeholder(s) detected</p></div>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
              <h2 className="text-xl font-semibold text-slate-900">2. Detected Fields</h2>
              <p className="mt-1 text-sm text-slate-500">These fields are found automatically from your DOCX template.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {template ? template.placeholders.map((item) => (
                  <span key={item.name} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"> <span className="material-symbols-outlined text-base text-blue-700">tag</span> {item.name}</span>
                )) : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-500">Upload a template to reveal detected placeholders.</span>}
              </div>
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500"><span className="material-symbols-outlined text-base">info</span> These are auto-detected from the template contents.</p>
            </section>
          </div>

          <div className="space-y-8">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
              <h2 className="text-xl font-semibold text-slate-900">3. Fill in the Fields</h2>
              <p className="mt-1 text-sm text-slate-500">Populate the detected placeholders and list student names.</p>
              {template ? <>
                <div className="mt-6"><CertificateForm placeholders={template.placeholders} values={formValues} onChange={handleFormChange} names={names} onNamesChange={setNames} nameCount={nameCount} /></div>
                <div className="mt-6"><GenerateButton onClick={handleGenerate} disabled={nameCount === 0} nameCount={nameCount} /></div>
              </> : <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Please upload a template first to enable the editor and generation tools.</div>}
            </section>

            {progress && <ProgressBar progress={progress} />}
            {done && <DownloadCard onReset={() => { setTemplate(null); setDone(false); setNames(""); setFormValues({}); setError(null); }} />}
          </div>
        </div>

        <section id="templates" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Saved Templates</h2>
              <p className="text-sm text-slate-500">Recently saved templates from this browser.</p>
            </div>
          </div>
          <TemplateLibrary onLoad={(loaded) => { setTemplate(loaded); setFormValues({}); setNames(""); setDone(false); setError(null); }} />
        </section>
      </section>

      <footer className="border-t border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-slate-600 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <p>© 2024 Certificate Maker. Professional Credentialing Suite.</p>
          <div className="flex flex-wrap gap-4"><a href="#" className="hover:text-blue-700">Privacy Policy</a><a href="#" className="hover:text-blue-700">Terms of Service</a><a href="#" className="hover:text-blue-700">Support</a></div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/70 py-3 text-center text-xs text-slate-500">Created By: Lawrence M. Cortes</div>
      </footer>
    </main>
  );
}
