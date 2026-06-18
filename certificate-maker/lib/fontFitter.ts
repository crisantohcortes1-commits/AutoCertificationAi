const EMU_PER_INCH = 914_400;
const POINTS_PER_INCH = 72;

function estimateTextWidthInches(text: string, fontSizePoints: number): number {
  const AVG_CHAR_WIDTH_RATIO = 0.55;
  return (text.length * fontSizePoints * AVG_CHAR_WIDTH_RATIO) / POINTS_PER_INCH;
}

export function fitFontSize(
  text: string,
  availableWidthEmu: number,
  maxFontSizePt: number,
  MIN_FONT_PT = 8
): number | null {
  const availableWidthInches = availableWidthEmu / EMU_PER_INCH;

  for (let size = maxFontSizePt; size >= MIN_FONT_PT; size--) {
    const estimatedWidth = estimateTextWidthInches(text, size);
    if (estimatedWidth <= availableWidthInches) {
      return size;
    }
  }

  return null;
}
