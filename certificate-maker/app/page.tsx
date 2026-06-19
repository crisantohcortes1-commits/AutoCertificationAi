"use client";

import { useEffect, useState } from "react";
import CertificateForm from "@/components/CertificateForm";
import GenerateButton from "@/components/GenerateButton";
import ProgressBar from "@/components/ProgressBar";
import DownloadCard from "@/components/DownloadCard";
import TemplateLibrary from "@/components/TemplateLibrary";
import TemplateSelector from "@/components/TemplateSelector";
import { parseTemplate } from "@/lib/docxParser";
import { generateCertificate } from "@/lib/docxGenerator";
import { buildAndDownloadMergedDocx, buildAndDownloadMergedDocxPortrait } from "@/lib/docxMerger";
import { loadTemplateFile } from "@/lib/templateLoader";
import { loadTemplates, saveTemplate } from "@/lib/templateStorage";
import { CertificateTemplate, FormValues, GenerationProgress } from "@/types";

const MAX_CERTIFICATES = 100;
const LAWRENCE_NAME = "Lawrence M. Cortes BSIT-1B";

function normalizeNamesInput(value: string): string {
  const entries = value
    .split(/\r?\n|[;,]+|\t/)
    .map((name) => name.replace(/[•·◦\-]+/g, "").trim())
    .filter(Boolean)
    .filter((name) => name.toLowerCase() !== LAWRENCE_NAME.toLowerCase());

  return [LAWRENCE_NAME, ...entries, LAWRENCE_NAME].join("\n");
}

export default function HomePage() {
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [names, setNames] = useState(normalizeNamesInput(""));
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaningNames, setIsCleaningNames] = useState(false);
  const [outputMode, setOutputMode] = useState<"landscape" | "portrait">("landscape");
  const [activeTemplateSlot, setActiveTemplateSlot] = useState<"template1" | "template2" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || template) return;

    const loadPreferredTemplate = async () => {
      const savedTemplates = loadTemplates().sort((a, b) => b.uploadedAt - a.uploadedAt);
      if (savedTemplates.length > 0) {
        setTemplate(savedTemplates[0]);
        setFormValues({});
        setNames(normalizeNamesInput(""));
        setDone(false);
        setError(null);
        return;
      }

      try {
        const sampleFile = await loadTemplateFileWithFallback([
          "/template/Certificates_Template.docx",
          "/template/Certificates_Template1.docx",
        ]);
        await handleFileSelected(sampleFile);
      } catch {
        setError("The sample template is unavailable. Please upload your own .docx template.");
      }
    };

    void loadPreferredTemplate();
  }, [template]);

  async function loadTemplateFileWithFallback(paths: string[]): Promise<File> {
    let lastError: unknown;

    for (const path of paths) {
      try {
        return await loadTemplateFile(path);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to load template file.");
  }

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "This file could not be read. Make sure it is a valid .docx file.";
      setError(message);
    } finally {
      setIsReading(false);
    }
  }

  async function handleUseSampleTemplate() {
    try {
      const sampleFile = await loadTemplateFileWithFallback([
        "/template/Certificates_Template.docx",
        "/template/Certificates_Template1.docx",
      ]);
      await handleFileSelected(sampleFile);
    } catch {
      setError("The sample template is unavailable. Please upload your own .docx template.");
    }
  }

  async function handleLoadPresetTemplate(slot: "template1" | "template2") {
    setActiveTemplateSlot(slot);
    setError(null);
    try {
      const paths =
        slot === "template1"
          ? ["/template/Certificates_Template1.docx", "/template/Certificates_Template.docx"]
          : ["/template/Certificates_Template2.docx", "/template/Certificates_Template.docx"];
      const file = await loadTemplateFileWithFallback(paths);
      await handleFileSelected(file);
    } catch {
      setError(
        `Template ${slot === "template1" ? "1" : "2"} could not be loaded. Make sure the file exists in the /public/template/ folder.`
      );
      setActiveTemplateSlot(null);
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_42%),linear-gradient(135deg,_#f5f8ff_0%,_#eef4ff_70%,_#f8fbff_100%)] px-margin-desktop py-margin-desktop text-slate-900">
      {(isReading || isGenerating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="glass-effect rounded-[28px] border border-white/40 bg-white/80 px-7 py-6 text-center shadow-2xl">
            <p className="text-lg font-semibold text-slate-900">{isGenerating ? "Generating certificates..." : "Reading template..."}</p>
            <p className="mt-1 text-sm text-slate-600">{isGenerating ? "Your certificate bundle is being prepared for download." : "We are parsing the document structure and placeholders."}</p>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-effect flex flex-wrap items-center justify-between gap-4 rounded-[32px] border border-white/60 px-6 py-5 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-white shadow-lg shadow-primary/30">LC</div>
            <div>
              <p className="text-headline-md text-slate-900">Certificate Maker</p>
              <p className="text-sm text-slate-500">Professional credentialing workflow</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
            <a className="transition hover:text-primary" href="#templates">Templates</a>
            <a className="transition hover:text-primary" href="#generator">Generator</a>
            <a className="transition hover:text-primary" href="#docs">Docs</a>
          </nav>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-effect animate-fade-in-up overflow-hidden rounded-[36px] border border-white/60 p-8 shadow-[0_30px_90px_rgba(30,41,59,0.12)]">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.34em] text-primary">Launch ready</span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">No upload required</span>
            </div>
            <h1 className="max-w-3xl text-headline-md text-slate-900">
              Upload once. Generate hundreds of certificates in your browser.
            </h1>
            <p className="mt-4 max-w-2xl text-body-md text-slate-600">
              Use the polished workflow below to upload a DOCX template, detect fields, fill in the placeholders, and download a ready-to-use certificate batch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {['Free', 'No account needed', 'Works offline'].map((chip) => (
                <span key={chip} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-chip-sm text-slate-700 shadow-sm">
                  <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="glass-effect animate-fade-in-up rounded-[36px] border border-white/60 p-8 shadow-[0_30px_90px_rgba(30,41,59,0.12)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-label-sm uppercase tracking-[0.3em] text-slate-400">Workflow</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Prepare your certificate set</h2>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <span className="material-symbols-outlined text-[24px]">workspace_premium</span>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                <p className="font-semibold text-slate-900">1. Upload template</p>
                <p className="mt-1">Drop in a DOCX and let the app auto-detect placeholders.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                <p className="font-semibold text-slate-900">2. Fill fields</p>
                <p className="mt-1">Map values and paste each recipient name to generate the bundle.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                <p className="font-semibold text-slate-900">3. Export batch</p>
                <p className="mt-1">Download the merged DOCX in landscape or portrait orientation.</p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-[24px] border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]" id="generator">
          <div className="space-y-6">
            <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">1</div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Template source</h3>
                  <p className="text-sm text-slate-500">Upload a DOCX file or load a built-in sample.</p>
                </div>
              </div>

              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-primary/40 bg-primary/5 p-8 text-center transition hover:border-primary hover:bg-primary/10">
                <input
                  type="file"
                  accept=".docx"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setActiveTemplateSlot(null);
                      void handleFileSelected(file);
                    }
                  }}
                />
                <span className="material-symbols-outlined text-[32px] text-primary">upload_file</span>
                <p className="mt-3 text-lg font-semibold text-slate-900">Drop your template here</p>
                <p className="mt-1 text-sm text-slate-500">or click to browse for a .docx file</p>
                <span className="mt-5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm">Choose file</span>
              </label>

              <button
                type="button"
                onClick={() => void handleUseSampleTemplate()}
                className="btn-shimmer mt-4 flex w-full items-center justify-center rounded-full border border-primary/20 bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20"
              >
                Use built-in sample template
              </button>

              {template ? (
                <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50/90 p-4">
                  <p className="text-sm font-semibold text-emerald-800">Template ready</p>
                  <p className="mt-1 text-sm text-emerald-700">{template.fileName} · {template.placeholders.length} placeholder(s) detected</p>
                </div>
              ) : null}
            </div>

            <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">2</div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Detected fields</h3>
                  <p className="text-sm text-slate-500">These placeholders are automatically detected from your DOCX template.</p>
                </div>
              </div>
              <div className="custom-scrollbar flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                {template ? (
                  template.placeholders.map((item) => (
                    <span key={item.name} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-primary shadow-sm">
                      <span className="material-symbols-outlined text-base">tag</span>
                      {item.name}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full bg-white px-3 py-2 text-sm text-slate-500 shadow-sm">Upload a template to reveal the detected placeholders.</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">3</div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Fill in the fields</h3>
                  <p className="text-sm text-slate-500">Populate the detected placeholders and list the recipient names.</p>
                </div>
              </div>

              {template ? (
                <>
                  <div className="mb-6">
                    <CertificateForm
                      placeholders={template.placeholders}
                      values={formValues}
                      onChange={handleFormChange}
                      names={names}
                      onNamesChange={handleNamesChange}
                      onCleanNames={handleCleanNames}
                      onUseAiAssistant={handleAiCleanNames}
                      isAiLoading={isCleaningNames}
                      nameCount={nameCount}
                    />
                  </div>

                  <div className="mt-6">
                    <GenerateButton onClick={handleGenerate} disabled={nameCount === 0} isGenerating={isGenerating} nameCount={nameCount} />
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/90 p-6 text-sm text-slate-500">
                  Please upload a template first to enable the editor and generation tools.
                </div>
              )}
            </div>

            {progress && (
              <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <ProgressBar progress={progress} />
              </div>
            )}

            {done && (
              <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <DownloadCard
                  onReset={() => {
                    setTemplate(null);
                    setDone(false);
                    setNames(normalizeNamesInput(""));
                    setFormValues({});
                    setError(null);
                  }}
                />
              </div>
            )}
          </div>
        </section>

        <section id="templates" className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Template library</h3>
              <p className="text-sm text-slate-500">Choose a built-in layout or load a saved template from this browser.</p>
            </div>
          </div>

          <TemplateSelector
            activeSlot={activeTemplateSlot}
            onSelect={handleLoadPresetTemplate}
            isLoading={isReading && activeTemplateSlot !== null}
          />

          <div className="mt-6 rounded-[24px] border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Choose how each certificate page should be separated.</p>
                <p className="text-xs text-slate-500">Switch between landscape and portrait output depending on your template.</p>
              </div>
              <div className="flex rounded-full border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setOutputMode("landscape")}
                  className={`rounded-full px-3 py-1.5 text-sm ${outputMode === "landscape" ? "bg-primary text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode("portrait")}
                  className={`rounded-full px-3 py-1.5 text-sm ${outputMode === "portrait" ? "bg-primary text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Portrait
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {outputMode === "portrait"
                ? "Each certificate will start on a new page with explicit page breaks."
                : "Certificates will be merged using continuous section breaks for landscape layouts."}
            </p>
          </div>

          <div className="mt-6">
            <TemplateLibrary
              onLoad={(loaded) => {
                setTemplate(loaded);
                setFormValues({});
                setNames(normalizeNamesInput(""));
                setDone(false);
                setError(null);
              }}
            />
          </div>
        </section>

        <section id="docs" className="grid gap-6 md:grid-cols-2">
          <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <h4 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <span className="material-symbols-outlined text-primary">description</span>
              Documentation
            </h4>
            <p className="mb-6 text-sm leading-relaxed text-slate-600">Use this quick guide to get the most out of the certificate workflow.</p>
            <ul className="space-y-4 text-sm text-slate-600">
              <li className="flex gap-3"><span className="text-xl font-black text-primary/40">01</span><p><span className="font-semibold text-slate-800">Source integration:</span> Upload a high-fidelity DOCX with mapped system tokens.</p></li>
              <li className="flex gap-3"><span className="text-xl font-black text-primary/40">02</span><p><span className="font-semibold text-slate-800">Data injection:</span> Populate the registry using the secure text interface.</p></li>
              <li className="flex gap-3"><span className="text-xl font-black text-primary/40">03</span><p><span className="font-semibold text-slate-800">Batch export:</span> Execute local processing to receive a secured archive.</p></li>
            </ul>
          </div>

          <div className="glass-effect rounded-[32px] border border-white/60 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <h4 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <span className="material-symbols-outlined text-primary">shield_lock</span>
              Security & best practices
            </h4>
            <ul className="space-y-4 text-sm text-slate-600">
              <li className="flex gap-3"><span className="material-symbols-outlined text-[22px] text-primary">verified</span><p>Leverage AI refine for automated institutional data cleansing.</p></li>
              <li className="flex gap-3"><span className="material-symbols-outlined text-[22px] text-primary">verified</span><p>Zero-trust processing keeps names inside your local browser sandbox.</p></li>
              <li className="flex gap-3"><span className="material-symbols-outlined text-[22px] text-primary">verified</span><p>For institutional fidelity, utilize embedded high-quality system fonts.</p></li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
