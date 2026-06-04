export { CodeExtractor } from './code-extractor.js';
export { guessProjectMeta } from './project-meta.js';
export { DocumentGenerator } from './document-generator.js';
export { CodeIntel } from './code-intel.js';
export { writeDocument, type SaveFormat, writeVersionDescription, writeCooperativeAgreement, writeCommissionedContract } from './formatter.js';
export { applyWatermark, validateLicenseKey, WATERMARK_LINE } from './license.js';
export { generateProjectFingerprint } from './fingerprint.js';
export {
  checkProjectLicense,
  writeProjectLicense,
  verifyLicenseKey,
  generateLicenseKeyForFingerprint,
} from './license-manager.js';
export { runGeneratePipeline, type GenerateOptions, type GenerateResult, type GenerateStage, type GenerateMode } from './pipeline.js';
export type {
  CodeAnalysis,
  CodeFile,
  CopyrightDocuments,
  ExtractionResult,
  ProjectAnalysis,
  RuanZhuConfig,
} from './types.js';
export { cleanCodeLocally } from './local-cleaner.js';

