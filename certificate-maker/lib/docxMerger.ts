"use client";

import JSZip from "jszip";
import { saveAs } from "file-saver";
import { removeBlankPageArtifacts } from "@/lib/docxBlankPageCleaner";

export interface CertificateEntry {
  name: string;
  buffer: ArrayBuffer;
}

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// ─── Shared helper ────────────────────────────────────────────────────────────

/**
 * Returns only the direct-child <w:sectPr> of body.
 * getElementsByTagNameNS searches the whole subtree and on i=2+ finds the
 * nested sectPr we already inserted inside a continuous-break paragraph,
 * causing insertBefore to throw NotFoundError.
 */
function getBodyLevelSectPr(body: Element): Element | null {
  for (const child of Array.from(body.childNodes)) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child as Element).localName === "sectPr"
    ) {
      return child as Element;
    }
  }
  return null;
}

// ─── LANDSCAPE merge ─────────────────────────────────────────────────────────
// Uses continuous section breaks to avoid blank pages between landscape pages.

export async function buildAndDownloadMergedDocx(
  entries: CertificateEntry[]
): Promise<void> {
  if (entries.length === 0) throw new Error("No certificates to merge");

  const baseZip = await JSZip.loadAsync(entries[0].buffer);
  const baseDocumentXml = await baseZip.file("word/document.xml")?.async("string");
  if (!baseDocumentXml) throw new Error("Invalid base DOCX file");

  const parser = new DOMParser();
  const baseDocument = parser.parseFromString(baseDocumentXml, "application/xml");
  const baseBody = baseDocument.getElementsByTagNameNS("*", "body")[0];
  if (!baseBody) throw new Error("Invalid DOCX body structure");

  for (let i = 1; i < entries.length; i++) {
    const currentZip = await JSZip.loadAsync(entries[i].buffer);
    const currentDocumentXml = await currentZip.file("word/document.xml")?.async("string");
    if (!currentDocumentXml) continue;

    const currentDocument = parser.parseFromString(currentDocumentXml, "application/xml");
    const currentBody = currentDocument.getElementsByTagNameNS("*", "body")[0];
    if (!currentBody) continue;

    // Re-query every iteration — direct children only, never nested
    const sectionBreak = getBodyLevelSectPr(baseBody);
    const sectionBreakParagraph = createContinuousSectionBreakParagraph(baseDocument, sectionBreak);

    if (sectionBreak) {
      baseBody.insertBefore(sectionBreakParagraph, sectionBreak);
    } else {
      baseBody.appendChild(sectionBreakParagraph);
    }

    const finalSectPr = getBodyLevelSectPr(baseBody);

    const childrenToMove = Array.from(currentBody.childNodes).filter(
      (child) =>
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).localName !== "sectPr"
    );

    childrenToMove.forEach((child) => {
      const importedChild = baseDocument.importNode(child, true);
      if (finalSectPr) {
        baseBody.insertBefore(importedChild, finalSectPr);
      } else {
        baseBody.appendChild(importedChild);
      }
    });

    // Strip sectPr nodes that came with this certificate — we only want one at the end
    const incomingSectionBreaks = currentBody.getElementsByTagNameNS("*", "sectPr");
    while (incomingSectionBreaks.length > 0) {
      incomingSectionBreaks[0].parentNode?.removeChild(incomingSectionBreaks[0]);
    }
  }

  removeBlankPageArtifacts(baseDocument);

  const mergedDocumentXml = new XMLSerializer().serializeToString(baseDocument);
  baseZip.file("word/document.xml", mergedDocumentXml);

  const mergedBlob = await baseZip.generateAsync({ type: "blob" });
  saveAs(mergedBlob, "Certificates_Landscape.docx");
}

function createContinuousSectionBreakParagraph(
  document: Document,
  sectionBreak: Element | null
): Element {
  const paragraph = document.createElementNS(WORD_NAMESPACE, "w:p");
  const pPr = document.createElementNS(WORD_NAMESPACE, "w:pPr");
  const sectPr = sectionBreak
    ? (sectionBreak.cloneNode(true) as Element)
    : document.createElementNS(WORD_NAMESPACE, "w:sectPr");

  const existingTypes = Array.from(sectPr.getElementsByTagNameNS(WORD_NAMESPACE, "type"));
  existingTypes.forEach((t) => t.parentNode?.removeChild(t));

  const typeElement = document.createElementNS(WORD_NAMESPACE, "w:type");
  typeElement.setAttribute("w:val", "continuous");
  sectPr.insertBefore(typeElement, sectPr.firstChild);

  pPr.appendChild(sectPr);
  paragraph.appendChild(pPr);

  return paragraph;
}

// ─── PORTRAIT merge ──────────────────────────────────────────────────────────
// Portrait does NOT use continuous sections — that was squishing everything onto
// one page. Instead we insert an explicit page-break paragraph between certificates
// and keep each certificate's content separate. The final sectPr from the base
// document stays at the end to preserve page size/margins.

export async function buildAndDownloadMergedDocxPortrait(
  entries: CertificateEntry[]
): Promise<void> {
  if (entries.length === 0) throw new Error("No certificates to merge");

  const baseZip = await JSZip.loadAsync(entries[0].buffer);
  const baseDocumentXml = await baseZip.file("word/document.xml")?.async("string");
  if (!baseDocumentXml) throw new Error("Invalid base DOCX file");

  const parser = new DOMParser();
  const baseDocument = parser.parseFromString(baseDocumentXml, "application/xml");
  const baseBody = baseDocument.getElementsByTagNameNS("*", "body")[0];
  if (!baseBody) throw new Error("Invalid DOCX body structure");

  for (let i = 1; i < entries.length; i++) {
    const currentZip = await JSZip.loadAsync(entries[i].buffer);
    const currentDocumentXml = await currentZip.file("word/document.xml")?.async("string");
    if (!currentDocumentXml) continue;

    const currentDocument = parser.parseFromString(currentDocumentXml, "application/xml");
    const currentBody = currentDocument.getElementsByTagNameNS("*", "body")[0];
    if (!currentBody) continue;

    // Find the body-level sectPr — use direct-child lookup, same fix as landscape
    const finalSectPr = getBodyLevelSectPr(baseBody);

    // Insert an explicit page break paragraph before the next certificate.
    // This keeps each certificate on its own page without using continuous sections
    // (which was the bug causing everything to mush onto one page).
    const pageBreakParagraph = createPageBreakParagraph(baseDocument);
    if (finalSectPr) {
      baseBody.insertBefore(pageBreakParagraph, finalSectPr);
    } else {
      baseBody.appendChild(pageBreakParagraph);
    }

    // Move all content nodes from the current certificate into the base body
    const childrenToMove = Array.from(currentBody.childNodes).filter(
      (child) =>
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).localName !== "sectPr"
    );

    // Re-query after inserting page break paragraph
    const currentFinalSectPr = getBodyLevelSectPr(baseBody);

    childrenToMove.forEach((child) => {
      const importedChild = baseDocument.importNode(child, true);
      if (currentFinalSectPr) {
        baseBody.insertBefore(importedChild, currentFinalSectPr);
      } else {
        baseBody.appendChild(importedChild);
      }
    });

    // Remove any sectPr that came with this certificate's body
    const incomingSectionBreaks = currentBody.getElementsByTagNameNS("*", "sectPr");
    while (incomingSectionBreaks.length > 0) {
      incomingSectionBreaks[0].parentNode?.removeChild(incomingSectionBreaks[0]);
    }
  }

  removeBlankPageArtifacts(baseDocument);

  const mergedDocumentXml = new XMLSerializer().serializeToString(baseDocument);
  baseZip.file("word/document.xml", mergedDocumentXml);

  const mergedBlob = await baseZip.generateAsync({ type: "blob" });
  saveAs(mergedBlob, "Certificates_Portrait.docx");
}

/**
 * Creates a paragraph containing an explicit Word page break (<w:lastRenderedPageBreak>).
 * This forces the next certificate onto a new page in portrait mode without
 * using section breaks (which cause the "mushed together" issue).
 */
function createPageBreakParagraph(document: Document): Element {
  const paragraph = document.createElementNS(WORD_NAMESPACE, "w:p");
  const run = document.createElementNS(WORD_NAMESPACE, "w:r");
  const br = document.createElementNS(WORD_NAMESPACE, "w:br");
  br.setAttributeNS(WORD_NAMESPACE, "w:type", "page");
  run.appendChild(br);
  paragraph.appendChild(run);
  return paragraph;
}