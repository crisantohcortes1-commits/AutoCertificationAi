"use client";

import JSZip from "jszip";
import { PlaceholderInfo } from "@/types";

const PLACEHOLDER_REGEX = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/gi;

export function detectOrientation(documentXml: string): "portrait" | "landscape" {
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, "application/xml");
  const pageSize = doc.querySelector("pgSz") || doc.getElementsByTagNameNS("*", "pgSz")[0];

  if (!pageSize) {
    return "portrait";
  }

  const width = Number(pageSize.getAttribute("w:w"));
  const height = Number(pageSize.getAttribute("w:h"));

  if (Number.isFinite(width) && Number.isFinite(height) && width > height) {
    return "landscape";
  }

  return "portrait";
}

export async function parseTemplate(buffer: ArrayBuffer): Promise<PlaceholderInfo[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error("Invalid DOCX: word/document.xml not found.");
  }

  const orientation = detectOrientation(documentXml);
  const found = new Map<string, PlaceholderInfo>();
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, "application/xml");

  const paragraphs = doc.querySelectorAll("p");

  for (const para of Array.from(paragraphs)) {
    let fullText = "";
    for (const run of Array.from(para.querySelectorAll("r"))) {
      for (const t of Array.from(run.querySelectorAll("t"))) {
        fullText += t.textContent || "";
      }
    }

    const matches = Array.from(fullText.matchAll(PLACEHOLDER_REGEX));
    for (const match of matches) {
      const placeholderName = match[1].toLowerCase();
      if (found.has(placeholderName)) continue;

      const firstRun = para.querySelector("r");
      const rPr = firstRun?.querySelector("rPr");
      const pPr = para.querySelector("pPr");
      const fontSize = rPr?.querySelector("sz")?.getAttribute("w:val");
      const fontFamily = rPr?.querySelector("rFonts")?.getAttribute("w:ascii") || "Calibri";
      const bold = !!rPr?.querySelector("b");
      const italic = !!rPr?.querySelector("i");
      const underline = !!rPr?.querySelector("u");
      const justification = pPr?.querySelector("jc")?.getAttribute("w:val") || "left";

      let alignment: "left" | "center" | "right" = "left";
      if (justification === "center") alignment = "center";
      if (justification === "right") alignment = "right";

      found.set(placeholderName, {
        name: placeholderName,
        originalFontSize: fontSize ? parseInt(fontSize, 10) / 2 : 24,
        fontFamily,
        bold,
        italic,
        underline,
        alignment,
        availableWidthEmu: orientation === "landscape" ? 8_229_600 : 5_486_400,
        availableHeightEmu: 914_400,
        orientation,
      });
    }
  }

  return Array.from(found.values());
}

export function findPlaceholderNames(xmlContent: string): string[] {
  const matches = Array.from(xmlContent.matchAll(PLACEHOLDER_REGEX));
  return Array.from(new Set(matches.map((m) => m[1].toLowerCase())));
}
