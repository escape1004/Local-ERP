import { format, isValid, parse } from "date-fns"

export const DEFAULT_DATE_PARSE_FORMATS = [
  "yyyy-MM-dd",
  "yyyy.MM.dd",
  "yyyy. MM. dd",
  "yyyy/MM/dd",
  "MM/dd/yyyy",
  "MM-dd-yyyy",
  "yy-MM-dd",
  "yy.MM.dd",
  "yy/MM/dd",
  "yyyy-MM",
  "yyyy.MM",
  "yyyy/MM",
  "yyyy년 M월 d일",
  "yy년 M월 d일",
  "yyyyMMdd",
  "yyMMdd",
] as const;

const normalizeDateParseFormat = (dateFormat: string) => dateFormat
  .trim()
  .replace(/Y/g, "y")
  .replace(/D/g, "d");

const getStoredDateOutputFormat = (dateFormat: string) => (
  /d/.test(normalizeDateParseFormat(dateFormat)) ? "yyyy-MM-dd" : "yyyy-MM"
);

const getDateParseFormats = (customFormats: string[] = []) => {
  const seen = new Set<string>();
  const configuredFormats = customFormats.length > 0 ? customFormats : [...DEFAULT_DATE_PARSE_FORMATS];
  return configuredFormats
    .map(normalizeDateParseFormat)
    .filter((dateFormat) => {
      if (!dateFormat || seen.has(dateFormat)) return false;
      seen.add(dateFormat);
      return true;
    });
};

const SUPPORTED_YEAR_MONTH_FORMATS = [
  /^(\d{4})-(\d{1,2})$/,
  /^(\d{4})\.(\d{1,2})$/,
  /^(\d{4})\/(\d{1,2})$/,
  /^(\d{4})년\s*(\d{1,2})월$/,
] as const;

const SUPPORTED_KOREAN_DATE_PATTERNS = [
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/,
  /^(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일$/,
] as const;

const DATE_CANDIDATE_PATTERNS = [
  /\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일)?/,
  /\d{2}년\s*\d{1,2}월(?:\s*\d{1,2}일)?/,
  /\d{4}[-./]\d{1,2}[-./]\d{1,2}/,
  /\d{2}[-./]\d{1,2}[-./]\d{1,2}/,
  /\d{4}[-./]\d{1,2}/,
  /\d{8}/,
  /\d{6}/,
];

export const stripTimeFromDateText = (inputValue: string) => {
  const value = String(inputValue || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';

  const koreanDate = value.match(/^(\d{2,4}년\s*\d{1,2}월(?:\s*\d{1,2}일)?)/);
  if (koreanDate) return koreanDate[1].replace(/\s+/g, ' ').trim();

  const withoutClock = value.replace(
    /(?:[T\s,]+|\s+)(?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}|UTC|오전|오후|AM|PM))?.*$/i,
    '',
  );
  if (withoutClock !== value) return withoutClock.trim();

  return value
    .replace(/\s*(?:오전|오후)\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?(?:\s*\d{1,2}\s*초)?.*$/i, '')
    .replace(/\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?(?:\s*\d{1,2}\s*초)?.*$/i, '')
    .trim();
};

export const extractDateLikeText = (inputValue: string) => {
  const stripped = stripTimeFromDateText(inputValue);
  for (const pattern of DATE_CANDIDATE_PATTERNS) {
    const match = stripped.match(pattern);
    if (match) return match[0];
  }
  return stripped;
};

export const parseFlexibleDateValue = (inputValue: string, customFormats: string[] = []): string | null => {
  const trimmedValue = stripTimeFromDateText(inputValue);

  if (!trimmedValue) {
    return "";
  }

  for (const pattern of SUPPORTED_YEAR_MONTH_FORMATS) {
    const match = trimmedValue.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return `${yearStr}-${monthStr.padStart(2, "0")}`;
    }

    return null;
  }

  for (const pattern of SUPPORTED_KOREAN_DATE_PATTERNS) {
    const match = trimmedValue.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr, dayStr] = match;
    const year = yearStr.length === 2 ? parseInt(`20${yearStr}`, 10) : parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);
    const parsedDate = new Date(year, month, day);

    if (isValid(parsedDate)) {
      return format(parsedDate, "yyyy-MM-dd");
    }

    return null;
  }

  const twoDigitYearPatterns = [
    /^(\d{2})-(\d{1,2})-(\d{1,2})$/,
    /^(\d{2})\.(\d{1,2})\.(\d{1,2})$/,
    /^(\d{2})\/(\d{1,2})\/(\d{1,2})$/,
  ];

  for (const pattern of twoDigitYearPatterns) {
    const match = trimmedValue.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr, dayStr] = match;
    const year = parseInt(`20${yearStr}`, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);
    const parsedDate = new Date(year, month, day);

    if (isValid(parsedDate)) {
      return format(parsedDate, "yyyy-MM-dd");
    }

    return null;
  }

  for (const dateFormat of getDateParseFormats(customFormats)) {
    try {
      const parsedDate = parse(trimmedValue, dateFormat, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, getStoredDateOutputFormat(dateFormat));
      }
    } catch {
      // Invalid custom date-fns format tokens are ignored.
    }
  }

  if (/^\d{6,8}$/.test(trimmedValue)) {
    const year = trimmedValue.length === 8
      ? parseInt(trimmedValue.substring(0, 4), 10)
      : parseInt(`20${trimmedValue.substring(0, 2)}`, 10);
    const month = parseInt(trimmedValue.substring(trimmedValue.length - 4, trimmedValue.length - 2), 10) - 1;
    const day = parseInt(trimmedValue.substring(trimmedValue.length - 2), 10);
    const parsedDate = new Date(year, month, day);

    if (isValid(parsedDate)) {
      return format(parsedDate, "yyyy-MM-dd");
    }
  }

  return null;
};

const DATE_STORAGE_FORMAT = 'yyyy-MM-dd';
const YEAR_MONTH_STORAGE_FORMAT = 'yyyy-MM';

export const isStoredDateValue = (value: string) => {
  const parsedFullDate = parse(value, DATE_STORAGE_FORMAT, new Date());
  if (isValid(parsedFullDate) && format(parsedFullDate, DATE_STORAGE_FORMAT) === value) {
    return true;
  }

  const parsedYearMonth = parse(value, YEAR_MONTH_STORAGE_FORMAT, new Date());
  return isValid(parsedYearMonth) && format(parsedYearMonth, YEAR_MONTH_STORAGE_FORMAT) === value;
};
