import {
  VIDEO_CAPTION_COPYWRITING_TYPES,
  VIDEO_CAPTION_TARGET_LANGUAGES,
  VIDEO_CAPTION_VARIATION_IDS,
  type VideoCaptionCopywritingType,
  type VideoCaptionTargetLanguage,
  type VideoCaptionVariationId,
} from '../shared/contracts';

export const CAPTION_TARGET_LANGUAGES = VIDEO_CAPTION_TARGET_LANGUAGES;
export type CaptionTargetLanguage = VideoCaptionTargetLanguage;
export const CAPTION_VARIATION_IDS = VIDEO_CAPTION_VARIATION_IDS;
export type CaptionVariationId = VideoCaptionVariationId;
export type CaptionVariationSelection = 'random' | CaptionVariationId;
export const CAPTION_COPYWRITING_TYPES = VIDEO_CAPTION_COPYWRITING_TYPES;
export type CaptionCopywritingType = VideoCaptionCopywritingType;
export type CaptionCopywritingSelection = 'random' | CaptionCopywritingType;

export const CAPTION_TARGET_LANGUAGE_LABELS: Record<CaptionTargetLanguage, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

export const CAPTION_VARIATION_LABELS: Record<CaptionVariationId, string> = {
  1: '의문/자문형',
  2: '충격 사실 직구형',
  3: '시각/청각 묘사형',
  4: '상황 대조형',
};

export const CAPTION_COPYWRITING_LABELS: Record<CaptionCopywritingType, string> = {
  'field-report': '현장감 중계',
  'calm-analyst': '차분한 미스터리 분석가',
};

export function chooseCaptionVariation(
  selection: CaptionVariationSelection,
  random: () => number = Math.random,
): CaptionVariationId {
  if (selection !== 'random') {
    return selection;
  }

  return CAPTION_VARIATION_IDS[Math.floor(random() * CAPTION_VARIATION_IDS.length)];
}

export function chooseCaptionCopywriting(
  selection: CaptionCopywritingSelection,
  random: () => number = Math.random,
): CaptionCopywritingType {
  if (selection !== 'random') {
    return selection;
  }

  return CAPTION_COPYWRITING_TYPES[Math.floor(random() * CAPTION_COPYWRITING_TYPES.length)];
}
