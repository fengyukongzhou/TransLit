
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
}

export interface ProcessingLog {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'process';
}

export enum AppStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  TRANSLATING = 'TRANSLATING',
  PROOFREADING = 'PROOFREADING',
  PACKAGING = 'PACKAGING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface AppConfig {
  // AI Settings
  apiKey: string;
  baseUrl: string;
  modelName: string;
  
  // Translation Settings
  targetLanguage: string;
  systemInstruction: string;
  proofreadInstruction: string;
  
  // Toggles
  enableProofreading: boolean;
  useRecommendedPrompts: boolean;
  smartSkip: boolean; // Toggle for skipping non-content pages
}
