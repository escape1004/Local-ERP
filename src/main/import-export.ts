import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import {
  appDataDir,
  db,
  getCurrentProfileIdOrThrow,
  normalizeImportedDateValue,
} from './store';
import { resolveRecordFileSystemPath } from './lib/files';
import {
  createDefaultRecordData,
  getHeaderFieldMap,
  normalizePercentageImportValue,
  parseArrayImportValue,
  parseBooleanImportValue,
  parseImportedFieldValue as parseImportedFieldValueCore,
  parsePercentageImportPart,
  resolveImportedRelationValue
} from './lib/import-values';

export {
  createDefaultRecordData,
  getHeaderFieldMap,
  normalizePercentageImportValue,
  parseArrayImportValue,
  parseBooleanImportValue,
  parsePercentageImportPart,
  resolveImportedRelationValue
};

export function parseImportedFieldValue(field, rawValue) {
  return parseImportedFieldValueCore(field, rawValue, normalizeImportedDateValue);
}

export function checkDuplicateFields(categoryId, data, existingRecordId = null, profileId = getCurrentProfileIdOrThrow()) {
  const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }

  const fields = JSON.parse(category.fields);
  const uniqueFields = fields.filter(field => field.unique);

  if (uniqueFields.length === 0) {
    return true;
  }

  for (const field of uniqueFields) {
    const fieldValue = data[field.id];
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      continue;
    }

    let query = `
      SELECT id FROM records
      WHERE categoryId = ?
      AND profileId = ?
      AND json_extract(data, '$.${field.id}') = ?
    `;
    let params = [categoryId, profileId, String(fieldValue)];

    if (existingRecordId) {
      query += ' AND id != ?';
      params.push(existingRecordId);
    }

    const duplicate = db.prepare(query).get(...params);
    if (duplicate) {
      throw new Error(`중복된 값이 존재합니다: ${field.name}`);
    }
  }

  return true;
}

export const IMPORT_EXPORT_BATCH_SIZE = 1000;

export function sanitizeFileName(name) {
  return String(name || 'category').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'category';
}

export function sanitizeExcelSheetName(name) {
  const sanitized = String(name || 'Records')
    .replace(/[\[\]\*\/\\\:\?]/g, '_')
    .trim();
  return (sanitized || 'Records').slice(0, 31);
}

export function ensureUniqueSheetName(baseName, usedNames) {
  const initialName = sanitizeExcelSheetName(baseName);
  if (!usedNames.has(initialName)) {
    usedNames.add(initialName);
    return initialName;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixLabel = ` (${suffix})`;
    const candidate = `${initialName.slice(0, Math.max(0, 31 - suffixLabel.length))}${suffixLabel}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  throw new Error('Unable to allocate a unique Excel sheet name.');
}

export function getCategoryOrThrow(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  return {
    ...category,
    fields: JSON.parse(category.fields)
  };
}

export function getCategoryRecordsForProfile(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare(`
    SELECT id, categoryId, data, createdAt, updatedAt, duration, thumbnailPath, thumbnailTimestamp
    FROM records
    WHERE categoryId = ? AND profileId = ?
    ORDER BY createdAt DESC
  `).all(categoryId, profileId).map((record) => ({
    ...record,
    data: JSON.parse(record.data)
  }));
}

export function getCategoryExportSubtree(rootCategoryId, profileId = getCurrentProfileIdOrThrow()) {
  const categories = db.prepare(`
    SELECT id, name, parentId, fields, order_num, createdAt, updatedAt
    FROM categories
    WHERE profileId = ?
    ORDER BY order_num ASC, createdAt ASC
  `).all(profileId).map((category) => ({
    ...category,
    fields: JSON.parse(category.fields)
  }));

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const rootCategory = categoriesById.get(rootCategoryId);
  if (!rootCategory) {
    throw new Error(`Category not found: ${rootCategoryId}`);
  }

  const childrenByParentId = new Map();
  categories.forEach((category) => {
    const key = category.parentId || '__root__';
    if (!childrenByParentId.has(key)) {
      childrenByParentId.set(key, []);
    }
    childrenByParentId.get(key).push(category);
  });

  const orderedCategories = [];
  const visit = (category, pathNames) => {
    const currentPathNames = [...pathNames, category.name];
    orderedCategories.push({
      ...category,
      exportPathNames: currentPathNames
    });

    const children = childrenByParentId.get(category.id) || [];
    children.forEach((child) => visit(child, currentPathNames));
  };

  visit(rootCategory, []);
  return orderedCategories;
}

export function getDashboardWarnings(previewLimit = 8, profileId = getCurrentProfileIdOrThrow()) {
  const normalizedPreviewLimit = Number.isFinite(Number(previewLimit))
    ? Math.max(0, Number(previewLimit))
    : 8;

  const categories = db.prepare(`
    SELECT id, name, fields, order_num
    FROM categories
    WHERE profileId = ?
    ORDER BY order_num ASC, createdAt ASC
  `).all(profileId).map((category) => ({
    ...category,
    fields: JSON.parse(category.fields)
  }));

  const records = db.prepare(`
    SELECT id, categoryId, data, createdAt
    FROM records
    WHERE profileId = ?
    ORDER BY createdAt DESC
  `).all(profileId).map((record) => ({
    ...record,
    data: JSON.parse(record.data)
  }));

  const recordsByCategoryId = new Map();
  const recordIdsByCategoryId = new Map();

  records.forEach((record) => {
    if (!recordsByCategoryId.has(record.categoryId)) {
      recordsByCategoryId.set(record.categoryId, []);
      recordIdsByCategoryId.set(record.categoryId, new Set());
    }
    recordsByCategoryId.get(record.categoryId).push(record);
    recordIdsByCategoryId.get(record.categoryId).add(record.id);
  });

  const items = [];
  const counts = {
    missingFiles: 0,
    brokenRelations: 0
  };

  const pushPreviewItem = (item) => {
    if (items.length < normalizedPreviewLimit) {
      items.push(item);
    }
  };

  categories.forEach((category) => {
    const categoryRecords = recordsByCategoryId.get(category.id) || [];
    const fileField = category.fields.find((field) => field.type === 'file');
    const relationFields = category.fields.filter((field) => field.type === 'relation' && field.relationCategoryId);
    const displayField = category.fields.find((field) => field.type === 'text') || category.fields[0];

    categoryRecords.forEach((record) => {
      const displayValue = displayField && record.data[displayField.id]
        ? String(record.data[displayField.id])
        : `${new Date(record.createdAt).toLocaleDateString('ko-KR')} 레코드`;

      if (fileField && !fileField.thumbnailOnly) {
        const resolvedPath = resolveRecordFileSystemPath(record.data[fileField.id], fileField, appDataDir);
        if (resolvedPath) {
          let exists = false;
          try {
            exists = fs.existsSync(resolvedPath);
          } catch (_error) {
            exists = false;
          }

          if (!exists) {
            counts.missingFiles += 1;
            pushPreviewItem({
              id: `missing-file-${record.id}`,
              categoryId: category.id,
              recordId: record.id,
              title: '원본 파일 누락',
              description: `${category.name} / ${displayValue}`,
              type: 'missing-file'
            });
          }
        }
      }

      relationFields.forEach((relationField) => {
        const relatedCategoryId = relationField.relationCategoryId;
        if (!relatedCategoryId) return;

        const relatedRecordIds = recordIdsByCategoryId.get(relatedCategoryId) || new Set();
        const rawValue = record.data[relationField.id];

        if (relationField.multiple && Array.isArray(rawValue)) {
          const missingCount = rawValue.filter((relatedId) => !relatedRecordIds.has(String(relatedId))).length;
          if (missingCount > 0) {
            counts.brokenRelations += 1;
            pushPreviewItem({
              id: `broken-relation-${record.id}-${relationField.id}`,
              categoryId: category.id,
              recordId: record.id,
              title: '관계 참조 깨짐',
              description: `${category.name} / ${displayValue} (${missingCount}개 누락)`,
              type: 'broken-relation'
            });
          }
          return;
        }

        if (rawValue && !relatedRecordIds.has(String(rawValue))) {
          counts.brokenRelations += 1;
          pushPreviewItem({
            id: `broken-relation-${record.id}-${relationField.id}`,
            categoryId: category.id,
            recordId: record.id,
            title: '관계 참조 깨짐',
            description: `${category.name} / ${displayValue}`,
            type: 'broken-relation'
          });
        }
      });
    });
  });

  return {
    totalCount: counts.missingFiles + counts.brokenRelations,
    counts,
    items
  };
}

export function getRelationKeyField(relatedCategory, relationField) {
  if (!relatedCategory || !Array.isArray(relatedCategory.fields)) return null;

  const displayField = relationField?.displayFieldId
    ? relatedCategory.fields.find((field) => field.id === relationField.displayFieldId)
    : null;

  if (displayField?.unique) {
    return displayField;
  }

  const uniqueField = relatedCategory.fields.find((field) => field.unique);
  if (uniqueField) {
    return uniqueField;
  }

  if (displayField) {
    return displayField;
  }

  return relatedCategory.fields.find((field) => field.type !== 'file' && field.type !== 'relation')
    || relatedCategory.fields[0]
    || null;
}

export function buildRelationResolvers(fields, profileId = getCurrentProfileIdOrThrow()) {
  const resolvers = new Map();

  fields
    .filter((field) => field.type === 'relation' && field.relationCategoryId)
    .forEach((field) => {
      const relatedCategory = getCategoryOrThrow(field.relationCategoryId, profileId);
      const relatedRecords = getCategoryRecordsForProfile(field.relationCategoryId, profileId);
      const keyField = getRelationKeyField(relatedCategory, field);
      const displayField = field.displayFieldId
        ? relatedCategory.fields.find((candidate) => candidate.id === field.displayFieldId)
        : relatedCategory.fields[0] || null;

      const lookup = new Map();

      relatedRecords.forEach((record) => {
        const candidates = [];
        if (keyField) {
          candidates.push(record.data[keyField.id]);
        }
        if (displayField && (!keyField || displayField.id !== keyField.id)) {
          candidates.push(record.data[displayField.id]);
        }
        candidates.push(record.id);

        candidates.forEach((candidate) => {
          if (candidate === undefined || candidate === null || candidate === '') return;
          const normalized = String(candidate).trim().toLowerCase();
          if (!normalized) return;
          if (!lookup.has(normalized)) {
            lookup.set(normalized, []);
          }
          lookup.get(normalized).push(record.id);
        });
      });

      resolvers.set(field.id, {
        field,
        relatedCategory,
        relatedRecords,
        keyField,
        displayField,
        lookup
      });
    });

  return resolvers;
}

export function getRelationExportValue(field, value, relationResolvers) {
  const resolver = relationResolvers.get(field.id);
  if (!resolver) {
    return field.multiple ? JSON.stringify(Array.isArray(value) ? value : []) : String(value ?? '');
  }

  const toRelationIdValue = (recordId) => {
    const relatedRecord = resolver.relatedRecords.find((record) => record.id === recordId);
    if (!relatedRecord) {
      return String(recordId ?? '');
    }
    return relatedRecord.id;
  };

  if (field.multiple) {
    const relationValues = Array.isArray(value) ? value.map(toRelationIdValue).filter(Boolean) : [];
    return JSON.stringify(relationValues);
  }

  return toRelationIdValue(value);
}

export function getExcelHeaderLabel(field) {
  return `${field.name}${field.type === 'relation' ? '*' : ''}`;
}

export function getExportHeaders(category, excelMode = false) {
  return [
    '고유키',
    ...category.fields.map((field) => (excelMode ? getExcelHeaderLabel(field) : field.name))
  ];
}

export function getExportRowValues(category, record, relationResolvers) {
  return [
    record.id,
    ...category.fields.map((field) => (
      field.type === 'relation'
        ? getRelationExportValue(field, record.data[field.id], relationResolvers)
        : serializeExportValue(field, record.data[field.id])
    ))
  ];
}

export function getExcelColumnWidth(field, header, values) {
  const maxLength = values.reduce((max, value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return Math.max(max, text.length);
  }, String(header || '').length);

  const minWidthByType = {
    checkbox: 12,
    date: 14,
    number: 12,
    relation: 18,
    file: 24
  };
  const minWidth = minWidthByType[field?.type] || 12;
  return Math.min(Math.max(maxLength + 4, minWidth), 48);
}

export function buildDiscordStyleSheetXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color rgb="FFDCDDDE"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="12"/><color rgb="FFF2F3F5"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFB5BAC1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF5865F2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF313338"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2B2D31"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF1E1F22"/></left>
      <right style="thin"><color rgb="FF1E1F22"/></right>
      <top style="thin"><color rgb="FF1E1F22"/></top>
      <bottom style="thin"><color rgb="FF1E1F22"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;
}

export function applyDiscordExcelStyling(buffer, options) {
  const sheetDimensions = Array.isArray(options?.sheetDimensions)
    ? options.sheetDimensions
    : [{
        recordColumnCount: options?.recordColumnCount || 1,
        recordRowCount: options?.recordRowCount || 1
      }];
  const zip = new AdmZip(buffer);
  const stylesPath = 'xl/styles.xml';
  sheetDimensions.forEach((sheetDimension, index) => {
    const recordsSheetPath = `xl/worksheets/sheet${index + 1}.xml`;
    if (!zip.getEntry(recordsSheetPath)) {
      return;
    }

    const recordsSheetXml = zip.readAsText(recordsSheetPath);
    const lastCellRef = XLSX.utils.encode_cell({
      c: Math.max((sheetDimension?.recordColumnCount || 1) - 1, 0),
      r: Math.max((sheetDimension?.recordRowCount || 1) - 1, 0)
    });
    const autoFilterRef = `A1:${XLSX.utils.encode_cell({ c: Math.max((sheetDimension?.recordColumnCount || 1) - 1, 0), r: 0 })}`;

    let styledRecordsSheetXml = recordsSheetXml.replace(
      '<sheetView workbookViewId="0"/>',
      '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>'
    );

    styledRecordsSheetXml = styledRecordsSheetXml.replace(
      /<row r="1">([\s\S]*?)<\/row>/,
      (_match, rowContent) => {
        const styledRow = rowContent.replace(/<c r="([A-Z]+1)"/g, '<c r="$1" s="1"');
        return `<row r="1" ht="24" customHeight="1">${styledRow}</row>`;
      }
    );

    styledRecordsSheetXml = styledRecordsSheetXml.replace(
      /<row r="([2-9]\d*)">([\s\S]*?)<\/row>/g,
      (_match, rowNumber, rowContent) => {
        const styleId = Number(rowNumber) % 2 === 0 ? '2' : '3';
        const styledRow = rowContent.replace(/<c r="([A-Z]+\d+)"/g, `<c r="$1" s="${styleId}"`);
        return `<row r="${rowNumber}" ht="22" customHeight="1">${styledRow}</row>`;
      }
    );

    if (!styledRecordsSheetXml.includes('<autoFilter ')) {
      styledRecordsSheetXml = styledRecordsSheetXml.replace(
        '</sheetData>',
        `</sheetData><autoFilter ref="${autoFilterRef}"/>`
      );
    }

    styledRecordsSheetXml = styledRecordsSheetXml.replace(
      /<ignoredError numberStoredAsText="1" sqref="[^"]*"\/>/,
      `<ignoredError numberStoredAsText="1" sqref="A1:${lastCellRef}"/>`
    );

    zip.updateFile(recordsSheetPath, Buffer.from(styledRecordsSheetXml, 'utf8'));
  });

  zip.updateFile(stylesPath, Buffer.from(buildDiscordStyleSheetXml(), 'utf8'));
  return zip.toBuffer();
}

export function serializeExportValue(field, value) {
  if (value === null || value === undefined) return '';
  if (field?.multiple || Array.isArray(value)) {
    return JSON.stringify(Array.isArray(value) ? value : [value]);
  }
  if (field?.type === 'checkbox') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function escapeCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCategoryRecordsCsvContent(category, records) {
  const relationResolvers = buildRelationResolvers(category.fields);
  const headers = getExportHeaders(category, false);
  const lines = [headers.map((header) => escapeCsvCell(header)).join(',')];

  records.forEach((record) => {
    const row = getExportRowValues(category, record, relationResolvers)
      .map((value) => escapeCsvCell(value))
      .join(',');
    lines.push(row);
  });

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function appendCategoryRecordsWorksheet(workbook, sheetName, category, records) {
  const relationResolvers = buildRelationResolvers(category.fields);
  const headers = getExportHeaders(category, true);
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);

  for (let index = 0; index < records.length; index += IMPORT_EXPORT_BATCH_SIZE) {
    const batch = records.slice(index, index + IMPORT_EXPORT_BATCH_SIZE).map((record) => (
      getExportRowValues(category, record, relationResolvers)
    ));
    XLSX.utils.sheet_add_aoa(worksheet, batch, { origin: -1 });
  }

  worksheet['!cols'] = [
    {
      wch: getExcelColumnWidth(
        { type: 'text' },
        headers[0],
        records.map((record) => record.id)
      )
    },
    ...category.fields.map((field, index) => ({
      wch: getExcelColumnWidth(
        field,
        headers[index + 1],
        records.map((record) => (
          field.type === 'relation'
            ? getRelationExportValue(field, record.data[field.id], relationResolvers)
            : serializeExportValue(field, record.data[field.id])
        ))
      )
    }))
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return {
    recordColumnCount: headers.length,
    recordRowCount: records.length + 1
  };
}

export function getUniqueFieldValueSets(categoryId, uniqueFields, profileId = getCurrentProfileIdOrThrow()) {
  const uniqueValueSets = new Map();

  for (const field of uniqueFields) {
    const rows = db.prepare(`
      SELECT json_extract(data, '$.${field.id}') AS value
      FROM records
      WHERE categoryId = ?
        AND profileId = ?
        AND json_extract(data, '$.${field.id}') IS NOT NULL
    `).all(categoryId, profileId);

    const values = new Set();
    rows.forEach((row) => {
      if (row.value !== '') {
        values.add(String(row.value));
      }
    });
    uniqueValueSets.set(field.id, values);
  }

  return uniqueValueSets;
}

export const insertImportedRecordsBatch = db.transaction((recordsToInsert) => {
  const stmt = db.prepare(`
    INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt, duration, thumbnailTimestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const record of recordsToInsert) {
    stmt.run(
      record.id,
      record.profileId,
      record.categoryId,
      JSON.stringify(record.data),
      record.createdAt,
      record.updatedAt,
      record.duration ?? null,
      record.thumbnailTimestamp ?? null
    );
  }
});

export async function exportCategoryRecordsToCsv(filePath, category, records) {
  const writeChunk = (stream, chunk) => new Promise<void>((resolve, reject) => {
    const handleError = (error) => reject(error);
    stream.once('error', handleError);
    const canContinue = stream.write(chunk);
    if (canContinue) {
      stream.off('error', handleError);
      resolve();
      return;
    }
    stream.once('drain', () => {
      stream.off('error', handleError);
      resolve();
    });
  });

  await new Promise(async (resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    try {
      await writeChunk(stream, buildCategoryRecordsCsvContent(category, records));

      stream.end();
    } catch (error) {
      stream.destroy();
      reject(error);
    }
  });
}

export function exportCategoryRecordsToExcel(filePath, category, records) {
  const workbook = XLSX.utils.book_new();
  const sheetDimension = appendCategoryRecordsWorksheet(workbook, 'Records', category, records);
  const workbookBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  });
  const styledBuffer = applyDiscordExcelStyling(workbookBuffer, {
    sheetDimensions: [sheetDimension]
  });
  fs.writeFileSync(filePath, styledBuffer);
}

export function readImportRowsFromFile(filePath) {
  const workbook = XLSX.readFile(filePath, {
    raw: true,
    dense: true,
    cellDates: true
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: true
  });
}

export function importCategoryRecordsFromRows(categoryId, fields, rows, profileId = getCurrentProfileIdOrThrow()) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const headerFieldMap = getHeaderFieldMap(fields);
  const uniqueFields = fields.filter((field) => field.unique);
  const uniqueValueSets = getUniqueFieldValueSets(categoryId, uniqueFields, profileId);
  const relationResolvers = buildRelationResolvers(fields, profileId);
  const now = new Date().toISOString();

  let importedCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;
  let unresolvedRelationCount = 0;
  const duplicateFields = new Set();
  let pendingBatch = [];

  const flushPendingBatch = () => {
    if (pendingBatch.length === 0) return;
    insertImportedRecordsBatch(pendingBatch);
    pendingBatch = [];
  };

  for (const row of normalizedRows) {
    const recordData = createDefaultRecordData(fields);
    let hasAnyValue = false;

    for (const [header, rawValue] of Object.entries(row)) {
      const field = headerFieldMap.get(String(header).trim().toLowerCase());
      if (!field) continue;

      const relationResult = field.type === 'relation'
        ? resolveImportedRelationValue(field, rawValue, relationResolvers)
        : null;
      const parsedValue = relationResult
        ? relationResult.value
        : parseImportedFieldValue(field, rawValue);

      if (relationResult) {
        unresolvedRelationCount += relationResult.unresolvedCount;
      }

      recordData[field.id] = parsedValue;

      if (
        parsedValue !== '' &&
        parsedValue !== null &&
        parsedValue !== undefined &&
        !(Array.isArray(parsedValue) && parsedValue.length === 0) &&
        !(field.type === 'checkbox' && parsedValue === false)
      ) {
        hasAnyValue = true;
      }
    }

    if (!hasAnyValue) {
      skippedCount += 1;
      continue;
    }

    let isDuplicate = false;
    for (const field of uniqueFields) {
      const value = recordData[field.id];
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const normalizedValue = String(value);
      const valueSet = uniqueValueSets.get(field.id);
      if (valueSet && valueSet.has(normalizedValue)) {
        isDuplicate = true;
        duplicateFields.add(field.name);
        break;
      }
    }

    if (isDuplicate) {
      duplicateCount += 1;
      continue;
    }

    const recordId = crypto.randomUUID();
    const record = {
      id: recordId,
      profileId,
      categoryId,
      data: recordData,
      createdAt: now,
      updatedAt: now,
      duration: null
    };

    pendingBatch.push(record);
    importedCount += 1;

    for (const field of uniqueFields) {
      const value = recordData[field.id];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      uniqueValueSets.get(field.id)?.add(String(value));
    }

    if (pendingBatch.length >= IMPORT_EXPORT_BATCH_SIZE) {
      flushPendingBatch();
    }
  }

  flushPendingBatch();

  return {
    importedCount,
    duplicateCount,
    skippedCount,
    unresolvedRelationCount,
    duplicateFields: Array.from(duplicateFields)
  };
}
