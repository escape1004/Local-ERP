export const PAGE_TRANSLATE_CHUNK_CHARS = 3500;
export const PAGE_TRANSLATE_MAX_CHARS = 12000;

export function packPageTranslateChunks(texts: string[], maxChars = PAGE_TRANSLATE_CHUNK_CHARS) {
  const parsed = Number(maxChars);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : PAGE_TRANSLATE_CHUNK_CHARS;
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 2;
  texts.forEach((text) => {
    const value = String(text ?? '');
    const extra = JSON.stringify(value).length + (current.length ? 1 : 0);
    if (current.length > 0 && size + extra > limit) {
      chunks.push(current);
      current = [value];
      size = 2 + JSON.stringify(value).length;
      return;
    }
    current.push(value);
    size += extra;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function parseTranslatedStringList(raw: unknown, expectedLength: number) {
  const expected = Math.max(0, Number(expectedLength) || 0);
  const text = String(raw || '').trim();
  if (!text || expected <= 0) return null;
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed) || parsed.length !== expected) continue;
      return parsed.map((item) => String(item ?? ''));
    } catch {
      // try the next candidate
    }
  }
  if (expected === 1) return [text];
  return null;
}

export function getCollectPageTranslateTextsScript(maxChars = PAGE_TRANSLATE_MAX_CHARS) {
  const parsed = Number(maxChars);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : PAGE_TRANSLATE_MAX_CHARS;
  return `(() => {
    const skip = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|CODE|PRE|KBD|SVG|CANVAS)$/i;
    const nodes = [];
    const texts = [];
    let total = 0;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || skip.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script,style,noscript,textarea,input,select,[contenteditable="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        const value = String(node.nodeValue || '').replace(/\\s+/g, ' ').trim();
        if (!value) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const value = String(node.nodeValue || '');
      if (total + value.length > ${limit} && texts.length > 0) break;
      if (node.__erpOrig == null) node.__erpOrig = node.nodeValue;
      nodes.push(node);
      texts.push(String(node.__erpOrig || ''));
      total += value.length;
    }
    window.__erpTranslateNodes = nodes;
    return texts;
  })()`;
}

export function getApplyPageTranslationsScript(translations: string[]) {
  return `(() => {
    const translated = ${JSON.stringify(translations)};
    const nodes = window.__erpTranslateNodes;
    if (!Array.isArray(nodes) || !Array.isArray(translated)) return false;
    nodes.forEach((node, index) => {
      if (!node || translated[index] == null) return;
      node.nodeValue = String(translated[index]);
    });
    return true;
  })()`;
}

export function getRestorePageTranslateScript() {
  return `(() => {
    const nodes = window.__erpTranslateNodes;
    if (!Array.isArray(nodes)) return false;
    nodes.forEach((node) => {
      if (node && node.__erpOrig != null) node.nodeValue = node.__erpOrig;
    });
    return true;
  })()`;
}
