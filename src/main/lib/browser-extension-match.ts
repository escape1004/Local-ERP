import { canonicalizeBrowserUrl } from './browser-url';

type RecordHit = {
  id?: string;
  label?: string;
  urls?: string[];
};

type BookmarkItem = {
  id?: string;
  source?: string;
  title?: string;
  url?: string;
};

export function matchBookmarkSources({
  url,
  records = [],
  items = [],
}: {
  url: string;
  records?: RecordHit[];
  items?: BookmarkItem[];
}) {
  const canonical = canonicalizeBrowserUrl(url);
  const recordHits = Array.isArray(records) ? records : [];
  const manuals = !canonical
    ? []
    : items.filter((item) => (
      String(item.source || '') === 'manual'
      && (canonicalizeBrowserUrl(String(item.url || '')) || item.url) === canonical
    ));

  return {
    record: recordHits.length > 0,
    manual: manuals.length > 0,
    records: recordHits,
    manuals: manuals.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
    })),
  };
}
