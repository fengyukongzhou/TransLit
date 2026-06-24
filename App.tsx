
import React, { useState, useRef, useEffect } from 'react';
import { 
  FileCheck, Loader2, Download, AlertTriangle, 
  RefreshCw, Trash2, Save, Info, Plus, X, Eye, Ban, FileCode,
  CheckCircle2, Eraser, Pause, Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import FileUpload from './components/FileUpload';
import SettingsPanel from './components/SettingsPanel';
import logoUrl from './logo.svg';
import { EpubService } from './services/epubService';
import { AiService } from './services/geminiService';
import { PersistenceService } from './services/persistenceService';
import { AppStatus, AppConfig, Chapter, ProcessingLog, SessionState } from './types';
import { RECOMMENDED_TRANSLATION_PROMPT, TWO_STEP_BASE_PROMPT } from './prompts';

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  baseUrl: '',
  modelName: '',
  sourceLanguage: 'English',
  additionalContext: '',
  enableProofreading: true,
  useRecommendedPrompts: true,
  smartSkip: true,
  enableGlossary: true
};

// Helper to resolve relative paths in EPUB
const resolveEpubPath = (basePath: string, relativePath: string): string => {
    if (!relativePath || relativePath.startsWith('http') || relativePath.startsWith('data:')) return relativePath;
    
    // Standardize separators
    let rel = relativePath.replace(/\\/g, '/');
    let base = basePath.replace(/\\/g, '/');
    
    // Remove ./ 
    rel = rel.replace(/^\.\//, '');
    
    const baseParts = base.split('/').filter(p => p);
    baseParts.pop(); // remove filename to get directory
    
    const relParts = rel.split('/').filter(p => p);
    
    for (const part of relParts) {
        if (part === '..') {
            baseParts.pop();
        } else if (part !== '.') {
            baseParts.push(part);
        }
    }
    
    return baseParts.join('/');
};

const MarkdownImage: React.FC<{ src?: string, alt?: string, chapterPath: string, persistence: PersistenceService }> = ({ src, alt, chapterPath, persistence }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!src) {
            setIsLoading(false);
            return;
        }

        let currentUrl: string | null = null;

        const loadImg = async () => {
            try {
                const fullPath = resolveEpubPath(chapterPath, src);
                const blob = await persistence.getImage(fullPath);
                if (blob) {
                    currentUrl = URL.createObjectURL(blob);
                    setBlobUrl(currentUrl);
                }
            } catch (e) {
                console.warn("Failed to load preview image:", src, e);
            } finally {
                setIsLoading(false);
            }
        };

        loadImg();

        return () => {
            if (currentUrl) URL.revokeObjectURL(currentUrl);
        };
    }, [src, chapterPath]);

    if (!src) return null;
    if (isLoading) return <span className="w-full h-32 bg-stone-100 animate-pulse rounded-lg flex items-center justify-center text-stone-400 text-xs font-serif italic">Loading image...</span>;
    
    return (
        <img 
            src={blobUrl || src} 
            alt={alt} 
            className="rounded-lg shadow-sm mx-auto my-6 max-h-[500px] object-contain bg-stone-50"
            onError={(e) => {
                // If blob fails, it might be a real external URL or missing
                (e.target as HTMLImageElement).className = "hidden";
            }}
        />
    );
};

const parseGlossaryStr = (str: string): Record<string, string> => {
  const lines = str.split('\n');
  const result: Record<string, string> = {};
  lines.forEach(line => {
    // 1. Try structural format: SOURCE: xxx | TARGET: yyy
    const structuralMatch = line.match(/SOURCE:\s*(.*?)\s*\|\s*TARGET:\s*(.*)/i);
    if (structuralMatch) {
        const key = structuralMatch[1].trim();
        const value = structuralMatch[2].trim();
        if (key && value) {
            result[key] = value;
            return;
        }
    }

    // 2. Fallback to simple format: Key: Value
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join(':').trim();
      if (key && value && !key.toLowerCase().includes('source') && !key.toLowerCase().includes('target')) {
          result[key] = value;
      }
    }
  });
  return result;
}

const glossaryToOutputStr = (glossary: Record<string, string>): string => {
  return Object.entries(glossary)
    .sort()
    .map(([k, v]) => `SOURCE: ${k} | TARGET: ${v}`)
    .join('\n');
}

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [restoredSession, setRestoredSession] = useState<boolean>(false);
  const [showConfirmReset, setShowConfirmReset] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'logs' | 'chapters' | 'glossary'>('logs');
  const [liveGlossary, setLiveGlossary] = useState<string>('');
  const [glossaryMap, setGlossaryMap] = useState<Record<string, string>>({});
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [previewChapter, setPreviewChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]); // Added state for chapters to trigger re-renders
  const [isCleaningGlossary, setIsCleaningGlossary] = useState(false);
  
  const epubService = useRef(new EpubService());
  const persistenceService = useRef(new PersistenceService());
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isPauseRequested = useRef(false);
  
  // Persist chapters and images across renders to allow resuming
  const chaptersRef = useRef<Chapter[]>([]);
  const imagesRef = useRef<Record<string, Blob>>({});
  const coverPathRef = useRef<string | undefined>(undefined);
  const lastOptimizedCountRef = useRef<number>(0);
  const lastOptimizedMapRef = useRef<Record<string, string>>({});
  const newTermsAccumulatedRef = useRef<number>(0);
  const activeChapterIndexRef = useRef<number>(-1);
  const activeChunkIndexRef = useRef<number>(0);

  const isWorking = [AppStatus.PARSING, AppStatus.TRANSLATING, AppStatus.PACKAGING].includes(status);

  // Initialize Persistence
  useEffect(() => {
    const init = async () => {
      try {
        await persistenceService.current.init();

        // Load API configuration cache from LocalStorage
        const savedApiConfigStr = localStorage.getItem('translit_api_config');
        let localApiConfig = {};
        if (savedApiConfigStr) {
          try {
            localApiConfig = JSON.parse(savedApiConfigStr);
          } catch (e) {
            console.error("Failed to parse saved api config:", e);
          }
        }

        const session = await persistenceService.current.loadSession();
        
        if (session && session.fileName) {
            // Found a previous session
            const savedChapters = await persistenceService.current.loadChapters();
            const savedLogs = await persistenceService.current.loadLogs();
            
            // MEMORY OPTIMIZATION: Do NOT load images here. 
            // We only need them for the final packaging step.
            // const savedImages = await persistenceService.current.loadImages(); 
            
            if (savedChapters.length > 0) {
                // Restore data to refs
                chaptersRef.current = savedChapters.sort((a, b) => a.index - b.index);
                setChapters(chaptersRef.current); // Sync state
                // imagesRef.current = savedImages; // Don't load to RAM
                coverPathRef.current = session.coverPath;
                
                // Restore glossary
                const savedGlossary = await persistenceService.current.loadGlossary();
                setGlossaryMap(savedGlossary);
                setLiveGlossary(glossaryToOutputStr(savedGlossary));
                
                // Restore UI state, merging with LocalStorage configurations
                setConfig({ ...session.config, ...localApiConfig });
                setLogs(savedLogs);
                setProgress(session.progress);
                
                // If it was in progress, set to ERROR/PAUSED state so user can resume
                // If it was COMPLETED, restore that
                if (session.status === AppStatus.COMPLETED) {
                     setStatus(AppStatus.COMPLETED);
                     addLog("Restored completed session. Regenerating download link...", "info");
                     
                     // Regenerate the EPUB blob to get a fresh URL
                     // We need to load images temporarily for this
                     try {
                         const savedImages = await persistenceService.current.loadImages();
                         const blob = await epubService.current.generateEpub(
                            savedChapters.filter(c => !c.isSkippable).sort((a, b) => a.index - b.index),
                            savedImages,
                            session.fileName.replace('.epub', '') || 'translated_book',
                            'Chinese (Simplified)',
                            session.coverPath
                         );
                         const url = URL.createObjectURL(blob);
                         setDownloadUrl(url);
                         addLog("Download link ready.", "success");
                     } catch (genError) {
                         console.error("Failed to regenerate EPUB on restore:", genError);
                         addLog("Failed to regenerate download link. Please click 'Package Again' or reset.", "error");
                         setStatus(AppStatus.ERROR); // Fallback so they can try again
                     }

                } else if (session.status !== AppStatus.IDLE) {
                     setStatus(AppStatus.ERROR); // Use ERROR state to show "Resume" button
                     addLog("Restored interrupted session. Click the Start button to continue.", "info");
                }
                
                setRestoredSession(true);
                const dummyFile = { name: session.fileName } as File;
                setCurrentFile(dummyFile);
            }
        } else {
            // Apply local API configurations if no prior session exists
            setConfig(prev => ({ ...prev, ...localApiConfig }));
        }
      } catch (e) {
        console.error("Failed to initialize persistence:", e);
        addLog("Failed to initialize auto-save system.", "error");
      }
    };
    init();
  }, []);


  const optimizeGlossary = async (isManual: boolean = false) => {
    // Read fresh from database to avoid stale closures in the long-running process
    const currentGlossaryMap = await persistenceService.current.loadGlossary();
    const currentGlossaryText = glossaryToOutputStr(currentGlossaryMap);
    const termCount = Object.keys(currentGlossaryMap).length;
    
    // Skip if not enough terms to optimize (minimum 10 terms for actual optimization benefit)
    if (termCount < 10 && !isManual) {
        return;
    }

    if (isCleaningGlossary) return;
    
    setIsCleaningGlossary(true);
    
    try {
        const aiService = new AiService(config);
        
        if (isManual) {
            // TWO-STEP CLEANUP: Filter by existence FIRST, then AI
            addLog(`[Agent] Smart Cleanup: Performing deep analysis on ${termCount} terms...`, 'process');
            
            // Calculate Posterior Text (Current position to end of book)
            let referenceText = "";
            const currentIdx = activeChapterIndexRef.current;
            
            if (currentIdx !== -1) {
                // Current Chapter (from current translation point)
                const currentChapter = chaptersRef.current[currentIdx];
                const chapterChunks = currentChapter.markdown.split(/\n{2,}/);
                
                // If translation is in progress, we can be more precise
                const startChunk = (isWorking && currentIdx === activeChapterIndexRef.current) ? activeChunkIndexRef.current : 0;
                const remainingChapterText = chapterChunks.slice(startChunk).join('\n');
                
                // All future chapters
                const futureChaptersText = chaptersRef.current.slice(currentIdx + 1).map(c => c.markdown).join('\n');
                
                referenceText = remainingChapterText + "\n" + futureChaptersText;
            }

            // Fallback: If no context or reference text found, use full book (safety)
            if (!referenceText.trim()) {
                referenceText = chaptersRef.current.map(c => c.markdown).join('\n');
            }

            const optimizedText = await aiService.smartCleanupGlossary(currentGlossaryText, referenceText);
            
            const finalMap = parseGlossaryStr(optimizedText);
            await persistenceService.current.replaceGlossary(finalMap);
            setGlossaryMap(finalMap);
            setLiveGlossary(glossaryToOutputStr(finalMap));
            
            const finalCount = Object.keys(finalMap).length;
            addLog(`[Agent] Smart Cleanup finished. Result: ${finalCount} / ${termCount} terms kept.`, 'success');
        } else {
            // Incremental Logic: Only send terms that haven't been optimized yet
            const masterTermsKeys = Object.keys(lastOptimizedMapRef.current).join(", ");
            const candidatesMap: Record<string, string> = {};
            
            Object.entries(currentGlossaryMap).forEach(([k, v]) => {
                if (!lastOptimizedMapRef.current[k]) {
                    candidatesMap[k] = v;
                }
            });
            
            const candidateCount = Object.keys(candidatesMap).length;
            if (candidateCount === 0) {
                setIsCleaningGlossary(false);
                return;
            }

            // Calculate Posterior Text for filtering candidates
            let referenceText = "";
            const currentIdx = activeChapterIndexRef.current;
            if (currentIdx !== -1) {
                const currentChapter = chaptersRef.current[currentIdx];
                const chapterChunks = currentChapter.markdown.split(/\n{2,}/);
                const startChunk = activeChunkIndexRef.current; // Use current translation point
                const remainingChapterText = chapterChunks.slice(startChunk).join('\n');
                const futureChaptersText = chaptersRef.current.slice(currentIdx + 1).map(c => c.markdown).join('\n');
                referenceText = remainingChapterText + "\n" + futureChaptersText;
            }

            // Step 1: Pre-filter candidates by inclusion in future text (min 1 occurrence)
            let filteredCandidatesMap = candidatesMap;
            if (referenceText.trim()) {
                filteredCandidatesMap = aiService.filterGlossaryByInclusion(candidatesMap, referenceText, 1);
            }
            
            const newTermsText = glossaryToOutputStr(filteredCandidatesMap);
            const filteredCount = Object.keys(filteredCandidatesMap).length;
            
            if (filteredCount === 0) {
                // If all new terms were dropped by filtering, we still mark the originals as "reviewed"
                lastOptimizedMapRef.current = { ...lastOptimizedMapRef.current, ...candidatesMap };
                setIsCleaningGlossary(false);
                return;
            }

            addLog(`[Agent] Glossary Janitor: Reviewing ${filteredCount} future-relevant terms (Dropped ${candidateCount - filteredCount})...`, 'process');
            
            // Pass baseline keys instead of full text to minimize prompt size
            const baselineSummary = masterTermsKeys.length > 500 
                ? masterTermsKeys.substring(0, 500) + "... (and more)" 
                : masterTermsKeys || "(None)";

            const optimizedDeltaText = await aiService.optimizeIncrementalGlossary(newTermsText, baselineSummary);
            
            // Create full glossary by merging optimized delta with master
            const deltaMap = parseGlossaryStr(optimizedDeltaText);
            
            // REFINED MERGE LOGIC:
            // 1. Get current state from DB
            const liveMap = await persistenceService.current.loadGlossary();
            
            // 2. Remove the "Dirty" candidates we just reviewed from the live set
            const cleanedLiveMap = { ...liveMap };
            Object.keys(candidatesMap).forEach(k => {
                delete cleanedLiveMap[k];
            });
            
            // 3. Add the "Optimized" versions back
            const mergedMap = { ...cleanedLiveMap, ...deltaMap };
            
            await persistenceService.current.replaceGlossary(mergedMap);
            const savedMap = await persistenceService.current.loadGlossary();
            
            // Sync UI and internal state
            setGlossaryMap(savedMap);
            setLiveGlossary(glossaryToOutputStr(savedMap));
            lastOptimizedCountRef.current = Object.keys(savedMap).length;
            lastOptimizedMapRef.current = savedMap;
            
            const addedCount = Object.keys(deltaMap).length;
            const rejectedCount = candidateCount - addedCount;

            if (rejectedCount > 0) {
                addLog(`[Agent] Glossary cleaned. Filtered ${rejectedCount} redundant entries.`, 'success');
            } else {
                addLog(`[Agent] Glossary updated with ${addedCount} new terms.`, 'success');
            }
        }
    } catch (e) {
        if (e instanceof Error && e.message === "PAUSE_SIGNAL") {
            throw e;
        }
        console.error("Glossary optimization failed:", e);
        addLog(`[Agent] Glossary optimization failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
        setIsCleaningGlossary(false);
    }
  };

  // Auto scroll logs
  useEffect(() => {
    if (viewMode === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, viewMode]);

  const addLog = (message: string, type: ProcessingLog['type'] = 'info') => {
    const newLog: ProcessingLog = { timestamp: Date.now(), message, type };
    setLogs(prev => [...prev, newLog]);
    // Async save log
    persistenceService.current.saveLog(newLog).catch(e => console.error("Failed to save log", e));
  };

  const handleFileSelect = async (file: File) => {
    try {
        // Clear previous session
        await persistenceService.current.clearSession();
    } catch (e) {
        console.error("Failed to clear background session:", e);
    }
    
    setCurrentFile(file);
    setDownloadUrl(null);
    setLogs([]);
    setLiveGlossary('');
    setGlossaryMap({});
    
    // Clear persisted data for new file
    chaptersRef.current = [];
    imagesRef.current = {};
    coverPathRef.current = undefined;
    setProgress(0);
    setStatus(AppStatus.IDLE);
    setRestoredSession(false);
    addLog(`Selected file: ${file.name}`, 'info');

    // AUTO-PARSE EPUB IMMEDIATELY
    try {
        setStatus(AppStatus.PARSING);
        addLog("Parsing EPUB and converting XHTML to Markdown...", "process");
        const { chapters: extractedChapters, images, coverPath } = await epubService.current.parseEpub(file);
        
        chaptersRef.current = extractedChapters;
        setChapters(extractedChapters); // Sync state for UI
        coverPathRef.current = coverPath;

        // Persist initial data
        await persistenceService.current.saveChapters(extractedChapters);
        await persistenceService.current.saveImages(images);
        
        // Save initial session state
        await persistenceService.current.saveSession({
            status: AppStatus.IDLE, // Keep IDLE so user can review chapters before starting
            config,
            progress: 0,
            fileName: file.name,
            coverPath: coverPath,
            lastUpdated: Date.now()
        });

        addLog(`Extracted ${extractedChapters.length} chapters and ${Object.keys(images).length} images.`, "success");
        if (coverPath) {
            addLog(`Cover image detected.`, 'info');
        }
        
        // Auto-switch to chapters view so user sees the content
        setViewMode('chapters');
        setStatus(AppStatus.IDLE); // Return to idle for user to adjust settings/chapters
    } catch (parseError) {
        console.error("Auto-parse failed:", parseError);
        addLog(`Failed to parse EPUB: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`, "error");
        setStatus(AppStatus.ERROR);
    }
  };

  const handleReset = async () => {
    addLog("Clearing all cache and state...", "info");
    try {
        await persistenceService.current.clearSession();
        addLog("Database cleared successfully.", "success");
    } catch (e) {
        console.error("Failed to clear session from DB:", e);
        addLog("Failed to clear database cache. Some data may persist.", "error");
    }
    setDownloadUrl(null);
    setLogs([]);
    setLiveGlossary('');
    setGlossaryMap({});
    chaptersRef.current = [];
    imagesRef.current = {};
    coverPathRef.current = undefined;
    setProgress(0);
    setStatus(AppStatus.IDLE);
    setCurrentFile(null);
    setRestoredSession(false);
    setShowConfirmReset(false);
    addLog("Workflow reset.", "info");
  };

  const getLocalizedSourceName = (lang: string) => {
    const mapping: Record<string, string> = {
      "English": "English",
      "Japanese": "Japanese",
      "Korean": "Korean",
      "French": "French",
      "German": "German",
      "Spanish": "Spanish",
      "Russian": "Russian",
      "Italian": "Italian",
      "Portuguese": "Portuguese"
    };
    return mapping[lang] || lang;
  };

  const processChapter = async (
    index: number, 
    aiService: AiService, 
    chapters: Chapter[], 
    effectiveSystemInstruction: string,
    forceTranslateIndices: number[] = [],
    startGlossary: string = ""
  ): Promise<string> => {
    const chapter = chapters[index];
    let updated = false;
    let currentGlossary = startGlossary || chapter.glossary || "";
    
    // Skip empty chapters usually
    if (!chapter.markdown || chapter.markdown.trim().length < 10) {
       if (!chapter.translatedMarkdown) { 
           addLog(`Skipping empty/short chapter: ${chapter.title}`, "info");
       }
       return currentGlossary;
    }
    
    // Handle Skippable / Reference Logic
    if (chapter.isSkippable) {
        return currentGlossary;
    }

    if (chapter.isReference) {
        // Force reset to original if it's marked as reference
        // This handles the case where it was previously translated but user changed mind
        if (chapter.translatedMarkdown !== chapter.markdown) {
            addLog(`Resetting "${chapter.title}" to original (Reference mode)...`, "info");
            chapter.translatedMarkdown = chapter.markdown;
            chapter.proofreadMarkdown = chapter.markdown;
            chapter.translatedChunks = [];
            chapter.proofreadChunks = [];
            chapter.fallbackChunks = [];
            chapter.fallbackProofreadChunks = [];
            updated = true;
            await persistenceService.current.updateChapter(chapter);
        }
        return currentGlossary;
    }

    // --- Translation ---
    if (chapter.translatedMarkdown && forceTranslateIndices.length === 0) {
        // Already translated, use its glossary if it exists
        if (chapter.glossary) {
            currentGlossary = chapter.glossary;
        }
    } else {
        setStatus(AppStatus.TRANSLATING);
        addLog(`Translating [${index+1}/${chapters.length}]: ${chapter.title}${forceTranslateIndices.length ? ' (Retrying failed parts)' : ''}`, "process");
        
        if (!chapter.translatedChunks) chapter.translatedChunks = [];
        if (!chapter.fallbackChunks) chapter.fallbackChunks = [];
        if (!chapter.chunkGlossaries) chapter.chunkGlossaries = [];
        
        // Find best starting glossary for retries or resume
        const firstNullIndex = (chapter.translatedChunks || []).findIndex(c => !c);
        const firstRetryIndex = forceTranslateIndices.length > 0 ? forceTranslateIndices[0] : -1;
        
        let startIndex = -1;
        if (firstNullIndex !== -1 && firstRetryIndex !== -1) {
            startIndex = Math.min(firstNullIndex, firstRetryIndex);
        } else if (firstNullIndex !== -1) {
            startIndex = firstNullIndex;
        } else {
            startIndex = firstRetryIndex;
        }
        
        const initialGlossaryForChapter = (startIndex > 0 && chapter.chunkGlossaries && chapter.chunkGlossaries[startIndex - 1]) 
            ? chapter.chunkGlossaries[startIndex - 1] 
            : currentGlossary;

        const result = await aiService.translateContent(
            chapter.markdown, 
            'Chinese (Simplified)', 
            effectiveSystemInstruction,
            async (current, total, chunkResult, updatedGlossary, isFallback, stats) => {
                activeChapterIndexRef.current = index;
                activeChunkIndexRef.current = current;

                if (isPauseRequested.current) {
                    throw new Error("PAUSE_SIGNAL");
                }
                if (isFallback) {
                  addLog(`  > ⚠️ API returned empty/error for part ${current}/${total} of "${chapter.title}". Kept original.`, 'error');
                  if (!chapter.fallbackChunks!.includes(current - 1)) {
                      chapter.fallbackChunks!.push(current - 1);
                  }
              } else {
                  // Merge new glossary entries into master database
                  if (updatedGlossary) {
                      const deltaTerms = parseGlossaryStr(updatedGlossary);
                      if (Object.keys(deltaTerms).length > 0) {
                          const addedCount = await persistenceService.current.saveGlossaryTerms(deltaTerms);
                          if (addedCount > 0) {
                              newTermsAccumulatedRef.current += addedCount;
                              // Reload full glossary to ensure UI and next chunks stay in sync
                              const masterGlossary = await persistenceService.current.loadGlossary();
                              setGlossaryMap(masterGlossary);
                              const fullStr = glossaryToOutputStr(masterGlossary);
                              setLiveGlossary(fullStr);
                              currentGlossary = fullStr;
                          }
                      }
                  }

                  let glossaryInfo = '';
                  if (stats && stats.originalCount > 0) {
                      const dropped = stats.originalCount - stats.filteredCount;
                      glossaryInfo = `(Glossary: ${stats.filteredCount} kept, ${dropped} dropped)`;
                  } else {
                      const termCount = updatedGlossary ? updatedGlossary.trim().split('\n').filter(l => l.trim()).length : 0;
                      glossaryInfo = `(New Glossary: ${termCount} entries)`;
                  }
                  
                  const actionWord = config.enableProofreading ? "Translated & Reviewed" : "Translated";
                  addLog(`  > ${actionWord} part ${current}/${total} of "${chapter.title}"... ${glossaryInfo}`, 'info');
                  
                  // Trigger Glossary Cleaning every 10 NEW terms
                  if (config.enableGlossary && newTermsAccumulatedRef.current >= 10) {
                      newTermsAccumulatedRef.current = 0; // Reset threshold
                      optimizeGlossary().then(async () => {
                          const freshGlossary = await persistenceService.current.loadGlossary();
                          currentGlossary = glossaryToOutputStr(freshGlossary);
                      });
                  }

                  if (chapter.fallbackChunks) {
                    chapter.fallbackChunks = chapter.fallbackChunks.filter(idx => idx !== current - 1);
                  }
              }
              
              if (chapter.translatedChunks) {
                  chapter.translatedChunks![current - 1] = chunkResult;
                  if (updatedGlossary) {
                      chapter.chunkGlossaries![current - 1] = updatedGlossary;
                  }
                  await persistenceService.current.updateChapter(chapter);
                  await saveSessionState(AppStatus.TRANSLATING);
              }
          },
          chapter.translatedChunks,
          forceTranslateIndices,
          initialGlossaryForChapter,
          chapters.slice(index + 1).map(c => c.markdown).join('\n')
        );
        chapter.translatedMarkdown = result.content;
        chapter.glossary = result.glossary;
        currentGlossary = result.glossary;
        
        // If in combined mode, we treat the translation result as the proofread result too
        if (config.enableProofreading) {
            chapter.proofreadMarkdown = result.content;
            chapter.proofreadChunks = [...(chapter.translatedChunks || [])];
            chapter.fallbackProofreadChunks = [...(chapter.fallbackChunks || [])];
        }

        updated = true;
    }

    if (updated) {
        await persistenceService.current.updateChapter(chapter);
    }
    return currentGlossary;
  };

  const handleRetryChapter = async (index: number) => {
    if (status !== AppStatus.IDLE && status !== AppStatus.ERROR && status !== AppStatus.COMPLETED) return;
    
    try {
        const aiService = new AiService(config);
        const chapters = chaptersRef.current;
        const chapter = chapters[index];

        // If chapter is skip or reference, we just run processChapter to ensure its state is synced
        // and it bypasses the chunk splitting logic which might fail or be unnecessary
        if (!chapter.isSkippable && !chapter.isReference) {
            // Use AI split to recover original chunk structure
            const sourceChunks = aiService.splitTextIntoChunks(chapter.markdown);
            
            // Sync local fallbacks with detection if needed
            const explicit = chapter.fallbackChunks || [];
            const implicit: number[] = [];
            // If translatedMarkdown exists but chunks are missing/mismatched, scan by content
            sourceChunks.forEach((sChunk, i) => {
                const trimmed = sChunk.trim();
                if (trimmed.length > 20 && chapter.translatedMarkdown?.includes(trimmed)) {
                    implicit.push(i);
                }
            });
            chapter.fallbackChunks = [...new Set([...explicit, ...implicit])].sort((a,b) => a-b);
            
            // Re-initialize chunks array if it's stale/missing
            if (!chapter.translatedChunks || chapter.translatedChunks.length !== sourceChunks.length) {
                chapter.translatedChunks = new Array(sourceChunks.length).fill(null);
            }
        }

        const localizedSource = getLocalizedSourceName(config.sourceLanguage);
        let basePrompt = '';
        if (config.enableProofreading) {
            basePrompt = TWO_STEP_BASE_PROMPT.replace(/\[SOURCE_LANG\]/g, localizedSource);
        } else if (config.useRecommendedPrompts) {
            basePrompt = RECOMMENDED_TRANSLATION_PROMPT.replace(/\[SOURCE_LANG\]/g, localizedSource);
        } else {
            // Updated professional fallback prompt
            basePrompt = `你是一位专业的文学翻译专家。请把${localizedSource}内容重写为中文，确保译文生动、地道，并保持原有的 Markdown 格式。`;
        }
            
        const effectiveSystemInstruction = config.additionalContext 
            ? `${basePrompt}\n\n【书籍元信息与特定翻译要求】\n${config.additionalContext}`
            : basePrompt;
            
        let failedIndices = [...(chapter.fallbackChunks || [])];
        if (config.enableProofreading && chapter.fallbackProofreadChunks) {
            chapter.fallbackProofreadChunks.forEach(idx => {
                if (!failedIndices.includes(idx)) failedIndices.push(idx);
            });
        }
        failedIndices.sort((a, b) => a - b);
        
        // If still no failed indices, it means user wants a FULL re-translation (the button says "Re-Translate")
        if (failedIndices.length === 0 && (chapter.translatedMarkdown || chapter.proofreadMarkdown)) {
            addLog(`Chapter "${chapter.title}" requested for full re-translation.`, 'info');
            // Force ALL chunks to be retried
            const sourceChunks = aiService.splitTextIntoChunks(chapter.markdown, config.enableProofreading ? 1800 : undefined);
            failedIndices = sourceChunks.map((_, i) => i);
        }
        
        // Find most recent glossary before this chapter
        let runningGlossary = "";
        for (let j = index - 1; j >= 0; j--) {
            if (chapters[j].glossary) {
                runningGlossary = chapters[j].glossary!;
                break;
            }
        }
        
        await processChapter(index, aiService, chapters, effectiveSystemInstruction, failedIndices, runningGlossary);
        
        // Update percentages
        const isCombinedMode = config.enableProofreading;
        const totalSteps = chapters.length;
        const stepsDoneCount = chapters.reduce((acc, c) => {
            if (c.isSkippable) return acc + 1;
            const tDone = c.translatedMarkdown ? 1 : 0;
            return acc + tDone;
        }, 0);
        const currentProgress = Math.min(100, (stepsDoneCount / totalSteps) * 100);
        setProgress(currentProgress);
        
        // If reached 100% or was already completed, rebuild to ensure the download reflects the retry
        // We use Math.floor to be safe with float precision
        if ((status === AppStatus.COMPLETED || Math.floor(currentProgress) >= 100) && currentFile) {
            await rebuildEpub(chapters, config, currentFile.name);
        } else {
            // Keep current status if it was COMPLETED (rebuildEpub will set it anyway)
            // or stay IDLE/ERROR
            if (status !== AppStatus.COMPLETED) {
                setStatus(AppStatus.IDLE);
            }
        }
    } catch (e) {
        addLog(`Retry failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
        setStatus(AppStatus.ERROR);
    }
  };

  const saveSessionState = async (currentStatus: AppStatus) => {
      if (!currentFile) return;
      await persistenceService.current.saveSession({
          status: currentStatus,
          config,
          progress,
          fileName: currentFile.name,
          coverPath: coverPathRef.current,
          lastUpdated: Date.now(),
      });
  };

  const handleUpdateGlossary = async (newText: string) => {
    const newMap = parseGlossaryStr(newText);
    await persistenceService.current.replaceGlossary(newMap);
    const updated = await persistenceService.current.loadGlossary();
    setGlossaryMap(updated);
    setLiveGlossary(glossaryToOutputStr(updated));
    addLog("Master glossary updated manually.", "success");
  }

  const handleUpdateTerm = (oldKey: string, newKey: string, newValue: string) => {
    const newMap = { ...glossaryMap };
    if (oldKey !== newKey) {
        delete newMap[oldKey];
    }
    newMap[newKey] = newValue;
    setGlossaryMap(newMap);
    setLiveGlossary(glossaryToOutputStr(newMap));
  }

  const handleDeleteTerm = (key: string) => {
    const newMap = { ...glossaryMap };
    delete newMap[key];
    setGlossaryMap(newMap);
    setLiveGlossary(glossaryToOutputStr(newMap));
  }

  const handleAddTerm = () => {
     const newKey = `new_term_${Object.keys(glossaryMap).length}`;
     handleUpdateTerm(newKey, "", "");
  }

  const handleSaveGlossaryMap = async () => {
    await persistenceService.current.replaceGlossary(glossaryMap);
    addLog("Master glossary saved.", "success");
  }

  const toggleChapterSkip = async (index: number) => {
    const updatedChapters = [...chaptersRef.current];
    updatedChapters[index] = { 
        ...updatedChapters[index], 
        isSkippable: !updatedChapters[index].isSkippable,
        isReference: false // Mutually exclusive for simplicity
    };
    chaptersRef.current = updatedChapters;
    setChapters(updatedChapters);
    await persistenceService.current.updateChapter(updatedChapters[index]);
    addLog(`Chapter "${updatedChapters[index].title}" marked as ${updatedChapters[index].isSkippable ? 'Skipped' : 'Included'}.`, 'info');
    
    // Auto-rebuild if completed to ensure download link is fresh
    if (status === AppStatus.COMPLETED) {
        await rebuildEpub(updatedChapters, config, currentFile?.name || 'book');
    }
  };

  const toggleChapterReference = async (index: number) => {
    const updatedChapters = [...chaptersRef.current];
    updatedChapters[index] = { 
        ...updatedChapters[index], 
        isReference: !updatedChapters[index].isReference,
        isSkippable: false // Mutually exclusive
    };
    chaptersRef.current = updatedChapters;
    setChapters(updatedChapters);
    await persistenceService.current.updateChapter(updatedChapters[index]);
    addLog(`Chapter "${updatedChapters[index].title}" marked as ${updatedChapters[index].isReference ? 'Reference (No translation)' : 'To Translate'}.`, 'info');

    // Auto-rebuild if completed
    if (status === AppStatus.COMPLETED) {
        await rebuildEpub(updatedChapters, config, currentFile?.name || 'book');
    }
  };

  const handlePause = () => {
    if (status === AppStatus.TRANSLATING ||  status === AppStatus.PARSING) {
        isPauseRequested.current = true;
        addLog("Pause requested. Finish current chapter and stopping...", "info");
    }
  };

  const rebuildEpub = async (chaptersList: Chapter[], sessionConfig: AppConfig, fileName: string) => {
    setStatus(AppStatus.PACKAGING);
    addLog(`Recompiling EPUB...`, "process");
    
    try {
        // Always filter out manually skipped chapters, even if global smartSkip is off
        // This ensures the manual "Skip" UI buttons always work
        const chaptersToPack = chaptersList.filter(c => !c.isSkippable);

        const images = await persistenceService.current.loadImages();
        const blob = await epubService.current.generateEpub(
          chaptersToPack, 
          images, 
          fileName.replace('.epub', '') || 'translated_book',
          'Chinese (Simplified)',
          coverPathRef.current
        );
        
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setStatus(AppStatus.COMPLETED);
        addLog("EPUB is ready for download.", "success");
        await saveSessionState(AppStatus.COMPLETED);
    } catch (e) {
        addLog(`Packaging failed: ${e instanceof Error ? e.message : 'Unknown error'}`, "error");
        setStatus(AppStatus.ERROR);
    }
  };

  const startProcessing = async (mode: 'normal' | 'retry' = 'normal') => {
    if (!currentFile && !chaptersRef.current.length) return;

    try {
      const aiService = new AiService(config);
      
      // Step 1: Parse EPUB (Only if not already parsed - fallback safety)
      if (chaptersRef.current.length === 0 && currentFile) {
        setStatus(AppStatus.PARSING);
        addLog("Parsing EPUB and converting XHTML to Markdown...", "process");
        const { chapters: extractedChapters, images, coverPath } = await epubService.current.parseEpub(currentFile);
        
        chaptersRef.current = extractedChapters;
        setChapters(extractedChapters); // Sync state
        coverPathRef.current = coverPath;

        // Persist initial data
        await persistenceService.current.saveChapters(extractedChapters);
        await persistenceService.current.saveImages(images);
        await saveSessionState(AppStatus.PARSING);

        addLog(`Extracted ${extractedChapters.length} chapters and ${Object.keys(images).length} images.`, "success");
        if (coverPath) {
            addLog(`Cover image detected.`, 'info');
        }
      }

      const localizedSource = getLocalizedSourceName(config.sourceLanguage);
      let basePrompt = '';
      if (config.enableProofreading) {
          basePrompt = TWO_STEP_BASE_PROMPT.replace(/\[SOURCE_LANG\]/g, localizedSource);
      } else if (config.useRecommendedPrompts) {
          basePrompt = RECOMMENDED_TRANSLATION_PROMPT.replace(/\[SOURCE_LANG\]/g, localizedSource);
      } else {
          // Updated professional fallback prompt
          basePrompt = `你是一位专业的文学翻译专家。请把${localizedSource}内容重写为中文，确保译文生动、地道，并保持原有的 Markdown 格式。`;
      }
        
      const effectiveSystemInstruction = config.additionalContext 
          ? `${basePrompt}\n\n【书籍元信息与特定翻译要求】\n${config.additionalContext}`
          : basePrompt;
        
      const modelDisplay = config.enableProofreading ? `${config.modelName} (Two-Step)` : config.modelName;
      addLog(`Starting translation using ${modelDisplay}...`, "info");
      
      let chaptersTranslatedCount = 0;
      
      if (config.smartSkip) {
        addLog("Smart Skip enabled: Title pages, Copyright, TOC will be REMOVED. References will be KEPT (untranslated).", "info");
      }

      let runningGlossary = "";
      // Load current master glossary from persistence
      const initialGlossaryFromDb = await persistenceService.current.loadGlossary();
      setGlossaryMap(initialGlossaryFromDb);
      runningGlossary = glossaryToOutputStr(initialGlossaryFromDb);
      setLiveGlossary(runningGlossary);

      isPauseRequested.current = false; // Reset pause flag
      setStatus(AppStatus.TRANSLATING);

      for (let i = 0; i < chaptersRef.current.length; i++) {
        if (isPauseRequested.current) {
            addLog("Process paused by user.", "info");
            setStatus(AppStatus.PAUSED);
            await saveSessionState(AppStatus.PAUSED);
            return;
        }

        // Re-check skip/reference status in each iteration to respect real-time user changes
        const currentChapter = chaptersRef.current[i];
        if (currentChapter.isSkippable) {
            continue;
        }

        // AUTO-RETRY logic: Only retry if mode is explicitly 'retry'
        // This follows user request: "Ignore failed parts, finish untouched first"
        let chapterFallbacks: number[] = [];
        if (mode === 'retry') {
            chapterFallbacks = [...(currentChapter.fallbackChunks || [])];
            if (config.enableProofreading && currentChapter.fallbackProofreadChunks) {
                // Merge unique indices
                currentChapter.fallbackProofreadChunks.forEach(idx => {
                    if (!chapterFallbacks.includes(idx)) chapterFallbacks.push(idx);
                });
            }
            chapterFallbacks.sort((a, b) => a - b);
        }

        runningGlossary = await processChapter(i, aiService, chaptersRef.current, effectiveSystemInstruction, chapterFallbacks, runningGlossary);
        
        if (!currentChapter.translatedMarkdown) {
             // If it was already translated, we might not count it as "just translated" depending on processChapter logic
             // But usually it translates if needed.
        }
        chaptersTranslatedCount++;
        addLog(`Finished Chapter ${i+1}`, "success");
        
        // Update progress
        const currentTotalSteps = chaptersRef.current.length;
        const stepsDone = chaptersRef.current.reduce((acc, c) => {
             if (c.isSkippable) return acc + 1;
             const tDone = c.translatedMarkdown ? 1 : 0;
             return acc + tDone;
        }, 0);
        
        const newProgress = Math.min(100, (stepsDone / currentTotalSteps) * 100);
        setProgress(newProgress);
        await saveSessionState(status); 
      }

      // Final Step: Packaging
      if (currentFile) {
          setProgress(100);

          addLog(`----------------------------------------`, "info");
          addLog(`Translation Completed!`, "success");
          addLog(`Chapters Processed: ${chaptersTranslatedCount}`, "info");
          addLog(`----------------------------------------`, "info");
          
          await rebuildEpub(chaptersRef.current, config, currentFile.name);
      } else {
          addLog("Missing file context for packaging.", "error");
          setStatus(AppStatus.ERROR);
      }

    } catch (error) {
      if (error instanceof Error && error.message === "PAUSE_SIGNAL") {
          addLog("Process paused immediately.", "info");
          setStatus(AppStatus.PAUSED);
          await saveSessionState(AppStatus.PAUSED);
          return;
      }
      console.error(error);
      setStatus(AppStatus.ERROR);
      await saveSessionState(AppStatus.ERROR);
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  };

  const getActionText = () => {
      const hasPendingTranslation = chapters.some(c => 
          c.markdown && c.markdown.trim().length >= 10 && !c.isSkippable && !c.isReference && !c.translatedMarkdown
      );
      const hasPendingProofread = config.enableProofreading && chapters.some(c => 
          c.markdown && c.markdown.trim().length >= 10 && !c.isSkippable && !c.isReference && c.translatedMarkdown && !c.proofreadMarkdown
      );
      const hasAnyFallbacks = chapters.some(c => 
          (c.fallbackChunks && c.fallbackChunks.length > 0) || 
          (config.enableProofreading && c.fallbackProofreadChunks && c.fallbackProofreadChunks.length > 0)
      );

      if (status === AppStatus.COMPLETED) {
          if (hasPendingTranslation) return "Resume Translation";
          if (hasPendingProofread) return "Start Proofreading";
          if (hasAnyFallbacks) return "Retry Failed Chunks";
          return "Package Again";
      }
      
      if (status === AppStatus.ERROR || status === AppStatus.PAUSED || status === AppStatus.IDLE) {
          if (hasPendingTranslation) return "Resume Translation";
          if (hasPendingProofread) return "Resume Proofreading";
          if (hasAnyFallbacks) return "Retry Failed Chunks";
          return chapters.length > 0 ? "Package Again" : "Start Translation";
      }
      
      return "Start Processing";
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="bg-white border-b border-black px-8 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <img src={logoUrl} alt="TransLit Logo" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-2xl font-mono font-bold text-black tracking-widest uppercase">TransLit</h1>
            <p className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest mt-0.5">Literary Translation Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {restoredSession && status !== AppStatus.TRANSLATING && (
                <span className="text-[10px] text-black bg-neutral-100 px-3 py-1.5 rounded-none border border-black flex items-center gap-1.5 font-mono uppercase tracking-widest shadow-none">
                    <Save className="w-3.5 h-3.5" /> Session Restored
                </span>
            )}
            {downloadUrl && status !== AppStatus.TRANSLATING && status !== AppStatus.PARSING && status !== AppStatus.PACKAGING && (
            <a
                href={downloadUrl}
                download={currentFile?.name ? currentFile.name.replace(/\.epub$/i, '【TransLit】.epub') : 'book【TransLit】.epub'}
                className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-5 py-2.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all shadow-none"
            >
                <Download className="w-4 h-4" /> Download EPUB
            </a>
            )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Panel: Configuration & Input */}
        <div className="w-full md:w-1/2 lg:w-5/12 p-8 overflow-y-auto border-r border-black custom-scrollbar bg-white">
          
          <div className="max-w-xl mx-auto space-y-8">
            <SettingsPanel 
              config={config} 
              setConfig={setConfig} 
              disabled={isWorking} 
            />

            <FileUpload 
              onFileSelect={handleFileSelect} 
              disabled={isWorking}
            />

            {currentFile && (
               <div className="bg-white border border-black rounded-none p-6 shadow-none transition-shadow">
                 <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-black p-3 rounded-none border border-black">
                            <FileCheck className="text-white w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-black truncate max-w-[220px] uppercase tracking-wider">{currentFile.name}</span>
                            <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest mt-0.5">Ready for processing</span>
                        </div>
                    </div>
                    {/* Clear Button */}
                     {!isWorking && (
                        showConfirmReset ? (
                            <div className="flex items-center gap-1 bg-white rounded-none p-1 border border-black shadow-none font-mono">
                                <span className="text-[11px] text-black font-bold px-2 uppercase tracking-wider">Clear?</span>
                                <button 
                                    onClick={handleReset}
                                    className="text-white bg-black hover:bg-neutral-800 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-widest transition-colors border border-black"
                                >
                                    Yes
                                </button>
                                <button 
                                    onClick={() => setShowConfirmReset(false)}
                                    className="text-black bg-white hover:bg-neutral-100 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-widest transition-colors border border-transparent hover:border-black"
                                >
                                    No
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setShowConfirmReset(true)}
                                className="text-black hover:text-white transition-colors p-2.5 hover:bg-black rounded-none border border-transparent hover:border-black"
                                title="Remove file and clear progress"
                            >
                                <Trash2 className="w-4 h-4"/>
                            </button>
                        )
                     )}
                 </div>

                 <div className="flex gap-3">
                    {/* Start / Resume Button */}
                    {(status === AppStatus.IDLE || status === AppStatus.PAUSED) && (
                    <button
                        onClick={() => startProcessing(getActionText().includes("Retry") ? "retry" : "normal")}
                        className="flex-1 bg-black hover:bg-neutral-800 text-white px-5 py-3.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all shadow-none border border-black"
                    >
                        {getActionText()}
                    </button>
                    )}

                    {/* Pause Button */}
                    {(status === AppStatus.TRANSLATING ||  status === AppStatus.PARSING) && (
                        <button 
                            onClick={handlePause}
                            className="flex-1 bg-white hover:bg-black hover:text-white text-black px-5 py-3.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all shadow-none flex items-center justify-center gap-2 border border-black"
                        >
                            <Pause className="w-4 h-4" /> Pause Translation
                        </button>
                    )}

                    {/* Resume Button */}
                    {status === AppStatus.ERROR && (
                    <button
                        onClick={() => startProcessing(getActionText().includes("Retry") ? "retry" : "normal")}
                        className="flex-1 bg-black hover:bg-neutral-800 text-white px-5 py-3.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all shadow-none flex items-center justify-center gap-2 border border-black"
                    >
                        <RefreshCw className="w-4 h-4" /> {getActionText()}
                    </button>
                    )}
                    
                    {/* Restart Button (If Completed) */}
                     {status === AppStatus.COMPLETED && (
                        <button
                            onClick={() => startProcessing(getActionText().includes("Retry") ? "retry" : "normal")}
                            className="flex-1 bg-black hover:bg-neutral-800 text-white px-5 py-3.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all shadow-none border border-black"
                        >
                            {getActionText()}
                        </button>
                    )}
                 </div>
               </div>
            )}
            
            {status === AppStatus.PAUSED && (
                <div className="bg-white border border-black text-black p-5 rounded-none flex items-start gap-4 text-sm shadow-none font-mono">
                    <Info className="w-5 h-5 shrink-0 mt-0.5 text-black" />
                    <div className="flex flex-col gap-1.5">
                        <span className="font-bold text-xs uppercase tracking-widest">Process Paused</span>
                        <span className="text-neutral-500 leading-relaxed text-[10px]">
                            The process has been paused by the user. 
                            Your progress is safely saved. Click "{getActionText()}" to continue exactly where you left off.
                        </span>
                    </div>
                </div>
            )}
            
            {status === AppStatus.ERROR && (
                <div className="bg-white border border-black text-black p-5 rounded-none flex items-start gap-4 text-sm shadow-none font-mono">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-black" />
                    <div className="flex flex-col gap-1.5">
                        <span className="font-bold text-xs uppercase tracking-widest">Process Error</span>
                        <span className="text-neutral-500 leading-relaxed text-[10px]">
                            The process was interrupted or encountered an error. 
                            Your progress has been saved. Click "{getActionText()}" to continue from the last saved chapter.
                        </span>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* Right Panel: Logs & Progress */}
        <div className="w-full md:w-1/2 lg:w-7/12 bg-black text-white p-0 flex flex-col relative border-l border-white/10">
          <div className="p-3 border-b border-white/10 bg-neutral-900 flex items-center justify-between z-10 shadow-none px-5">
             <div className="flex gap-2 p-1 bg-black rounded-none border border-white/10">
                <button 
                    onClick={() => setViewMode('logs')}
                    className={`px-3 py-1.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all ${
                        viewMode === 'logs' ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                >
                    Console
                </button>
                <button 
                    onClick={() => setViewMode('chapters')}
                    className={`px-3 py-1.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all ${
                        viewMode === 'chapters' ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                >
                    Chapters ({chapters.length})
                </button>
                {config.enableGlossary && (
                    <button 
                        onClick={() => setViewMode('glossary')}
                        className={`px-3 py-1.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all ${
                            viewMode === 'glossary' ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white'
                        }`}
                    >
                        Glossary
                    </button>
                )}
             </div>

             <div className="text-[10px] font-mono text-neutral-400 bg-black px-3 py-1.5 rounded-none border border-white/10 flex items-center gap-2 min-w-[80px] justify-center tracking-widest uppercase">
                {status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR && status !== AppStatus.PAUSED ? (
                   <>
                     <Loader2 className="w-3 h-3 animate-spin text-white" /> 
                     <span className="font-bold text-white">
                        {status === AppStatus.PARSING ? 'Parsing' : 
                         status === AppStatus.TRANSLATING ? 'Translating' :
                         
                         status === AppStatus.PACKAGING ? 'Packaging' : 'Working'}
                     </span>
                   </>
                ) : (
                    <span className="opacity-60 font-bold">
                        {status === AppStatus.IDLE ? 'Ready' : 
                         status === AppStatus.PAUSED ? 'Paused' :
                         status === AppStatus.COMPLETED ? 'Finished' :
                         status === AppStatus.ERROR ? 'Error' : 'Idle'}
                    </span>
                )}
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {viewMode === 'logs' ? (
                <div className="p-8 font-mono text-xs leading-relaxed space-y-4 text-neutral-400">
                    {logs.length === 0 && (
                        <div className="text-neutral-600 italic text-center mt-20 text-sm">
                            Awaiting manuscript...
                        </div>
                    )}
                    {logs.map((log, idx) => (
                        <div key={idx} className={`flex gap-4 ${
                            log.type === 'error' ? 'text-white bg-black border border-white/20 p-2' :
                            log.type === 'success' ? 'text-white font-bold' :
                            log.type === 'process' ? 'text-neutral-300' : 'text-neutral-500'
                        }`}>
                            <span className="opacity-40 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className="break-words">{log.message}</span>
                        </div>
                    ))}
                    <div ref={logsEndRef} className="h-6" />
                </div>
            ) : viewMode === 'chapters' ? (
                <div className="p-6 space-y-3">
                    {chapters.length === 0 ? (
                        <div className="text-neutral-600 italic text-center mt-20 text-sm font-mono">
                            No chapters extracted yet.
                        </div>
                    ) : (
                        chapters.map((chapter, idx) => {
                            const ai = new AiService(config);
                            const sourceChunks = ai.splitTextIntoChunks(chapter.markdown || '');
                            
                            // Detection Logic (Robust for old data)
                            // We only use heuristic detection if explicit fallback indices are missing (undefined)
                            // If chapter.fallbackChunks is an empty array [], it means the translation succeeded.
                            let explicitFallbacks = chapter.fallbackChunks || [];
                            let implicitFallbacks: number[] = [];
                            
                            // Skip heuristic detection for reference chapters when smart skip is on
                            const shouldSkipHeuristic = config.smartSkip && chapter.isReference;
                            
                            if (chapter.translatedMarkdown && chapter.fallbackChunks === undefined && !shouldSkipHeuristic) {
                                // Method A: Check explicit chunks if they exist
                                if (chapter.translatedChunks && chapter.translatedChunks.length === sourceChunks.length) {
                                    chapter.translatedChunks.forEach((chunk, i) => {
                                        if (i < sourceChunks.length && chunk && chunk.trim() === sourceChunks[i].trim() && !explicitFallbacks.includes(i)) {
                                            implicitFallbacks.push(i);
                                        }
                                    });
                                } 
                                // Method B: Scan the whole markdown for source segments (threshold increased to 40 chars)
                                if (implicitFallbacks.length === 0 && explicitFallbacks.length === 0) {
                                    sourceChunks.forEach((sChunk, i) => {
                                        const trimmed = sChunk.trim();
                                        if (trimmed.length > 40 && chapter.translatedMarkdown!.includes(trimmed)) {
                                            implicitFallbacks.push(i);
                                        }
                                    });
                                }
                            }
                            
                            const detectedFallbacks = [...new Set([...explicitFallbacks, ...implicitFallbacks])].sort((a, b) => a - b);
                            const hasFallbacks = detectedFallbacks.length > 0;
                            
                            // Simplified proofread checks for combined mode
                            const detectedProofreadFallbacks = chapter.fallbackProofreadChunks || [];
                            const hasProofreadFallbacks = detectedProofreadFallbacks.length > 0;

                        const isDone = chapter.translatedMarkdown && (!config.enableProofreading || chapter.proofreadMarkdown);
                        const isSkipped = config.smartSkip && chapter.isSkippable;
                        const isPartiallyDone = (chapter.translatedMarkdown || (config.enableProofreading && chapter.proofreadMarkdown)) && 
                                              (hasFallbacks || (config.enableProofreading && hasProofreadFallbacks));

                        return (
                            <div key={chapter.id} className={`group border rounded-none p-4 transition-all ${
                                isSkipped ? 'bg-black border-white/10 opacity-50' :
                                isPartiallyDone ? 'bg-neutral-800 border-white/30 hover:border-white/50' :
                                isDone ? 'bg-neutral-900/50 border-white/20 hover:border-white/40' :
                                'bg-neutral-900 border-white/10 hover:border-white/30'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-mono opacity-30 w-6">{idx + 1}</span>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono transition-colors text-sm ${
                                                    isSkipped ? 'text-neutral-600' :
                                                    isPartiallyDone ? 'text-white font-bold underline' :
                                                    isDone ? 'text-white font-bold' : 'text-neutral-300'
                                                }`}>
                                                    {chapter.title || 'Untitled Chapter'}
                                                </span>
                                                {isPartiallyDone && (
                                                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-none bg-black border border-white/30">
                                                        <AlertTriangle className="w-3 h-3 text-white" />
                                                        <span className="text-[9px] text-white uppercase font-bold tracking-tighter">Issue Detected</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 mt-1.5 item-center">
                                                {isSkipped ? (
                                                     <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 bg-black px-1.5 py-0.5 rounded-none border border-white/10">Removed</span>
                                                ) : (
                                                    <>
                                                        <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-none border flex items-center gap-1 ${
                                                            chapter.translatedMarkdown 
                                                                ? (detectedFallbacks.length > 0 ? 'bg-black text-white font-bold border-white' : 'bg-white text-black border-white') 
                                                                : 'bg-black text-neutral-500 border-white/20'
                                                        }`}>
                                                            Translate {detectedFallbacks.length > 0 && `(${detectedFallbacks.length} Fallback)`}
                                                        </span>
                                                        {config.enableProofreading && (
                                                            <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-none border flex items-center gap-1 ${
                                                                chapter.proofreadMarkdown 
                                                                    ? (detectedProofreadFallbacks.length > 0 ? 'bg-black text-white font-bold border-white' : 'bg-white text-black border-white')
                                                                    : 'bg-black text-neutral-500 border-white/20'
                                                            }`}>
                                                                Proofread {detectedProofreadFallbacks.length > 0 && `(${detectedProofreadFallbacks.length} Fallback)`}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {!isSkipped && (
                                            <div className="flex gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => setPreviewChapter(chapter)}
                                                    className="p-1.5 rounded-none border border-white/20 bg-black text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                                                    title="Preview Content"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => toggleChapterReference(idx)}
                                                    className={`p-1.5 rounded-none border border-white/20 transition-all ${chapter.isReference ? 'bg-white text-black' : 'bg-black text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                                                    title={chapter.isReference ? "Enable Translation" : "Keep Original (No Translation)"}
                                                >
                                                    <FileCode className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => toggleChapterSkip(idx)}
                                                    className="p-1.5 rounded-none border border-white/20 bg-black text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                                                    title="Skip / Remove Chapter"
                                                >
                                                    <Ban className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                        {isSkipped && (
                                            <button 
                                                onClick={() => toggleChapterSkip(idx)}
                                                className="mr-3 p-1.5 rounded-none border border-white/20 bg-black text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                                                title="Include Chapter"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {!isSkipped && (
                                            <div className="flex gap-2">
                                                {(hasFallbacks || status === AppStatus.IDLE || status === AppStatus.COMPLETED || status === AppStatus.ERROR) && (
                                                    <button 
                                                        onClick={() => {
                                                            // Sync detected fallbacks to the chapter object before retrying
                                                            chapter.fallbackChunks = detectedFallbacks;
                                                            chapter.fallbackProofreadChunks = detectedProofreadFallbacks;
                                                            // Ensure translatedChunks is at least pre-split if missing
                                                            if (!chapter.translatedChunks || chapter.translatedChunks.length !== sourceChunks.length) {
                                                                chapter.translatedChunks = new Array(sourceChunks.length).fill(null);
                                                            }
                                                            handleRetryChapter(idx);
                                                        }}
                                                        disabled={status !== AppStatus.IDLE && status !== AppStatus.ERROR && status !== AppStatus.COMPLETED}
                                                        className={`text-[10px] px-2.5 py-1 rounded-none border transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-none font-mono tracking-widest uppercase ${
                                                            hasFallbacks 
                                                                ? 'bg-white hover:bg-neutral-200 text-black border-white font-bold' 
                                                                : 'bg-black hover:bg-neutral-900 text-white border-white/20 opacity-0 group-hover:opacity-100'
                                                        }`}
                                                    >
                                                        <RefreshCw className="w-3 h-3" /> {hasFallbacks ? `Retry ${detectedFallbacks.length} Chunks` : 'Re-Translate'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {config.enableGlossary && chapter.glossary && (
                                    <div className="mt-3 pt-3 border-t border-stone-800/50">
                                        <details className="cursor-pointer">
                                            <summary className="text-[10px] font-mono text-stone-500 hover:text-stone-300 uppercase tracking-widest transition-colors focus:outline-none">
                                                View Glossary
                                            </summary>
                                            <div className="mt-2 text-[11px] font-mono text-stone-400 bg-stone-950/50 p-2 rounded border border-stone-800/50 whitespace-pre-wrap leading-relaxed">
                                                {chapter.glossary}
                                            </div>
                                        </details>
                                    </div>
                                )}
                            </div>
                        );
                    })
                    )}
                </div>
            ) : (
                <div className="p-8 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                            <h2 className="text-white font-mono text-xl uppercase tracking-widest font-bold">Cumulative Glossary</h2>
                            <p className="text-[10px] text-neutral-500 font-mono mt-1 uppercase tracking-tight">
                                {isBulkEdit ? 'Bulk Edit Mode' : 'Table View Mode'}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                             <button 
                                onClick={() => optimizeGlossary(true)}
                                disabled={isCleaningGlossary || isWorking}
                                className={`text-[10px] px-3 py-1.5 rounded-none flex items-center gap-2 border transition-all font-mono tracking-widest uppercase ${
                                    isCleaningGlossary 
                                        ? 'bg-white text-black border-white' 
                                        : 'text-neutral-400 hover:text-white border-white/20 hover:border-white/50'
                                } disabled:opacity-50`}
                                title="Use AI to remove noise and redundancies"
                            >
                                {isCleaningGlossary ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3" />}
                                {isCleaningGlossary ? 'Cleaning...' : 'Smart Cleanup'}
                            </button>
                             <button 
                                onClick={() => setIsBulkEdit(!isBulkEdit)}
                                className="text-[10px] px-3 py-1.5 rounded-none font-mono tracking-widest uppercase text-neutral-400 hover:text-white border border-white/20 hover:border-white/50 transition-all"
                            >
                                {isBulkEdit ? 'Switch to Table' : 'Switch to Text'}
                            </button>
                             <button 
                                onClick={() => isBulkEdit ? handleUpdateGlossary(liveGlossary) : handleSaveGlossaryMap()}
                                className="text-[10px] px-3 py-1.5 rounded-none bg-white hover:bg-neutral-200 text-black font-bold font-mono uppercase tracking-widest transition-all shadow-none flex items-center gap-2 border border-white"
                            >
                                <Save className="w-3 h-3" /> Save Changes
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-hidden flex flex-col bg-black border border-white/10 rounded-none relative group shadow-none">
                        {isBulkEdit ? (
                            <textarea 
                                value={liveGlossary}
                                onChange={(e) => setLiveGlossary(e.target.value)}
                                placeholder="No terms extracted yet..."
                                className="w-full h-full p-6 font-mono text-sm text-neutral-300 outline-none transition-colors resize-none bg-transparent custom-scrollbar"
                            />
                        ) : (
                            <div className="flex-1 overflow-x-hidden overflow-y-auto custom-scrollbar p-2">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="p-3 text-[10px] uppercase tracking-widest text-neutral-500 font-mono font-bold">Source</th>
                                            <th className="p-3 text-[10px] uppercase tracking-widest text-neutral-500 font-mono font-bold">Translation</th>
                                            <th className="p-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {Object.entries(glossaryMap).sort().map(([key, value], idx) => (
                                            <tr key={idx} className="group/row hover:bg-neutral-900 transition-colors">
                                                <td className="p-1">
                                                    <input 
                                                        type="text" 
                                                        value={key}
                                                        onChange={(e) => handleUpdateTerm(key, e.target.value, value as string)}
                                                        className="w-full bg-transparent p-2 text-white outline-none focus:bg-neutral-800 rounded-none transition-colors font-mono text-sm"
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input 
                                                        type="text" 
                                                        value={value}
                                                        onChange={(e) => handleUpdateTerm(key, key, e.target.value)}
                                                        className="w-full bg-transparent p-2 text-neutral-400 focus:text-white outline-none focus:bg-neutral-800 rounded-none transition-colors font-mono text-sm"
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <button 
                                                        onClick={() => handleDeleteTerm(key)}
                                                        className="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-none hover:bg-neutral-800 opacity-0 group-hover/row:opacity-100 border border-transparent hover:border-white/20"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {Object.keys(glossaryMap).length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="p-8 text-center text-neutral-600 italic font-mono text-sm">
                                                    No terms extracted yet...
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <div className="p-3 border-t border-white/10 mt-1">
                                    <button 
                                        onClick={handleAddTerm}
                                        className="flex items-center gap-2 text-[10px] font-mono text-neutral-500 hover:text-white transition-colors uppercase tracking-widest py-1"
                                    >
                                        <Plus className="w-3 h-3" /> Add Term
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="mt-4 p-4 rounded-none bg-neutral-900 border border-white/10 flex items-start gap-3">
                        <div className="w-5 h-5 rounded-none bg-black border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
                            <Info className="w-3 h-3 text-neutral-400" />
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-relaxed font-mono uppercase tracking-widest">
                            Modifying this table directly updates the database. The AI will only contribute <strong>New Terms</strong> while maintaining consistency with these definitions.
                        </p>
                    </div>
                </div>
            )}
          </div>

          {/* Progress Bar (Visual) */}
          <div className="h-1 bg-black w-full absolute bottom-0 left-0">
            <div 
                className={`h-full transition-all duration-500 ease-out ${status === AppStatus.ERROR ? 'bg-white/50' : 'bg-white'}`}
                style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

      </main>

      {/* Preview Modal */}
      {previewChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-4xl h-[90vh] flex flex-col rounded-none shadow-none overflow-hidden border border-black animate-in zoom-in-95 duration-200">
                  <div className="bg-black px-6 py-4 flex items-center justify-between border-b border-black">
                      <div className="flex items-center gap-3">
                        <Info className="w-5 h-5 text-white" />
                        <h2 className="text-xl font-mono uppercase tracking-widest font-bold text-white">Chapter Preview</h2>
                      </div>
                      <button 
                        onClick={() => setPreviewChapter(null)}
                        className="p-2 hover:bg-neutral-800 rounded-none transition-colors text-neutral-400 hover:text-white border border-transparent hover:border-white/20"
                      >
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 md:p-12 font-sans text-black leading-relaxed bg-white">
                      <div className="max-w-2xl mx-auto">
                        <h1 className="text-3xl font-bold text-black mb-8 pb-4 border-b border-black font-sans">
                            {previewChapter.title}
                        </h1>
                        <div className="markdown-body prose prose-stone prose-lg max-w-none">
                            <ReactMarkdown
                                components={{
                                    img: ({ src, alt }) => (
                                        <MarkdownImage 
                                            src={src} 
                                            alt={alt} 
                                            chapterPath={previewChapter.fileName} 
                                            persistence={persistenceService.current} 
                                        />
                                    )
                                }}
                            >
                                {previewChapter.markdown || ""}
                            </ReactMarkdown>
                        </div>
                      </div>
                  </div>
                  <div className="bg-white px-6 py-4 flex items-center justify-center border-t border-black text-black font-mono text-[10px] uppercase tracking-widest font-bold">
                      This is the source content extracted from the EPUB.
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;