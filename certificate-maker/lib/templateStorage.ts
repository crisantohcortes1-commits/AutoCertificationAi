"use client";

import { CertificateTemplate } from "@/types";

const STORAGE_KEY = "certificate_maker_templates";
const MAX_STORED_TEMPLATES = 1;

function getAll(): CertificateTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(templates: CertificateTemplate[]): void {
  if (typeof window === "undefined") return;

  const trimmedTemplates = templates.slice(-MAX_STORED_TEMPLATES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedTemplates));
  } catch {
    // Ignore quota/storage errors so the app keeps working without surfacing a fake failure.
  }
}

export function saveTemplate(template: CertificateTemplate): void {
  const existing = getAll().filter((t) => t.id !== template.id);
  const serialized = {
    ...template,
    rawDocxBuffer: arrayBufferToBase64(template.rawDocxBuffer),
  };
  saveAll([...existing, serialized as unknown as CertificateTemplate]);
}

export function loadTemplates(): CertificateTemplate[] {
  return getAll().map((t) => ({
    ...t,
    rawDocxBuffer: base64ToArrayBuffer((t as unknown as { rawDocxBuffer: string }).rawDocxBuffer),
  }));
}

export function deleteTemplate(id: string): void {
  saveAll(getAll().filter((t) => t.id !== id));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
