"use client";

import { useEffect, useState } from "react";
import UploadZone from "@/components/UploadZone";
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
  const [activeTemplateSlot, setActiveTemplateSlot] = useState<"template1" | "template2" | null>(null);

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
    <main className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {(isReading || isGenerating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/20 bg-white/95 px-6 py-5 text-center shadow-2xl">
            <p className="text-lg font-semibold text-slate-900">{isGenerating ? "Generating certificates..." : "Reading template..."}</p>
            <p className="mt-1 text-sm text-slate-600">{isGenerating ? "Your certificate bundle is being prepared for download." : "We are parsing the document structure and placeholders."}</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 h-20 w-full border-b border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-lg">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-blue-700">Lawrence Cortes</span>
            <div className="inline-flex items-center justify-center rounded bg-blue-600 p-1 text-white">
              <span className="material-symbols-outlined text-[14px]">check</span>
            </div>
            <span className="ml-1 hidden text-sm font-medium text-slate-400 sm:inline">Certificate Maker</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a className="text-slate-600 transition-colors hover:text-blue-700" href="#templates">Templates</a>
            <a className="border-b-2 border-blue-700 pb-1 text-blue-700" href="#generator">Generator</a>
            <a className="text-slate-600 transition-colors hover:text-blue-700" href="#history">History</a>
            <a className="text-slate-600 transition-colors hover:text-blue-700" href="#docs">Docs</a>
          </nav>
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 hover:shadow-md active:scale-95">
            Verify Certificate
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-grow flex-col px-6 py-8 lg:px-8 lg:py-10">
        <section className="mb-8">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
            <div className="relative z-10 max-w-4xl">
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                  Professional Credentialing Suite
                </span>
                <div className="inline-flex items-center justify-center rounded bg-blue-600 p-1 text-white">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                </div>
              </div>
              <h1 className="mb-4 text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
                Upload once. Generate hundreds of certificates in your browser.
              </h1>
              <p className="mb-6 max-w-3xl text-lg leading-relaxed text-slate-600">
                Use the polished workflow below to upload a DOCX template, detect fields, fill in the placeholders, and download a ready-to-use certificate batch — no server upload required.
              </p>
              <div className="flex flex-wrap gap-3">
                {['Free', 'No account needed', 'Works offline'].map((chip) => (
                  <span key={chip} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    <span className="material-symbols-outlined text-[18px] text-blue-700">check_circle</span>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 opacity-[0.03]">
              <span className="material-symbols-outlined absolute -right-24 -top-24 text-[400px]">workspace_premium</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-8 lg:col-span-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md lg:p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 font-bold text-white shadow-sm">1</span>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Choose a Template</h2>
                  <p className="text-sm text-slate-500">Pick a preset or upload your own .docx file.</p>
                </div>
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">or upload your own</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <UploadZone
                onFileSelected={(file) => {
                  setActiveTemplateSlot(null);
                  void handleFileSelected(file);
                }}
                isLoading={isReading && activeTemplateSlot === null}
                onUseSampleTemplate={handleUseSampleTemplate}
              />

              <button
                type="button"
                onClick={() => void handleUseSampleTemplate()}
                className="mt-4 w-full rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
              >
                Use built-in sample template
              </button>

              {template && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800">Template ready</p>
                  <p className="text-sm text-emerald-700">
                    {template.fileName} · {template.placeholders.length} placeholder(s) detected
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md lg:p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 font-bold text-white shadow-sm">2</span>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Detected Fields</h2>
                  <p className="text-sm text-slate-500">These fields are found automatically from your DOCX template.</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex items-center gap-2 text-blue-700">
                  <span className="material-symbols-outlined text-[18px]">info</span>
                  <span className="text-sm font-medium">These are auto-detected from the template contents.</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {template ? (
                    template.placeholders.map((item) => (
                      <span key={item.name} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 shadow-sm">
                        <span className="material-symbols-outlined text-base">tag</span>
                        {item.name}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-500 shadow-sm">
                      Upload a template to reveal detected placeholders.
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-8 lg:col-span-7" id="generator">
            <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md lg:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 font-bold text-white shadow-sm">3</span>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Fill in the Fields</h2>
                    <p className="text-sm text-slate-500">Populate the detected placeholders and list student names.</p>
                  </div>
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
                    <GenerateButton onClick={handleGenerate} disabled={nameCount === 0} nameCount={nameCount} />
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Please upload a template first to enable the editor and generation tools.
                </div>
              )}
            </section>

            {progress && <ProgressBar progress={progress} />}
            {done && (
              <DownloadCard
                onReset={() => {
                  setTemplate(null);
                  setDone(false);
                  setNames("");
                  setFormValues({});
                  setError(null);
                }}
              />
            )}
          </div>
        </div>

        <section id="templates" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Template Library</h3>
              <p className="text-sm text-slate-500">Choose a built-in layout or load a saved template from this browser.</p>
            </div>
          </div>

          <TemplateSelector
            activeSlot={activeTemplateSlot}
            onSelect={handleLoadPresetTemplate}
            isLoading={isReading && activeTemplateSlot !== null}
          />

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Choose how each certificate page should be separated.</p>
                <p className="text-xs text-slate-500">Switch between landscape and portrait output depending on your template.</p>
              </div>
              <div className="flex rounded-full border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setOutputMode("landscape")}
                  className={`rounded-full px-3 py-1.5 text-sm ${outputMode === "landscape" ? "bg-blue-700 text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode("portrait")}
                  className={`rounded-full px-3 py-1.5 text-sm ${outputMode === "portrait" ? "bg-blue-700 text-white" : "text-slate-600 hover:text-slate-900"}`}
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
                setNames("");
                setDone(false);
                setError(null);
              }}
            />
          </div>
        </section>

        <section id="docs" className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <span className="material-symbols-outlined text-blue-700">description</span>
              Documentation
            </h4>
            <p className="mb-6 text-sm leading-relaxed text-slate-600">
              Use this quick guide to get the most out of the certificate workflow.
            </p>
            <ul className="space-y-4 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="text-xl font-black text-blue-200">01</span>
                <p><span className="font-semibold text-slate-800">Source Integration:</span> Upload a high-fidelity .docx with mapped system tokens.</p>
              </li>
              <li className="flex gap-3">
                <span className="text-xl font-black text-blue-200">02</span>
                <p><span className="font-semibold text-slate-800">Data Injection:</span> Populate the registry using the secure text interface.</p>
              </li>
              <li className="flex gap-3">
                <span className="text-xl font-black text-blue-200">03</span>
                <p><span className="font-semibold text-slate-800">Batch Export:</span> Execute local processing to receive a secured archive.</p>
              </li>
            </ul>
            <a href="https://github.com/crisantohcortes1-commits/AutoCertificationAi" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline">
              <span className="material-symbols-outlined text-[18px]">code</span>
              Open GitHub repository
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <span className="material-symbols-outlined text-blue-700">shield_lock</span>
              Security & Best Practices
            </h4>
            <ul className="space-y-4 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-[22px] text-blue-700">verified</span>
                <p>Leverage “AI Refine” for automated institutional data cleansing.</p>
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-[22px] text-blue-700">verified</span>
                <p>Zero-Trust processing: Names never bypass your local browser sandbox.</p>
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-[22px] text-blue-700">verified</span>
                <p>For institutional fidelity, utilize embedded high-quality system fonts.</p>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="mt-8 w-full border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row lg:px-8">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-blue-700">Lawrence Cortes</span>
              <div className="inline-flex items-center justify-center rounded bg-blue-600 p-1 text-white">
                <span className="material-symbols-outlined text-[14px]">check</span>
              </div>
            </div>
            <p className="text-sm text-slate-500">© 2024 Certificate Maker. Professional Credentialing Suite.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
            <a className="hover:text-blue-700" href="#">Privacy Policy</a>
            <a className="hover:text-blue-700" href="#">Terms of Service</a>
            <a className="hover:text-blue-700" href="#">Support</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
