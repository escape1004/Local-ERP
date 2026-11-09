export function isOsFileDrag(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes('Files');
}

export function isLikelyDirectoryFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (file.type) return false;
  const name = String(file.name || '').trim();
  if (!name) return true;
  return file.size === 0 && !name.includes('.');
}

export function pickDroppedRecordFile<T extends Pick<File, 'name' | 'size' | 'type'>>(files: T[]) {
  return files.find((file) => file?.name && !isLikelyDirectoryFile(file)) ?? null;
}

export function toStoredRecordFilePath(selectedPath: string, appRoot: string) {
  if (!selectedPath || !appRoot || !selectedPath.startsWith(appRoot)) {
    return selectedPath;
  }
  return selectedPath.slice(appRoot.length).replace(/^[\\/]+/, '');
}

export function findDroppedRecordId(target: EventTarget | null) {
  if (!target || typeof (target as Element).closest !== 'function') return null;
  const recordId = (target as Element).closest('[data-record-id]')?.getAttribute('data-record-id')?.trim();
  return recordId || null;
}
