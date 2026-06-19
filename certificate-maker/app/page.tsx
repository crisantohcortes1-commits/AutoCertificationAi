"use client";

import { useEffect, useState } from "react";
import UploadZone from "@/components/UploadZone";
import CertificateForm from "@/components/CertificateForm";
import GenerateButton from "@/components/GenerateButton";
import ProgressBar from "@/components/ProgressBar";
import DownloadCard from "@/components/DownloadCard";
import TemplateLibrary from "@/components/TemplateLibrary";
import { parseTemplate } from "@/lib/docxParser";
import { generateCertificate } from "@/lib/docxGenerator";
import { buildAndDownloadMergedDocx, buildAndDownloadMergedDocxPortrait } from "@/lib/docxMerger";
import { loadTemplateFile } from "@/lib/templateLoader";
import { loadTemplates, saveTemplate } from "@/lib/templateStorage";
import { CertificateTemplate, FormValues, GenerationProgress } from "@/types";

const MAX_CERTIFICATES = 100;

function normalizeNamesInput(value: string): string {
  return value
    .split(/\r?\n|[;,]+|\t/)
    .map((name) => name.replace(/[•·◦\-]+/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

export default function HomePage() {
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [names, setNames] = useState("");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaningNames, setIsCleaningNames] = useState(false);
  const [outputMode, setOutputMode] = useState<"landscape" | "portrait">("landscape");

  useEffect(() => {
    if (typeof window === "undefined" || template) return;

    const loadPreferredTemplate = async () => {
      const savedTemplates = loadTemplates().sort((a, b) => b.uploadedAt - a.uploadedAt);
      if (savedTemplates.length > 0) {
        setTemplate(savedTemplates[0]);
        setFormValues({});
        setNames("");
        setDone(false);
        setError(null);
        return;
      }

      try {
        const sampleFile = await loadTemplateFile("/template/Certificates_Template.docx");
        await handleFileSelected(sampleFile);
      } catch {
        setError("The sample template is unavailable. Please upload your own .docx template.");
      }
    };

    void loadPreferredTemplate();
  }, [template]);

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

  async function handleUseSampleTemplate() {
    try {
      const sampleFile = await loadTemplateFile("/template/Certificates_Template.docx");
      await handleFileSelected(sampleFile);
    } catch {
      setError("The sample template is unavailable. Please upload your own .docx template.");
    }
  }

  function handleFormChange(placeholder: string, value: string) {
    setFormValues((prev) => ({ ...prev, [placeholder]: value }));
  }

  function handleNamesChange(value: string) {
    setNames(value);
  }

  function handleCleanNames() {
    setNames(normalizeNamesInput(names));
  }

  async function handleAiCleanNames() {
    if (!names.trim()) {
      setError("Add a few names first so the assistant can clean them.");
      return;
    }

    setIsCleaningNames(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: names }),
      });

      const data = await response.json();
      const cleaned = typeof data.cleanedText === "string" ? data.cleanedText : normalizeNamesInput(names);
      setNames(cleaned);
    } catch {
      setNames(normalizeNamesInput(names));
    } finally {
      setIsCleaningNames(false);
    }
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
    setIsGenerating(true);

    const entries: { name: string; buffer: ArrayBuffer }[] = [];
    try {
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
        if (outputMode === "portrait") {
          await buildAndDownloadMergedDocxPortrait(entries);
        } else {
          await buildAndDownloadMergedDocx(entries);
        }
        setDone(true);
      }
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }

  const nameCount = names.split("\n").map((n) => n.trim()).filter(Boolean).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0%,_#030712_100%)] text-slate-100">
      {(isReading || isGenerating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/20 bg-white/95 px-6 py-5 text-center shadow-2xl">
            <p className="text-lg font-semibold text-slate-900">{isGenerating ? "Generating certificates..." : "Reading template..."}</p>
            <p className="mt-1 text-sm text-slate-600">{isGenerating ? "Your certificate bundle is being prepared for download." : "We are parsing the document structure and placeholders."}</p>
          </div>
        </div>
      )}
      <nav className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined rounded-xl bg-blue-100 p-2 text-blue-700">verified</span>
            <div>
              <p className="text-lg font-semibold text-white">Certificate Maker</p>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Professional Credentialing Suite</p>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#templates" className="hover:text-blue-400">Templates</a>
            <a href="#history" className="hover:text-blue-400">History</a>
            <a href="https://github.com/crisantohcortes1-commits/AutoCertificationAi" target="_blank" rel="noreferrer" className="hover:text-blue-400">Documentation</a>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-500">Sign In</button>
          </div>
        </div>
      </nav>

      <section className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-16 pt-10 md:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-sm md:p-10">
          <p className="text-sm uppercase tracking-[0.35em] text-blue-400">Certificate Maker Philippines</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold text-white md:text-5xl">Upload once. Generate hundreds of certificates in your browser.</h1>
          <p className="mt-4 max-w-3xl text-slate-300">Use the polished workflow below to upload a DOCX template, detect fields, fill in the placeholders, and download a ready-to-use certificate batch — no server upload required.</p>
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
              <UploadZone onFileSelected={handleFileSelected} isLoading={isReading} onUseSampleTemplate={handleUseSampleTemplate} />
              {template && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Template ready</p><p className="text-sm text-emerald-700">{template.fileName} · {template.placeholders.length} placeholder(s) detected</p></div>}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm md:p-7">
              <h2 className="text-xl font-semibold text-white">2. Detected Fields</h2>
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
            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm md:p-7">
              <h2 className="text-xl font-semibold text-white">3. Fill in the Fields</h2>
              <p className="mt-1 text-sm text-slate-500">Populate the detected placeholders and list student names.</p>
              {template ? <>
                <div className="mt-6"><CertificateForm placeholders={template.placeholders} values={formValues} onChange={handleFormChange} names={names} onNamesChange={handleNamesChange} onCleanNames={handleCleanNames} onUseAiAssistant={handleAiCleanNames} isAiLoading={isCleaningNames} nameCount={nameCount} /></div>
                <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Portrait mode</p>
                      <p className="text-xs text-slate-400">Choose how each certificate page should be separated.</p>
                    </div>
                    <div className="flex rounded-full border border-slate-700 bg-slate-900 p-1">
                      <button
                        type="button"
                        onClick={() => setOutputMode("landscape")}
                        className={`rounded-full px-3 py-1.5 text-sm ${outputMode === "landscape" ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"}`}
                      >
                        Landscape
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutputMode("portrait")}
                        className={`rounded-full px-3 py-1.5 text-sm ${outputMode === "portrait" ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"}`}
                      >
                        Portrait
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{outputMode === "portrait" ? "Each certificate will start on a new page with explicit page breaks." : "Certificates will be merged using continuous section breaks for landscape layouts."}</p>
                </div>
                <div className="mt-6"><GenerateButton onClick={handleGenerate} disabled={nameCount === 0} nameCount={nameCount} /></div>
              </> : <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Please upload a template first to enable the editor and generation tools.</div>}
            </section>

            {progress && <ProgressBar progress={progress} />}
            {done && <DownloadCard onReset={() => { setTemplate(null); setDone(false); setNames(""); setFormValues({}); setError(null); }} />}
          </div>
        </div>

        <section id="templates" className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm md:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Saved Templates</h2>
              <p className="text-sm text-slate-500">Recently saved templates from this browser.</p>
            </div>
          </div>
          <TemplateLibrary onLoad={(loaded) => { setTemplate(loaded); setFormValues({}); setNames(""); setDone(false); setError(null); }} />
        </section>

        <section id="docs" className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Documentation</h2>
              <p className="mt-1 text-sm text-slate-500">Use this quick guide to get the most out of the certificate workflow.</p>
            </div>
            <a href="https://github.com/crisantohcortes1-commits/AutoCertificationAi" target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-400 hover:text-blue-300">Open GitHub repository</a>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">How it works</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>• Upload a DOCX template with placeholders such as {'{name}'}.</li>
                <li>• Fill out the detected fields and paste one name per line.</li>
                <li>• Generate a DOCX file with all completed certificates in one document.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Helpful tips</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>• Use the Clean names button to split pasted lists.</li>
                <li>• Saved templates appear automatically for faster re-use.</li>
                <li>• The app works fully in the browser without uploading files to a server.</li>
              </ul>
            </div>
          </div>
        </section>
      </section>

      <footer className="border-t border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-slate-600 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <p>© 2024 Certificate Maker. Professional Credentialing Suite.</p>
          <div className="flex flex-wrap gap-4"><a href="#" className="hover:text-blue-700">Privacy Policy</a><a href="#" className="hover:text-blue-700">Terms of Service</a><a href="#" className="hover:text-blue-700">Support</a></div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/70 py-3 text-center text-xs text-slate-500">Created By: Lawrence M. Cortes</div>
      </footer>
    </main>
  );
}
