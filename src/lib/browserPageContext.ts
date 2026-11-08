export const BROWSER_PAGE_HTML_LIMIT = 12000;
export const BROWSER_PAGE_TEXT_LIMIT = 8000;

export function getCaptureBrowserPageTextScript(maxLength = BROWSER_PAGE_TEXT_LIMIT) {
  const parsed = Number(maxLength);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : BROWSER_PAGE_TEXT_LIMIT;
  return `(() => {
    const text = String(document.body && document.body.innerText || document.documentElement && document.documentElement.innerText || '')
      .replace(/\\s+/g, ' ')
      .trim();
    return text.slice(0, ${limit});
  })()`;
}

export function simplifyBrowserPageHtml(html: string, maxLength = BROWSER_PAGE_HTML_LIMIT) {
  const parsed = Number(maxLength);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : BROWSER_PAGE_HTML_LIMIT;
  const text = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n<!-- truncated -->`;
}

export function getCaptureBrowserPageContextScript(maxLength = BROWSER_PAGE_HTML_LIMIT) {
  const parsed = Number(maxLength);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : BROWSER_PAGE_HTML_LIMIT;
  return `(() => {
    const strip = (value) => String(value || '')
      .replace(/<script\\b[\\s\\S]*?<\\/script>/gi, '')
      .replace(/<style\\b[\\s\\S]*?<\\/style>/gi, '')
      .replace(/\\s+/g, ' ')
      .trim();
    let html = document.documentElement ? document.documentElement.outerHTML : '';
    html = strip(html);
    if (html.length > ${limit}) html = html.slice(0, ${limit});
    return { title: String(document.title || ''), html: html };
  })()`;
}
