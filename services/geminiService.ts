
import { AppConfig } from "../types";

export class AiService {
  // Safe chunk size to avoid context limits (approx 3000 chars)
  private CHUNK_SIZE = 3000;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
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
      // Don't retry on Auth errors, Bad Request, or Empty Response
      const isFatal = errString.includes('401') || errString.includes('403') || errString.includes('400') || errString.includes('empty response');

      if (isFatal) throw error;

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
  private splitTextIntoChunks(text: string): string[] {
    if (!text || text.length <= this.CHUNK_SIZE) return [text];

    const chunks: string[] = [];
    let currentChunk = '';
    
    const paragraphs = text.split(/\n\n/);

    for (const paragraph of paragraphs) {
      if ((currentChunk.length + paragraph.length + 2) > this.CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        if (paragraph.length > this.CHUNK_SIZE) {
           const lines = paragraph.split('\n');
           let currentLineChunk = '';
           
           for (const line of lines) {
             if ((currentLineChunk.length + line.length + 1) > this.CHUNK_SIZE) {
                if (currentLineChunk) {
                    chunks.push(currentLineChunk);
                    currentLineChunk = '';
                }
                if (line.length > this.CHUNK_SIZE) {
                    let remaining = line;
                    while (remaining.length > 0) {
                        chunks.push(remaining.substring(0, this.CHUNK_SIZE));
                        remaining = remaining.substring(this.CHUNK_SIZE);
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
   */
  private cleanResponse(text: string): string {
    if (!text) return "";

    // 1. Remove <think> blocks (Common in thinking models like Gemini 2.0/3.0/DeepSeek)
    let clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // 2. Remove markdown code block wrappers
    const codeBlockRegex = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/i;
    const match = clean.match(codeBlockRegex);
    if (match) {
        clean = match[1].trim();
    }

    // 3. Remove conversational preambles
    clean = clean.replace(/^(Here is the translation|Sure|Here is the translated content|Here is the proofread version)[^:\n]*:?\s*/i, '');

    return clean.trim();
  }

  /**
   * Generic OpenAI-Compatible Chat Completion
   */
  private async generate(
      prompt: string, 
      systemInstruction: string, 
      temperature: number = 0.3
  ): Promise<string> {
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
        
        return this.cleanResponse(content);
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
          return result.toLowerCase().includes('pong') || result.length > 0;
      } catch (e: any) {
          console.error("Connection Test Failed:", e);
          throw e;
      }
  }

  async translateContent(
    content: string, 
    targetLanguage: string, 
    systemInstruction: string,
    onProgress?: (current: number, total: number, chunkResult: string, isFallback?: boolean) => Promise<void>,
    existingChunks: string[] = []
  ): Promise<string> {
    
    const chunks = this.splitTextIntoChunks(content);
    const translatedChunks: string[] = [...existingChunks];

    const baseSystemInstruction = `${systemInstruction}\n\nIMPORTANT: Return ONLY the translated Markdown content. No conversational text.`;

    // Resume from the next chunk
    for (let i = existingChunks.length; i < chunks.length; i++) {
        // Report progress (start)
        if (onProgress) {
            // We pass empty string for result here just to notify start
            // But actually, onProgress is better used AFTER completion to save.
            // Let's assume the caller handles UI updates separately or we add a separate callback.
            // For simplicity, we'll just log start here if needed, but the main goal is SAVING.
        }

        // Add polite delay for rate limits
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const chunk = chunks[i];
        
        const chunkInstruction = chunks.length > 1
            ? `${baseSystemInstruction}\n\n[System Note: This is part ${i + 1} of ${chunks.length} of the chapter. Maintain strict terminology and stylistic consistency with previous parts.]`
            : baseSystemInstruction;

        const prompt = `Translate the following Markdown content into ${targetLanguage}. \n\nCONTENT:\n${chunk}`;

        try {
            const result = await this.generate(prompt, chunkInstruction, 0.3);
            translatedChunks.push(result);
            
            // Notify progress and SAVE
            if (onProgress) {
                try {
                    await onProgress(i + 1, chunks.length, result);
                } catch (progressError) {
                    console.error("Failed to save progress:", progressError);
                }
            }
        } catch (error) {
            console.error(`Error translating chunk ${i + 1}/${chunks.length}:`, error);
            console.error("Failed chunk content:\n", chunk);
            console.warn(`Falling back to original content for chunk ${i + 1}`);
            
            // Fault tolerance: keep the original chunk if translation fails
            translatedChunks.push(chunk);
            if (onProgress) {
                try {
                    await onProgress(i + 1, chunks.length, chunk, true);
                } catch (progressError) {
                    console.error("Failed to save fallback progress:", progressError);
                }
            }
        }
    }

    return translatedChunks.join('\n\n');
  }

  async proofreadContent(
    content: string, 
    instruction: string,
    onProgress?: (current: number, total: number, chunkResult: string, isFallback?: boolean) => Promise<void>,
    existingChunks: string[] = []
  ): Promise<string> {
    
    const chunks = this.splitTextIntoChunks(content);
    const proofreadChunks: string[] = [...existingChunks];

    for (let i = existingChunks.length; i < chunks.length; i++) {
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const chunk = chunks[i];
        const prompt = `Check the following Markdown content. ${instruction}\n\nCONTENT:\n${chunk}`;
        
        try {
            const result = await this.generate(prompt, "You are a specialized proofreading assistant. Return ONLY the proofread Markdown.", 0.1);
            proofreadChunks.push(result);
            
            if (onProgress) {
                try {
                    await onProgress(i + 1, chunks.length, result);
                } catch (progressError) {
                    console.error("Failed to save progress:", progressError);
                }
            }
        } catch (error) {
            console.error(`Error proofreading chunk ${i + 1}/${chunks.length}:`, error);
            console.error("Failed chunk content:\n", chunk);
            console.warn(`Falling back to original content for chunk ${i + 1}`);
            
            // Fault tolerance: keep the original chunk if proofreading fails
            proofreadChunks.push(chunk);
            if (onProgress) {
                try {
                    await onProgress(i + 1, chunks.length, chunk, true);
                } catch (progressError) {
                    console.error("Failed to save fallback progress:", progressError);
                }
            }
        }
    }

    return proofreadChunks.join('\n\n');
  }
}
