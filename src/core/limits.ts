/** Shared wire limits. Keep this module free of Node and browser dependencies. */
const MiB = 1024 * 1024;
export const SCENE_LIMITS = Object.freeze({
  maxSceneBytes: 2 * MiB,
  maxSceneElements: 2000,
  maxElementTextChars: 4000,
});
export const IMAGE_LIMITS = Object.freeze({
  maxBytes: 2 * MiB,
  maxDimension: 2048,
  maxBase64Chars: 2_800_000,
});
export const ADVICE_TIMEOUT = Object.freeze({
  minMs: 10_000,
  defaultMs: 90_000,
  maxMs: 180_000,
  responseGraceMs: 5_000,
});
export const ANALYSIS_LIMITS = Object.freeze({maxElements:200,maxElementTextChars:160,maxStructureBytes:48*1024});
const envelopeBytes = 16_384;
export const RPC_LIMITS = Object.freeze({
  envelopeBytes,
  adviceBodyBytes: 3 * MiB + envelopeBytes,
  ordinaryTimeoutMs: 20_000,
});
export function requestBodyLimit(method: string): number {
  if (method === 'advice/generate') return RPC_LIMITS.adviceBodyBytes;
  if (method === 'drawing/save') return SCENE_LIMITS.maxSceneBytes + RPC_LIMITS.envelopeBytes;
  return RPC_LIMITS.envelopeBytes;
}
