export interface PlaceholderInfo {
  name: string;
  originalFontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: "left" | "center" | "right";
  availableWidthEmu: number;
  availableHeightEmu: number;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  fileName: string;
  rawDocxBuffer: ArrayBuffer;
  placeholders: PlaceholderInfo[];
  uploadedAt: number;
}

export interface FormValues {
  [placeholderName: string]: string;
}

export interface GenerationResult {
  status: "success" | "error";
  name: string;
  errorMessage?: string;
}

export interface GenerationProgress {
  total: number;
  completed: number;
  current: string;
  results: GenerationResult[];
}
