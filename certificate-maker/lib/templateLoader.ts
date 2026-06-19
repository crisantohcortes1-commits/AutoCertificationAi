export async function loadTemplateFile(path: string): Promise<File> {
  const resolvedPath = path.startsWith("http")
    ? path
    : new URL(path.replace(/^\/+/, ""), typeof window !== "undefined" ? window.location.href : "http://localhost").toString();

  const response = await fetch(resolvedPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load template from ${resolvedPath}`);
  }

  const blob = await response.blob();
  const fileName = path.split("/").pop() ?? "template.docx";
  return new File([blob], fileName, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
