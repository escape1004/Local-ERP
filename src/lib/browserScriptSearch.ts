export type ScriptSearchChunk = {
  text: string;
  match: boolean;
};

export function splitScriptSearchChunks(source: string, query: string): ScriptSearchChunk[] {
  const text = String(source || '');
  const needle = String(query || '').trim();
  if (!text) return [];
  if (!needle) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const chunks: ScriptSearchChunk[] = [];
  let index = 0;
  while (index < text.length) {
    const found = lower.indexOf(target, index);
    if (found < 0) {
      chunks.push({ text: text.slice(index), match: false });
      break;
    }
    if (found > index) chunks.push({ text: text.slice(index, found), match: false });
    chunks.push({ text: text.slice(found, found + needle.length), match: true });
    index = found + needle.length;
  }
  return chunks;
}
