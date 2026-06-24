
import { AppConfig } from "../types";
import { 
    TRANSLATION_PROMPT_NOTES, 
    TRANSLATION_PROMPT_GLOSSARY_PRINCIPLES, 
    GLOSSARY_OPTIMIZER_ALL_PROMPT,
    GLOSSARY_OPTIMIZER_INCREMENTAL_PROMPT,
    TWO_STEP_BASE_PROMPT,
    FMT_ONE_STEP_GLOSSARY,
    FMT_TWO_STEP_GLOSSARY,
    FMT_TWO_STEP_NO_GLOSSARY,
    FMT_ONE_STEP_NO_GLOSSARY
} from "../prompts";

export class AiService {
  // Safe chunk size to avoid context limits (approx 3000 chars)
  private CHUNK_SIZE = 3000;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Cleans the glossary using Gemini to remove noise and redundancies.
   */
  async optimizeGlossary(glossaryText: string): Promise<string> {
      try {
          const result = await this.generate(`Current Glossary:\n${glossaryText}`, GLOSSARY_OPTIMIZER_ALL_PROMPT, 0.2);
          return result.translation; // translation property holds the text
      } catch (error) {
          console.error("Glossary optimization API call failed:", error);
          throw error;
      }
  }

  /**
   * Cleans newly added terms against a master glossary.
   */
  async optimizeIncrementalGlossary(newTermsText: string, masterGlossaryText: string): Promise<string> {
      try {
          const prompt = `MASTER GLOSSARY:\n${masterGlossaryText || "(Empty)"}\n\nNEW CANDIDATES:\n${newTermsText}`;
          const result = await this.generate(prompt, GLOSSARY_OPTIMIZER_INCREMENTAL_PROMPT, 0.2);
          return result.translation;
      } catch (error) {
          console.error("Incremental glossary optimization failed:", error);
          throw error;
      }
  }

  /**
   * Helper to retry operations with exponential backoff.
   */
  private async retry<T>(
    operation: () => Promise<T>, 
    retries: number = 3, 
    delay: number = 2000
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (retries <= 0) {
          throw error;
      }
      
      const errString = String(error) + (typeof error === 'object' ? JSON.stringify(error) : '');
      const isRateLimit = errString.includes('429');
      const isAuthError = errString.includes('401') || errString.includes('403');

      if (isAuthError) throw error; // Never retry auth errors

      const isEmptyOrBadRequest = errString.includes('400') || errString.includes('empty response');
      
      // Allow exactly 1 retry for empty responses or 400 errors.
      // Since default retries is 3, if retries <= 2, we've already retried once.
      if (isEmptyOrBadRequest && retries <= 2) {
          throw error;
      }

      let nextDelay = delay;

      if (isRateLimit) {
          nextDelay = Math.max(delay * 1.5, 5000);
          console.warn(`Rate limit exceeded (429). Pausing for ${nextDelay}ms... (${retries} attempts left)`);
      } else {
          nextDelay = delay * 2;
          console.warn(`API call failed. Retrying in ${nextDelay}ms... (${retries} attempts left).`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return this.retry(operation, retries - 1, nextDelay);
    }
  }

  /**
   * Splits text into manageable chunks.
   */
  public splitTextIntoChunks(text: string, customSize?: number): string[] {
    const size = customSize || this.CHUNK_SIZE;
    if (!text || text.length <= size) return [text];

    const chunks: string[] = [];
    let currentChunk = '';
    
    const paragraphs = text.split(/\n\n/);

    for (const paragraph of paragraphs) {
      if ((currentChunk.length + paragraph.length + 2) > size) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        if (paragraph.length > size) {
           const lines = paragraph.split('\n');
           let currentLineChunk = '';
           
           for (const line of lines) {
             if ((currentLineChunk.length + line.length + 1) > size) {
                if (currentLineChunk) {
                    chunks.push(currentLineChunk);
                    currentLineChunk = '';
                }
                if (line.length > size) {
                    let remaining = line;
                    while (remaining.length > 0) {
                        chunks.push(remaining.substring(0, size));
                        remaining = remaining.substring(size);
                    }
                } else {
                    currentLineChunk = line;
                }
             } else {
                currentLineChunk += (currentLineChunk ? '\n' : '') + line;
             }
           }
           if (currentLineChunk) chunks.push(currentLineChunk);

        } else {
           currentChunk = paragraph;
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Cleans the model output by removing thinking tags and conversational prefixes.
   * Also extracts translation and glossary if they are wrapped in tags.
   */
  private parseResponse(text: string): { translation: string; glossary?: string } {
    if (!text) return { translation: "" };

    // 1. Remove <think> blocks
    let clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // 2. Try to extract from <translation> and <glossary> tags
    const translationMatch = clean.match(/<translation>([\s\S]*?)<\/translation>/i);
    const glossaryMatch = clean.match(/<glossary>([\s\S]*?)<\/glossary>/i);

    if (translationMatch) {
      let translation = translationMatch[1].trim();
      
      // Post-process: Remove common step headers that models might include inside the tag
      // Matches things like: ### 第二步: ..., [第二步：...], **第二步** etc.
      translation = translation.replace(/^(?:#+\s*|\*+|\[)?第二步[:：\s]*[^]*\n/i, '').trim();
      // Also catch the specific user-reported string if it persists
      translation = translation.replace(/^\[第二步：最终审校润色后的内容\]\s*\n?/i, '').trim();
      
      const glossary = glossaryMatch ? glossaryMatch[1].trim() : undefined;
      return { translation, glossary };
    }

    // Fallback: original cleaning logic if tags are missing
    const codeBlockRegex = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/i;
    const match = clean.match(codeBlockRegex);
    if (match) {
        clean = match[1].trim();
    }

    clean = clean.replace(/^(Here is the translation|Sure|Here is the translated content|Here is the proofread version)[^:\n]*:?\s*/i, '');

    return { translation: clean.trim() };
  }

  /**
   * Generic OpenAI-Compatible Chat Completion
   */
  private async generate(
      prompt: string, 
      systemInstruction: string, 
      temperature: number = 0.3
  ): Promise<{ translation: string; glossary?: string }> {
      const operation = async () => {
        if (!this.config.apiKey) throw new Error("API Key is required.");
        if (!this.config.baseUrl) throw new Error("Base URL is required.");

        let url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
        
        const body = {
            model: this.config.modelName,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt }
            ],
            temperature: temperature
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
             throw new Error("Received empty response from API");
        }
        
        return this.parseResponse(content);
      };

      return this.retry(operation);
  }

  /**
   * Verifies the connection to the configured API.
   */
  async testConnection(): Promise<boolean> {
      try {
          const testPrompt = "Ping";
          const testSystem = "Reply with 'Pong' only.";
          const result = await this.generate(testPrompt, testSystem, 0.1);
          return result.translation.toLowerCase().includes('pong') || result.translation.length > 0;
      } catch (e: any) {
          console.error("Connection Test Failed:", e);
          throw e;
      }
  }

  private parseGlossary(text: string): Record<string, string> {
    const glossaryMap: Record<string, string> = {};
    const lines = text.split('\n');
    lines.forEach(line => {
      // 1. Try structural format: SOURCE: xxx | TARGET: yyy
      const structuralMatch = line.match(/SOURCE:\s*(.*?)\s*\|\s*TARGET:\s*(.*)/i);
      if (structuralMatch) {
          const key = structuralMatch[1].trim();
          const value = structuralMatch[2].trim();
          if (key && value) {
              glossaryMap[key] = value;
              return;
          }
      }

      // 2. Fallback to simple format: Key: Value
      const parts = line.split(':');
      if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join(':').trim();
          if (k && v && !k.toLowerCase().includes('source') && !k.toLowerCase().includes('target')) {
              glossaryMap[k] = v;
          }
      }
    });
    return glossaryMap;
  }

  private glossaryMapToString(map: Record<string, string>): string {
    return Object.entries(map)
      .sort()
      .map(([k, v]) => `SOURCE: ${k} | TARGET: ${v}`)
      .join('\n');
  }

  private mergeGlossary(base: string, delta: string): string {
    const baseMap = this.parseGlossary(base);
    const deltaMap = this.parseGlossary(delta);
    const merged = { ...baseMap, ...deltaMap };
    return this.glossaryMapToString(merged);
  }

  /**
   * Filters a glossary map based on whether terms appear in the text.
   * @param minOccurrences Minimum number of times the term must appear to be kept.
   */
  public filterGlossaryByInclusion(glossaryMap: Record<string, string>, text: string, minOccurrences: number = 1): Record<string, string> {
    const filteredRecord: Record<string, string> = {};
    const lowerText = text.toLowerCase();
    const entries = Object.entries(glossaryMap);

    entries.forEach(([key, value]) => {
      const containsChinese = /[\u4e00-\u9fa5]/.test(key);
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      let count = 0;
      if (containsChinese) {
        // String splitting method to count occurrences in Chinese
        const lowerKey = key.toLowerCase();
        count = text.toLowerCase().split(lowerKey).length - 1;
      } else {
        try {
          // Use global regex to count word boundary matches for non-Chinese text
          const regex = new RegExp(`\\b${escapedKey}\\b`, 'gi');
          const matches = lowerText.match(regex);
          count = matches ? matches.length : 0;
        } catch (e) {
          // Fallback if regex fails for some reason
          const lowerKey = key.toLowerCase();
          count = text.toLowerCase().split(lowerKey).length - 1;
        }
      }

      if (count >= minOccurrences) {
        console.log(`[Glossary] ✅ Term "${key}" kept (found ${count} times).`);
        filteredRecord[key] = value;
      } else {
        console.log(`[Glossary] 🗑️ Term "${key}" dropped (found ${count} times, need ${minOccurrences}).`);
      }
    });

    return filteredRecord;
  }

  /**
   * Performs a two-step cleanup: 
   * 1. Automatic filtering based on text inclusion (min 2 occurrences).
   * 2. AI-based optimization for redundancy and quality.
   * @param referenceText The text to check against (usually posterior text).
   */
  async smartCleanupGlossary(glossaryText: string, referenceText: string): Promise<string> {
    console.log(`[Smart Cleanup] Starting two-step cleanup (Threshold: 2+ occurrences in future text)...`);
    
    // Step 1: Automatic Filter
    const initialMap = this.parseGlossary(glossaryText);
    const initialCount = Object.keys(initialMap).length;
    
    // Manual cleanup uses minOccurrences = 1 as per user request to unify logic
    console.log(`[Smart Cleanup] Step 1: Filtering terms that appear less than 1 time in reference text...`);
    const autoFilteredMap = this.filterGlossaryByInclusion(initialMap, referenceText, 1);
    const autoFilteredCount = Object.keys(autoFilteredMap).length;
    console.log(`[Smart Cleanup] Step 1 complete. Kept ${autoFilteredCount}/${initialCount} terms.`);
    
    const intermediateText = this.glossaryMapToString(autoFilteredMap);
    if (autoFilteredCount === 0) return "";

    // Step 2: AI Optimization
    console.log(`[Smart Cleanup] Step 2: AI optimization for quality and redundancy...`);
    try {
        const optimizedText = await this.optimizeGlossary(intermediateText);
        const finalMap = this.parseGlossary(optimizedText);
        console.log(`[Smart Cleanup] Step 2 complete. AI refined it to ${Object.keys(finalMap).length} terms.`);
        return optimizedText;
    } catch (error) {
        console.warn(`[Smart Cleanup] Step 2 (AI) failed, returning automatically filtered results.`, error);
        return intermediateText;
    }
  }

  /**
   * Filters the delta glossary to only include terms that appear in the posterior text
   * or are already present in the current glossary.
   */
  private filterDeltaGlossary(delta: string, current: string, posteriorText: string): { filtered: string, originalCount: number, filteredCount: number } {
    if (!delta) return { filtered: "", originalCount: 0, filteredCount: 0 };
    if (!posteriorText) {
        const map = this.parseGlossary(delta);
        const count = Object.keys(map).length;
        return { filtered: delta, originalCount: count, filteredCount: count };
    }
    
    const deltaMap = this.parseGlossary(delta);
    const currentMap = this.parseGlossary(current);
    
    const deltaEntries = Object.entries(deltaMap);
    const originalCount = deltaEntries.length;

    if (originalCount > 0) {
      console.log(`[Glossary Filter] AI suggested ${originalCount} potential terms. Checking against future text...`);
    }

    const filteredMap = this.filterGlossaryByInclusion(deltaMap, posteriorText);
    
    // Ensure we keep terms that are already in the current glossary for consistency
    Object.entries(deltaMap).forEach(([key, value]) => {
      if (currentMap[key]) {
        filteredMap[key] = value;
      }
    });

    const filteredCount = Object.keys(filteredMap).length;
    if (originalCount > 0) {
      console.log(`[Glossary Filter] Result: Kept ${filteredCount} out of ${originalCount} suggested terms.`);
    }

    return {
        filtered: this.glossaryMapToString(filteredMap),
        originalCount,
        filteredCount
    };
  }

  async translateContent(
    content: string, 
    targetLanguage: string, 
    systemInstruction: string,
    onProgress?: (current: number, total: number, chunkResult: string, updatedGlossary?: string, isFallback?: boolean, stats?: { originalCount: number, filteredCount: number }) => Promise<void>,
    existingChunks: string[] = [],
    indicesToRetry: number[] = [],
    initialGlossary: string = "",
    fullPosteriorText: string = ""
  ): Promise<{ content: string; glossary: string }> {
    
    const customChunkSize = this.config.enableProofreading ? 1800 : this.CHUNK_SIZE;
    const chunks = this.splitTextIntoChunks(content, customChunkSize);
    const translatedChunks: string[] = [...existingChunks];

    // Ensure array is large enough
    while (translatedChunks.length < chunks.length) {
        translatedChunks.push("");
    }

    let currentGlossary = initialGlossary;

    const isCombinedMode = this.config.enableProofreading;
    
    let glossaryPart = '';
    if (this.config.enableGlossary) {
        glossaryPart = `\n\n${TRANSLATION_PROMPT_GLOSSARY_PRINCIPLES}`;
    }

    let formatInstruction = '';
    if (isCombinedMode) {
        if (this.config.enableGlossary) {
            formatInstruction = FMT_TWO_STEP_GLOSSARY;
        } else {
            formatInstruction = FMT_TWO_STEP_NO_GLOSSARY;
        }
    } else {
        if (this.config.enableGlossary) {
            formatInstruction = FMT_ONE_STEP_GLOSSARY;
        } else {
            formatInstruction = FMT_ONE_STEP_NO_GLOSSARY;
        }
    }

    const baseSystemInstruction = `${systemInstruction}\n\n${TRANSLATION_PROMPT_NOTES}${glossaryPart}\n\n${formatInstruction}`;

    const translateChunk = async (i: number) => {
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const chunk = chunks[i];
        const glossaryPrompt = this.config.enableGlossary 
            ? (currentGlossary 
                ? `\n\nCURRENT GLOSSARY:\n${currentGlossary}`
                : "\n\nCURRENT GLOSSARY: (Empty)")
            : "";

        const chunkInstruction = chunks.length > 1
            ? `${baseSystemInstruction}\n\n[System Note: This is part ${i + 1} of ${chunks.length} of the chapter. Maintain strict terminology and stylistic consistency with previous parts.]${glossaryPrompt}`
            : `${baseSystemInstruction}${glossaryPrompt}`;

        const prompt = `Translate the following Markdown content into ${targetLanguage}. \n\nCONTENT:\n${chunk}`;

        try {
            const result = await this.generate(prompt, chunkInstruction, 0.3);
            translatedChunks[i] = result.translation;
            let deltaGlossary = result.glossary || "";
            let stats = { originalCount: 0, filteredCount: 0 };
            
            // AUTOMATIC FILTERING: If term won't appear in future, don't pollute the glossary
            if (this.config.enableGlossary && deltaGlossary) {
                const chapterPosterior = chunks.slice(i + 1).join('\n');
                const combinedPosterior = chapterPosterior + '\n' + fullPosteriorText;
                const filterResult = this.filterDeltaGlossary(deltaGlossary, currentGlossary, combinedPosterior);
                deltaGlossary = filterResult.filtered;
                stats = { originalCount: filterResult.originalCount, filteredCount: filterResult.filteredCount };
            }

            if (deltaGlossary) {
                currentGlossary = this.mergeGlossary(currentGlossary, deltaGlossary);
            }
            
            if (onProgress) {
                // We pass deltaGlossary to onProgress so UI/DB update can see the new terms
                await onProgress(i + 1, chunks.length, result.translation, deltaGlossary, false, stats);
            }
        } catch (error) {

            if (error instanceof Error && error.message === "PAUSE_SIGNAL") {
                throw error;
            }
            console.error(`Error translating chunk ${i + 1}/${chunks.length}:`, error);
            translatedChunks[i] = chunk;
            if (onProgress) {
                await onProgress(i + 1, chunks.length, chunk, "", true);
            }
        }
    };

    // 1. Resume from where we left off (sequential)
    const startIndex = existingChunks.length > 0 ? existingChunks.findIndex(c => !c) : 0;
    const start = startIndex === -1 ? existingChunks.length : startIndex;

    for (let i = start; i < chunks.length; i++) {
        // Only process if it's empty OR we haven't reached the end of existing chunks
        if (i >= existingChunks.length || !existingChunks[i]) {
            await translateChunk(i);
        }
    }

    // 2. Explicit retries
    for (const i of indicesToRetry) {
        if (i < chunks.length) {
            await translateChunk(i);
        }
    }

    return { 
        content: translatedChunks.join('\n\n'),
        glossary: currentGlossary
    };
  }

  async proofreadContent(
    content: string, 
    instruction: string,
    onProgress?: (current: number, total: number, chunkResult: string, isFallback?: boolean) => Promise<void>,
    existingChunks: string[] = [],
    indicesToRetry: number[] = []
  ): Promise<string> {
    
    const chunks = this.splitTextIntoChunks(content);
    const proofreadChunks: string[] = [...existingChunks];

    while (proofreadChunks.length < chunks.length) {
        proofreadChunks.push("");
    }

    const proofreadChunk = async (i: number) => {
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const chunk = chunks[i];
        const prompt = `Check the following Markdown content. ${instruction}\n\nCONTENT:\n${chunk}`;
        
        try {
            const result = await this.generate(prompt, "You are a specialized proofreading assistant. Return ONLY the proofread Markdown.", 0.1);
            proofreadChunks[i] = result.translation; // result is now an object
            
            if (onProgress) {
                await onProgress(i + 1, chunks.length, result.translation);
            }
        } catch (error) {
            if (error instanceof Error && error.message === "PAUSE_SIGNAL") {
                throw error;
            }
            console.error(`Error proofreading chunk ${i + 1}/${chunks.length}:`, error);
            proofreadChunks[i] = chunk;
            if (onProgress) {
                await onProgress(i + 1, chunks.length, chunk, true);
            }
        }
    };

    const startIndex = existingChunks.length > 0 ? existingChunks.findIndex(c => !c) : 0;
    const start = startIndex === -1 ? existingChunks.length : startIndex;

    for (let i = start; i < chunks.length; i++) {
        if (i >= existingChunks.length || !existingChunks[i]) {
            await proofreadChunk(i);
        }
    }

    for (const i of indicesToRetry) {
        if (i < chunks.length) {
            await proofreadChunk(i);
        }
    }

    return proofreadChunks.join('\n\n');
  }
}
