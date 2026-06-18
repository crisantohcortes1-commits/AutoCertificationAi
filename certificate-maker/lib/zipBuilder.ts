"use client";

import JSZip from "jszip";
import { saveAs } from "file-saver";

export interface CertificateEntry {
  name: string;
  buffer: ArrayBuffer;
}

export async function buildAndDownloadSingleDocx(entries: CertificateEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const firstBuffer = entries[0].buffer;
  const zip = await JSZip.loadAsync(firstBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error("The generated DOCX is missing word/document.xml.");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, "application/xml");
  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const body = doc.querySelector("body") ?? doc.querySelector("w\\:body");

  if (!body) {
    throw new Error("Could not locate the main document body.");
  }

  for (let i = 1; i < entries.length; i++) {
    const nextBuffer = await JSZip.loadAsync(entries[i].buffer);
    const nextXml = await nextBuffer.file("word/document.xml")?.async("string");
    if (!nextXml) continue;

    const nextDoc = parser.parseFromString(nextXml, "application/xml");
    const nextBody = nextDoc.querySelector("body") ?? nextDoc.querySelector("w\\:body");
    if (!nextBody) continue;

    const pageBreak = doc.createElementNS(namespace, "w:p");
    const pageBreakRun = doc.createElementNS(namespace, "w:r");
    const pageBreakBr = doc.createElementNS(namespace, "w:br");
    pageBreakBr.setAttribute("w:type", "page");
    pageBreakRun.appendChild(pageBreakBr);
    pageBreak.appendChild(pageBreakRun);
    body.appendChild(pageBreak);

    Array.from(nextBody.childNodes).forEach((child) => {
      const adopted = doc.adoptNode(child.cloneNode(true) as Node);
      body.appendChild(adopted);
    });
  }

  const combinedXml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", combinedXml);

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "Certificates.docx");
}
