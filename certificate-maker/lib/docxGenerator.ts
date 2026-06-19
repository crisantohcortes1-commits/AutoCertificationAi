"use client";

import JSZip from "jszip";
import { PlaceholderInfo } from "@/types";
import { fitFontSize } from "@/lib/fontFitter";

export async function generateCertificate(
  templateBuffer: ArrayBuffer,
  values: Record<string, string>,
  placeholders: PlaceholderInfo[]
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const placeholderMap = new Map(placeholders.map((p) => [p.name.toLowerCase(), p]));
  const targetFiles = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];

  for (const filePath of targetFiles) {
    const file = zip.file(filePath);
    if (!file) continue;

    const xmlContent = await file.async("string");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const serializer = new XMLSerializer();

    for (const [rawKey, rawValue] of Object.entries(values)) {
      const key = rawKey.toLowerCase();
      const info = placeholderMap.get(key);
      if (!info) continue;

      const fittedSize = fitFontSize(rawValue, info.availableWidthEmu, info.originalFontSize);
      const effectiveSize = fittedSize ?? 8;
      const escapedValue = escapeXml(rawValue);
      const placeholderPattern = new RegExp(`\\{${key}\\}`, "i");
      const replacementPattern = new RegExp(`\\{${key}\\}`, "gi");

      for (const textNode of Array.from(xmlDoc.querySelectorAll("t"))) {
        const textContent = textNode.textContent ?? "";
        if (!placeholderPattern.test(textContent)) continue;

        textNode.textContent = textContent.replace(replacementPattern, escapedValue);

        const run = textNode.parentElement;
        if (!run) continue;

        let runProperties = run.querySelector("rPr");
        if (!runProperties && fittedSize !== info.originalFontSize) {
          runProperties = xmlDoc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:rPr");
          run.appendChild(runProperties);
        }

        if (!runProperties) continue;

        if (fittedSize !== info.originalFontSize) {
          let sizeElement = runProperties.querySelector("sz");
          if (!sizeElement) {
            sizeElement = xmlDoc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:sz");
            runProperties.appendChild(sizeElement);
          }
          sizeElement.setAttribute("w:val", String(Math.round(effectiveSize * 2)));

          let sizeCsElement = runProperties.querySelector("szCs");
          if (!sizeCsElement) {
            sizeCsElement = xmlDoc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:szCs");
            runProperties.appendChild(sizeCsElement);
          }
          sizeCsElement.setAttribute("w:val", String(Math.round(effectiveSize * 2)));
        }
      }
    }

    zip.file(filePath, serializer.serializeToString(xmlDoc));
  }

  return await zip.generateAsync({ type: "arraybuffer" });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
