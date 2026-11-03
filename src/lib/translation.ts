export const TRANSLATED_FIELD_SUFFIX = '__translated';
export const TRANSLATION_META_FIELD_SUFFIX = '__translationMeta';
export const OPENAI_TRANSLATION_MODEL = 'gpt-6-luna';
export const OPENAI_TRANSLATION_MODELS = [
  {
    value: OPENAI_TRANSLATION_MODEL,
    label: 'GPT-6 Luna (권장)',
    description: '번역 품질과 처리 비용의 균형이 좋은 기본 모델',
  },
  {
    value: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    description: '이전에 권장하던 모델입니다. 이미 사용 중이라면 그대로 둘 수 있습니다.',
  },
] as const;

type TranslationCapableField = {
  type: string;
  enableTranslation?: boolean;
};

export type TranslationMeta = {
  provider: 'openai';
  model: string;
  autoTranslated: boolean;
  targetLanguage: string;
  translatedAt: string;
};

export const getTranslatedFieldId = (fieldId: string) => `${fieldId}${TRANSLATED_FIELD_SUFFIX}`;

export const getTranslationMetaFieldId = (fieldId: string) => `${fieldId}${TRANSLATION_META_FIELD_SUFFIX}`;

export const isTranslationSupportedField = (field: TranslationCapableField) => (
  field.type === 'text' || field.type === 'longtext'
);

export const isTranslationEnabledField = (field: TranslationCapableField) => (
  isTranslationSupportedField(field) && Boolean(field.enableTranslation)
);

export const getTranslatedFieldValue = (
  recordData: Record<string, unknown> | null | undefined,
  fieldId: string
) => {
  const translatedValue = recordData?.[getTranslatedFieldId(fieldId)];
  return typeof translatedValue === 'string' ? translatedValue : '';
};

export type TranslationDisplayMode = 'tooltip' | 'inline-hover';
export const DEFAULT_TRANSLATION_DISPLAY_MODE: TranslationDisplayMode = 'tooltip';

export const normalizeTranslationDisplayMode = (value: unknown): TranslationDisplayMode => (
  value === 'inline-hover' ? 'inline-hover' : DEFAULT_TRANSLATION_DISPLAY_MODE
);

export const getTranslationMeta = (
  recordData: Record<string, unknown> | null | undefined,
  fieldId: string
) => {
  const meta = recordData?.[getTranslationMetaFieldId(fieldId)];
  return meta && typeof meta === 'object' ? (meta as TranslationMeta) : null;
};
