
export interface Chapter {
  id: string;
  index: number; // Added for sorting persistence
  fileName: string;
  title: string;
  content: string; // HTML content
  markdown?: string; // Converted markdown
  translatedMarkdown?: string; // After AI
  translatedChunks?: string[]; // Intermediate translation chunks
  fallbackChunks?: number[]; // Indices of chunks that returned errors/empty
  proofreadMarkdown?: string; // After 2nd pass
  proofreadChunks?: string[]; // Intermediate proofread chunks
  fallbackProofreadChunks?: number[]; // Indices of chunks that returned errors/empty
  isSkippable?: boolean; // Pages to remove completely (Copyright, TOC, Title Page)
  isReference?: boolean; // Pages to keep but NOT translate (References, Notes)
  isTocPoint?: boolean; // Whether this file is an explicit entry in the original TOC
  glossary?: string; // Cumulative glossary up to the end of this chapter
  chunkGlossaries?: string[]; // Glossary state after each chunk
}

export interface ProcessingLog {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'process';
}

export interface SessionState {
  status: AppStatus;
  config: AppConfig;
  progress: number;
  fileName: string;
  coverPath?: string;
  lastUpdated: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  TRANSLATING = 'TRANSLATING',
  PACKAGING = 'PACKAGING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  PAUSED = 'PAUSED'
}

export interface AppConfig {
  // AI Settings
  apiKey: string;
  baseUrl: string;
  modelName: string;
  
  // Translation Settings
  sourceLanguage: string;
  additionalContext: string;
  
  // Toggles
  enableProofreading: boolean;
  useRecommendedPrompts: boolean;
  smartSkip: boolean; // Toggle for skipping non-content pages
  enableGlossary: boolean; // Toggle for terminology system
}
