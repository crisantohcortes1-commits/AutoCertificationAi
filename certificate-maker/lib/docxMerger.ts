"use client";

import JSZip from "jszip";
import { saveAs } from "file-saver";

export interface CertificateEntry {
  name: string;
  buffer: ArrayBuffer;
}

export async function buildAndDownloadMergedDocx(entries: CertificateEntry[]): Promise<void> {
  if (entries.length === 0) {
    throw new Error("No certificates to merge");
  }

  // Load the first certificate as the base
  const baseZip = await JSZip.loadAsync(entries[0].buffer);
  let mergedDocumentXml = await baseZip.file("word/document.xml")?.async("string");
  
  if (!mergedDocumentXml) {
    throw new Error("Invalid base DOCX file");
  }

  // For each subsequent certificate, append its content with a page break
  for (let i = 1; i < entries.length; i++) {
    const currentZip = await JSZip.loadAsync(entries[i].buffer);
    const currentDocumentXml = await currentZip.file("word/document.xml")?.async("string");
    
    if (!currentDocumentXml) continue;

    // Extract the body content from each document
    const insertPageBreak = i < entries.length ? "\n<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>\n" : "";
    
    // Insert the page break and new content before closing </w:body>
    mergedDocumentXml = mergedDocumentXml.replace(
      /<\/w:body>/,
      `${insertPageBreak}${extractBodyContent(currentDocumentXml)}</w:body>`
    );
  }

  // Update the merged document in the base ZIP
  baseZip.file("word/document.xml", mergedDocumentXml);

  // Generate the final DOCX blob and download
  const mergedBlob = await baseZip.generateAsync({ type: "blob" });
  saveAs(mergedBlob, "Certificates.docx");
}

function extractBodyContent(documentXml: string): string {
  // Extract content between <w:body> tags, excluding the tags themselves
  const bodyMatch = documentXml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) {
    return "";
  }
  
  const bodyContent = bodyMatch[1];
  
  // Remove the first paragraph if it's empty or contains only spacing
  return bodyContent.replace(/<w:p>[\s\S]*?<\/w:p>/, "").trim();
}
