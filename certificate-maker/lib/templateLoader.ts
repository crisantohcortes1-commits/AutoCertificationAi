export async function loadTemplateFile(path: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load template from ${path}`);
  }

  const blob = await response.blob();
  const fileName = path.split("/").pop() ?? "template.docx";
  return new File([blob], fileName, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
