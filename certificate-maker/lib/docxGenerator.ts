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

    let xmlContent = await file.async("string");

    for (const [rawKey, rawValue] of Object.entries(values)) {
      const key = rawKey.toLowerCase();
      const info = placeholderMap.get(key);
      if (!info) continue;

      const fittedSize = fitFontSize(rawValue, info.availableWidthEmu, info.originalFontSize);
      if (fittedSize === null) {
        throw new Error(`Value "${rawValue}" is too long to fit in the template.`);
      }

      const escapedValue = escapeXml(rawValue);
      xmlContent = xmlContent.replace(new RegExp(`\\{${key}\\}`, "gi"), escapedValue);
      if (fittedSize !== info.originalFontSize) {
        xmlContent = xmlContent.replace(/w:sz="(\d+)"/g, `w:sz="${Math.round(fittedSize * 2)}"`);
      }
    }

    zip.file(filePath, xmlContent);
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
