const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function removeBlankPageArtifacts(document: Document): void {
  const body = document.getElementsByTagNameNS(WORD_NAMESPACE, "body")[0] ?? document.getElementsByTagNameNS("*", "body")[0];

  if (!body) {
    return;
  }

  const children = Array.from(body.childNodes);
  const cleanedChildren: ChildNode[] = [];
  let hasSeenContent = false;
  let previousWasBlank = false;
  let previousWasPageBreak = false;

  children.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = child as Element;

    if (element.localName !== "p") {
      cleanedChildren.push(child);
      hasSeenContent = true;
      previousWasBlank = false;
      previousWasPageBreak = false;
      return;
    }

    const isPageBreakParagraph = containsPageBreak(element);
    const isBlankParagraph = isEmptyParagraph(element);

    if (isPageBreakParagraph) {
      cleanedChildren.push(child);
      hasSeenContent = true;
      previousWasBlank = false;
      previousWasPageBreak = true;
      return;
    }

    if (isBlankParagraph) {
      if (!hasSeenContent || previousWasBlank || previousWasPageBreak) {
        return;
      }

      cleanedChildren.push(child);
      previousWasBlank = true;
      previousWasPageBreak = false;
      return;
    }

    cleanedChildren.push(child);
    hasSeenContent = true;
    previousWasBlank = false;
    previousWasPageBreak = false;
  });

  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  cleanedChildren.forEach((child) => body.appendChild(child));
}

function containsPageBreak(element: Element): boolean {
  return Array.from(element.getElementsByTagNameNS(WORD_NAMESPACE, "br")).some((br) => {
    const type = br.getAttributeNS(WORD_NAMESPACE, "type") ?? br.getAttribute("w:type") ?? br.getAttribute("type");
    return type === "page";
  });
}

function isEmptyParagraph(element: Element): boolean {
  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "sectPr").length > 0) {
    return false;
  }

  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "t").length > 0) {
    const hasText = Array.from(element.getElementsByTagNameNS(WORD_NAMESPACE, "t")).some((textNode) => {
      return (textNode.textContent ?? "").trim().length > 0;
    });

    if (hasText) {
      return false;
    }
  }

  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "drawing").length > 0) {
    return false;
  }

  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "tbl").length > 0) {
    return false;
  }

  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "hyperlink").length > 0) {
    return false;
  }

  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "bookmarkStart").length > 0 || element.getElementsByTagNameNS(WORD_NAMESPACE, "bookmarkEnd").length > 0) {
    return false;
  }

  if (element.getElementsByTagNameNS(WORD_NAMESPACE, "r").length > 0) {
    const hasActualRuns = Array.from(element.getElementsByTagNameNS(WORD_NAMESPACE, "r")).some((run) => {
      return run.getElementsByTagNameNS(WORD_NAMESPACE, "t").length > 0 || run.getElementsByTagNameNS(WORD_NAMESPACE, "drawing").length > 0;
    });

    if (hasActualRuns) {
      return false;
    }
  }

  return true;
}
