import type { DataRecord, NewRecord } from '../types';

export type DeletedRecordSnapshot = {
  record: DataRecord;
  relatedRecordIds: string[];
};

export function createDeletedRecordSnapshot(
  record: DataRecord,
  relatedRecordIds: string[] = [],
): DeletedRecordSnapshot {
  return {
    record: {
      ...record,
      data: { ...record.data },
    },
    relatedRecordIds: [...relatedRecordIds],
  };
}

export function buildDeletedRecordRestorePayload(snapshot: DeletedRecordSnapshot): NewRecord {
  return {
    id: snapshot.record.id,
    categoryId: snapshot.record.categoryId,
    data: snapshot.record.data,
    createdAt: snapshot.record.createdAt,
    updatedAt: snapshot.record.updatedAt,
    relatedRecordIds: snapshot.relatedRecordIds,
  };
}
