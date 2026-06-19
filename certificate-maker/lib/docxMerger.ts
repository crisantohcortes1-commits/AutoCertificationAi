"use client";

import JSZip from "jszip";
import { saveAs } from "file-saver";
import { removeBlankPageArtifacts } from "@/lib/docxBlankPageCleaner";

export interface CertificateEntry {
  name: string;
  buffer: ArrayBuffer;
}

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Returns the direct-child <w:sectPr> of the given body element.
 *
 * WHY NOT getElementsByTagNameNS:
 *   After the first merge iteration, we insert a <w:p><w:pPr><w:sectPr> (continuous
 *   section break paragraph) before the final sectPr. On the next iteration,
 *   getElementsByTagNameNS finds that *nested* sectPr first instead of the body-level
 *   one, so insertBefore throws NotFoundError because it's not a direct child of body.
 *
 *   We must walk only direct children to always get the right node.
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

export async function buildAndDownloadMergedDocx(entries: CertificateEntry[]): Promise<void> {
  if (entries.length === 0) {
    throw new Error("No certificates to merge");
  }

  const baseZip = await JSZip.loadAsync(entries[0].buffer);
  const baseDocumentXml = await baseZip.file("word/document.xml")?.async("string");

  if (!baseDocumentXml) {
    throw new Error("Invalid base DOCX file");
  }

  const parser = new DOMParser();
  const baseDocument = parser.parseFromString(baseDocumentXml, "application/xml");
  const baseBody = baseDocument.getElementsByTagNameNS("*", "body")[0];

  if (!baseBody) {
    throw new Error("Invalid DOCX body structure");
  }

  for (let i = 1; i < entries.length; i++) {
    const currentZip = await JSZip.loadAsync(entries[i].buffer);
    const currentDocumentXml = await currentZip.file("word/document.xml")?.async("string");

    if (!currentDocumentXml) continue;

    const currentDocument = parser.parseFromString(currentDocumentXml, "application/xml");
    const currentBody = currentDocument.getElementsByTagNameNS("*", "body")[0];

    if (!currentBody) continue;

    // ✅ Re-query on every iteration, and only look at DIRECT children of baseBody
    //    so we never accidentally find the sectPr nested inside a continuous-break paragraph
    const sectionBreak = getBodyLevelSectPr(baseBody);
    const sectionBreakParagraph = createContinuousSectionBreakParagraph(baseDocument, sectionBreak);

    // Insert a continuous section break before the final sectPr
    // (needed for every certificate after the first, to separate pages without blank pages)
    if (sectionBreak) {
      baseBody.insertBefore(sectionBreakParagraph, sectionBreak);
    } else {
      baseBody.appendChild(sectionBreakParagraph);
    }

    // Move all content nodes from the current certificate into the base body,
    // placing them before the final sectPr (preserves page settings at the end)
    const childrenToMove = Array.from(currentBody.childNodes).filter(
      (child) =>
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).localName !== "sectPr"
    );

    // Re-query sectionBreak again after inserting sectionBreakParagraph,
    // because insertBefore doesn't change sectionBreak's position but it's
    // safer to always have a fresh reference before the inner insertBefore calls
    const finalSectPr = getBodyLevelSectPr(baseBody);

    childrenToMove.forEach((child) => {
      const importedChild = baseDocument.importNode(child, true);
      if (finalSectPr) {
        baseBody.insertBefore(importedChild, finalSectPr);
      } else {
        baseBody.appendChild(importedChild);
      }
    });

    // Strip any sectPr that came in with the current certificate's body
    // (we only want the one final sectPr at the end of the merged document)
    const incomingSectionBreaks = currentBody.getElementsByTagNameNS("*", "sectPr");
    while (incomingSectionBreaks.length > 0) {
      incomingSectionBreaks[0].parentNode?.removeChild(incomingSectionBreaks[0]);
    }
  }

  removeBlankPageArtifacts(baseDocument);

  const mergedDocumentXml = new XMLSerializer().serializeToString(baseDocument);
  baseZip.file("word/document.xml", mergedDocumentXml);

  const mergedBlob = await baseZip.generateAsync({ type: "blob" });
  saveAs(mergedBlob, "Certificates.docx");
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

  // Remove any existing <w:type> so we can set our own
  const existingTypes = Array.from(sectPr.getElementsByTagNameNS(WORD_NAMESPACE, "type"));
  existingTypes.forEach((typeElement) => {
    typeElement.parentNode?.removeChild(typeElement);
  });

  // Make this section flow continuously (no blank page before the next certificate)
  const typeElement = document.createElementNS(WORD_NAMESPACE, "w:type");
  typeElement.setAttribute("w:val", "continuous");
  sectPr.insertBefore(typeElement, sectPr.firstChild);

  pPr.appendChild(sectPr);
  paragraph.appendChild(pPr);

  return paragraph;
}