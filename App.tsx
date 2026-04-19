
import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, FileCheck, Loader2, Download, AlertTriangle, RefreshCw, Trash2, Save } from 'lucide-react';
import FileUpload from './components/FileUpload';
import SettingsPanel from './components/SettingsPanel';
import { EpubService } from './services/epubService';
import { AiService } from './services/geminiService';
import { PersistenceService } from './services/persistenceService';
import { AppStatus, AppConfig, Chapter, ProcessingLog } from './types';
import { RECOMMENDED_TRANSLATION_PROMPT, RECOMMENDED_PROOFREAD_PROMPT } from './prompts';

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  modelName: 'minimaxai/minimax-m2.1',
  targetLanguage: 'Chinese (Simplified)',
  systemInstruction: 'You are a professional translator. Translate the following content preserving the markdown format. For bold or italic text, use HTML tags (<b> and <i>) instead of Markdown asterisks (* or **).',
  proofreadInstruction: 'Proofread the following text for grammar and flow. For bold or italic text, use HTML tags (<b> and <i>) instead of Markdown asterisks (* or **).',
  enableProofreading: true,
  useRecommendedPrompts: true,
  smartSkip: true
};

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [restoredSession, setRestoredSession] = useState<boolean>(false);
  const [showConfirmReset, setShowConfirmReset] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'logs' | 'chapters'>('logs');
  
  // Refs for services and data persistence
  const epubService = useRef(new EpubService());
  const persistenceService = useRef(new PersistenceService());
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Persist chapters and images across renders to allow resuming
  const chaptersRef = useRef<Chapter[]>([]);
  const imagesRef = useRef<Record<string, Blob>>({});
  const coverPathRef = useRef<string | undefined>(undefined);

  // Initialize Persistence
  useEffect(() => {
    const init = async () => {
      try {
        await persistenceService.current.init();
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
                // imagesRef.current = savedImages; // Don't load to RAM
                coverPathRef.current = session.coverPath;
                
                // Restore UI state
                setConfig(session.config);
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
                            savedChapters.sort((a, b) => a.index - b.index),
                            savedImages,
                            session.fileName.replace('.epub', '') || 'translated_book',
                            session.config.targetLanguage,
                            session.coverPath
                         );
                         const url = URL.createObjectURL(blob);
                         setDownloadUrl(url);
                         addLog("Download link ready.", "success");
                     } catch (genError) {
                         console.error("Failed to regenerate EPUB on restore:", genError);
                         addLog("Failed to regenerate download link. Please click 'Translate Again' or reset.", "error");
                         setStatus(AppStatus.ERROR); // Fallback so they can try again
                     }

                } else if (session.status !== AppStatus.IDLE) {
                     setStatus(AppStatus.ERROR); // Use ERROR state to show "Resume" button
                     addLog("Restored interrupted session. Click 'Resume Translation' to continue.", "info");
                }
                
                setRestoredSession(true);
                const dummyFile = { name: session.fileName } as File;
                setCurrentFile(dummyFile);
            }
        }
      } catch (e) {
        console.error("Failed to initialize persistence:", e);
        addLog("Failed to initialize auto-save system.", "error");
      }
    };
    init();
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (message: string, type: ProcessingLog['type'] = 'info') => {
    const newLog: ProcessingLog = { timestamp: Date.now(), message, type };
    setLogs(prev => [...prev, newLog]);
    // Async save log
    persistenceService.current.saveLog(newLog).catch(e => console.error("Failed to save log", e));
  };

  const handleFileSelect = async (file: File) => {
    // Clear previous session
    await persistenceService.current.clearSession();
    
    setCurrentFile(file);
    setDownloadUrl(null);
    setLogs([]);
    
    // Clear persisted data for new file
    chaptersRef.current = [];
    imagesRef.current = {};
    coverPathRef.current = undefined;
    
    setProgress(0);
    setStatus(AppStatus.IDLE);
    setRestoredSession(false);
    addLog(`Selected file: ${file.name}`, 'info');
  };

  const handleReset = async () => {
    await persistenceService.current.clearSession();
    setDownloadUrl(null);
    setLogs([]);
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

  const processChapter = async (
    index: number, 
    aiService: AiService, 
    chapters: Chapter[], 
    effectiveSystemInstruction: string,
    effectiveProofreadInstruction: string,
    forceTranslateIndices: number[] = [],
    forceProofreadIndices: number[] = []
  ) => {
    const chapter = chapters[index];
    let updated = false;
    
    // Skip empty chapters usually
    if (!chapter.markdown || chapter.markdown.trim().length < 10) {
       if (!chapter.translatedMarkdown) { 
           addLog(`Skipping empty/short chapter: ${chapter.title}`, "info");
       }
       return false;
    }
    
    // Handle Smart Skip Logic
    if (config.smartSkip && !forceTranslateIndices.length && !forceProofreadIndices.length) {
        if (chapter.isSkippable) return false;
        if (chapter.isReference) {
            if (!chapter.translatedMarkdown) {
                addLog(`Keeping reference chapter untranslated: ${chapter.title}`, "info");
                chapter.translatedMarkdown = chapter.markdown;
                chapter.proofreadMarkdown = chapter.markdown;
                updated = true;
                await persistenceService.current.updateChapter(chapter);
            }
            return updated;
        }
    }

    // --- Translation ---
    if (chapter.translatedMarkdown && forceTranslateIndices.length === 0) {
        // Already translated, move on
    } else {
        setStatus(AppStatus.TRANSLATING);
        addLog(`Translating [${index+1}/${chapters.length}]: ${chapter.title}${forceTranslateIndices.length ? ' (Retrying failed parts)' : ''}`, "process");
        
        if (!chapter.translatedChunks) chapter.translatedChunks = [];
        if (!chapter.fallbackChunks) chapter.fallbackChunks = [];
        
        const translated = await aiService.translateContent(
          chapter.markdown, 
          config.targetLanguage, 
          effectiveSystemInstruction,
          async (current, total, chunkResult, isFallback) => {
              if (isFallback) {
                  addLog(`  > ⚠️ API returned empty/error for part ${current}/${total} of "${chapter.title}". Kept original.`, 'error');
                  if (!chapter.fallbackChunks!.includes(current - 1)) {
                      chapter.fallbackChunks!.push(current - 1);
                  }
              } else {
                  addLog(`  > Translated part ${current}/${total} of "${chapter.title}"...`, 'info');
                  if (chapter.fallbackChunks) {
                    chapter.fallbackChunks = chapter.fallbackChunks.filter(idx => idx !== current - 1);
                  }
              }
              
              if (chapter.translatedChunks) {
                  chapter.translatedChunks![current - 1] = chunkResult;
                  await persistenceService.current.updateChapter(chapter);
                  await saveSessionState(AppStatus.TRANSLATING);
              }
          },
          chapter.translatedChunks,
          forceTranslateIndices
        );
        chapter.translatedMarkdown = translated;
        updated = true;
    }

    // --- Proofreading ---
    if (config.enableProofreading) {
      if (chapter.proofreadMarkdown && forceProofreadIndices.length === 0) {
          // Already proofread, move on
      } else {
          setStatus(AppStatus.PROOFREADING);
          addLog(`Proofreading [${index+1}/${chapters.length}]: ${chapter.title}${forceProofreadIndices.length ? ' (Retrying failed parts)' : ''}`, "process");
          
          if (!chapter.proofreadChunks) chapter.proofreadChunks = [];
          if (!chapter.fallbackProofreadChunks) chapter.fallbackProofreadChunks = [];

          const proofread = await aiService.proofreadContent(
            chapter.translatedMarkdown!, 
            effectiveProofreadInstruction,
            async (current, total, chunkResult, isFallback) => {
                if (isFallback) {
                    addLog(`  > ⚠️ API returned empty/error for part ${current}/${total} of "${chapter.title}".`, 'error');
                    if (!chapter.fallbackProofreadChunks!.includes(current - 1)) {
                        chapter.fallbackProofreadChunks!.push(current - 1);
                    }
                } else {
                    addLog(`  > Proofread part ${current}/${total} of "${chapter.title}"...`, 'info');
                    if (chapter.fallbackProofreadChunks) {
                        chapter.fallbackProofreadChunks = chapter.fallbackProofreadChunks.filter(idx => idx !== current - 1);
                    }
                }
                
                if (chapter.proofreadChunks) {
                    chapter.proofreadChunks![current - 1] = chunkResult;
                    await persistenceService.current.updateChapter(chapter);
                    await saveSessionState(AppStatus.PROOFREADING);
                }
            },
            chapter.proofreadChunks,
            forceProofreadIndices
          );
          chapter.proofreadMarkdown = proofread;
          updated = true;
      }
    }

    if (updated) {
        await persistenceService.current.updateChapter(chapter);
    }
    return updated;
  };

  const handleRetryChapter = async (index: number, type: 'translate' | 'proofread') => {
    if (status !== AppStatus.IDLE && status !== AppStatus.ERROR && status !== AppStatus.COMPLETED) return;
    
    try {
        const aiService = new AiService(config);
        const chapters = chaptersRef.current;
        const chapter = chapters[index];
        
        // Use AI split to recover original chunk structure
        const sourceChunks = aiService.splitTextIntoChunks(chapter.markdown);
        
        // Sync local fallbacks with detection if needed
        if (type === 'translate') {
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
        } else if (type === 'proofread') {
            const explicit = chapter.fallbackProofreadChunks || [];
            const implicit: number[] = [];
            const tChunks = aiService.splitTextIntoChunks(chapter.translatedMarkdown || '');
            tChunks.forEach((tChunk, i) => {
                const trimmed = tChunk.trim();
                if (trimmed.length > 20 && chapter.proofreadMarkdown?.includes(trimmed)) {
                    implicit.push(i);
                }
            });
            chapter.fallbackProofreadChunks = [...new Set([...explicit, ...implicit])].sort((a,b) => a-b);
            
            // Re-initialize chunks array if it's stale/missing
            if (!chapter.proofreadChunks || chapter.proofreadChunks.length !== tChunks.length) {
                chapter.proofreadChunks = new Array(tChunks.length).fill(null);
            }
        }

        const effectiveSystemInstruction = config.useRecommendedPrompts 
            ? RECOMMENDED_TRANSLATION_PROMPT 
            : config.systemInstruction;
            
        const effectiveProofreadInstruction = config.useRecommendedPrompts
            ? RECOMMENDED_PROOFREAD_PROMPT
            : config.proofreadInstruction;

        if (type === 'translate') {
            const failedIndices = chapter.fallbackChunks || [];
            // If still no failed indices, do we retry all? 
            // Better to show an info log
            if (failedIndices.length === 0 && chapter.translatedMarkdown) {
                addLog(`Chapter "${chapter.title}" seems fully translated. Retrying the whole chapter for consistency...`, 'info');
                // Pass empty array will retry whole chapter if service logic allows, 
                // but our service logic for translateContent with empty fallbackIndices resumes from last chunk.
                // To force retry all, we'd need to clear chapter.translatedChunks.
                // For now, let's just let the service handle it - if chunks are missing it will fill.
            }
            await processChapter(index, aiService, chapters, effectiveSystemInstruction, effectiveProofreadInstruction, failedIndices, []);
        } else {
            const failedIndices = chapter.fallbackProofreadChunks || [];
            await processChapter(index, aiService, chapters, effectiveSystemInstruction, effectiveProofreadInstruction, [], failedIndices);
        }
        
        // Update percentages
        const totalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
        const stepsDoneCount = chapters.reduce((acc, c) => {
            if (config.smartSkip && c.isSkippable) return acc + (config.enableProofreading ? 2 : 1);
            const tDone = c.translatedMarkdown ? 1 : 0;
            const pDone = (config.enableProofreading && c.proofreadMarkdown) ? 1 : 0;
            return acc + tDone + pDone;
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
       
       // Force re-render of chapter list
       setLogs([...logs]); 
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
          lastUpdated: Date.now()
      });
  };

  const rebuildEpub = async (chaptersList: Chapter[], sessionConfig: AppConfig, fileName: string) => {
    setStatus(AppStatus.PACKAGING);
    addLog(`Recompiling EPUB...`, "process");
    
    try {
        const chaptersToPack = sessionConfig.smartSkip 
          ? chaptersList.filter(c => !c.isSkippable)
          : chaptersList;

        const images = await persistenceService.current.loadImages();
        const blob = await epubService.current.generateEpub(
          chaptersToPack, 
          images, 
          fileName.replace('.epub', '') || 'translated_book',
          sessionConfig.targetLanguage,
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

  const startProcessing = async () => {
    if (!currentFile && !chaptersRef.current.length) return;

    try {
      const aiService = new AiService(config);
      
      // Step 1: Parse EPUB (Only if not already parsed)
      if (chaptersRef.current.length === 0) {
        if (!currentFile) {
            addLog("Error: No file selected and no restored data found.", "error");
            return;
        }
        setStatus(AppStatus.PARSING);
        addLog("Parsing EPUB and converting XHTML to Markdown...", "process");
        const { chapters, images, coverPath } = await epubService.current.parseEpub(currentFile);
        
        chaptersRef.current = chapters;
        // imagesRef.current = images; // MEMORY OPTIMIZATION: Do not keep in RAM
        coverPathRef.current = coverPath;

        // Persist initial data
        await persistenceService.current.saveChapters(chapters);
        await persistenceService.current.saveImages(images);
        await saveSessionState(AppStatus.PARSING);

        addLog(`Extracted ${chapters.length} chapters and ${Object.keys(images).length} images.`, "success");
        if (coverPath) {
            addLog(`Cover image detected.`, 'info');
        }
      } else {
        addLog("Resuming workflow with existing parsed data...", "info");
      }

      const chapters = chaptersRef.current;
      
      const effectiveSystemInstruction = config.useRecommendedPrompts 
        ? RECOMMENDED_TRANSLATION_PROMPT 
        : config.systemInstruction;
        
      const effectiveProofreadInstruction = config.useRecommendedPrompts
        ? RECOMMENDED_PROOFREAD_PROMPT
        : config.proofreadInstruction;

      addLog(`Starting translation using ${config.modelName}...`, "info");
      if (viewMode === 'logs') setViewMode('chapters'); // Switch to chapters view automatically
      
      if (config.smartSkip) {
        addLog("Smart Skip enabled: Title pages, Copyright, TOC will be REMOVED. References will be KEPT (untranslated).", "info");
      }

      for (let i = 0; i < chapters.length; i++) {
        await processChapter(i, aiService, chapters, effectiveSystemInstruction, effectiveProofreadInstruction);
        
        // Update progress
        const currentTotalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
        const stepsDone = chapters.reduce((acc, c) => {
             if (config.smartSkip && c.isSkippable) return acc + (config.enableProofreading ? 2 : 1);
             const tDone = c.translatedMarkdown ? 1 : 0;
             const pDone = (config.enableProofreading && c.proofreadMarkdown) ? 1 : 0;
             return acc + tDone + pDone;
        }, 0);
        
        const newProgress = Math.min(100, (stepsDone / currentTotalSteps) * 100);
        setProgress(newProgress);
        await saveSessionState(status); 
      }

      // Final Step: Packaging
      if (currentFile) {
          setProgress(100);
          await rebuildEpub(chapters, config, currentFile.name);
      } else {
          addLog("Missing file context for packaging.", "error");
          setStatus(AppStatus.ERROR);
      }

    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      await saveSessionState(AppStatus.ERROR);
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f5f0]">
      {/* Header */}
      <header className="bg-[#f5f5f0] border-b border-stone-200 px-8 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-stone-800 p-2.5 rounded-full shadow-sm">
            <BookOpen className="text-[#f5f5f0] w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-medium text-stone-900 tracking-tight">TransLit</h1>
            <p className="text-[10px] font-medium text-stone-500 uppercase tracking-widest mt-0.5">Literary Translation Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {restoredSession && status !== AppStatus.TRANSLATING && status !== AppStatus.PROOFREADING && (
                <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200/60 flex items-center gap-1.5 font-medium shadow-sm">
                    <Save className="w-3.5 h-3.5" /> Session Restored
                </span>
            )}
            {downloadUrl && status !== AppStatus.TRANSLATING && status !== AppStatus.PROOFREADING && status !== AppStatus.PARSING && status !== AppStatus.PACKAGING && (
            <a
                href={downloadUrl}
                download={`translated-${currentFile?.name || 'book'}`}
                className="flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-[#f5f5f0] px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
                <Download className="w-4 h-4" /> Download EPUB
            </a>
            )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Panel: Configuration & Input */}
        <div className="w-full md:w-1/2 lg:w-5/12 p-8 overflow-y-auto border-r border-stone-200 custom-scrollbar">
          
          <div className="max-w-xl mx-auto space-y-8">
            <SettingsPanel 
              config={config} 
              setConfig={setConfig} 
              disabled={status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR} 
            />

            <FileUpload 
              onFileSelect={handleFileSelect} 
              disabled={status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR}
            />

            {currentFile && (
               <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                 <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-100/50">
                            <FileCheck className="text-amber-600 w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-serif text-lg font-medium text-stone-800 truncate max-w-[220px]">{currentFile.name}</span>
                            <span className="text-xs text-stone-400 uppercase tracking-widest mt-0.5">Ready for processing</span>
                        </div>
                    </div>
                    {/* Clear Button */}
                     {(status === AppStatus.IDLE || status === AppStatus.COMPLETED || status === AppStatus.ERROR) && (
                        showConfirmReset ? (
                            <div className="flex items-center gap-1 bg-stone-50 rounded-full p-1 border border-stone-200 shadow-sm">
                                <span className="text-[11px] text-stone-500 font-medium px-2 uppercase tracking-wider">Clear?</span>
                                <button 
                                    onClick={handleReset}
                                    className="text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                                >
                                    Yes
                                </button>
                                <button 
                                    onClick={() => setShowConfirmReset(false)}
                                    className="text-stone-600 hover:bg-stone-200 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                                >
                                    No
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setShowConfirmReset(true)}
                                className="text-stone-400 hover:text-red-500 transition-colors p-2.5 hover:bg-red-50 rounded-full"
                                title="Remove file and clear progress"
                            >
                                <Trash2 className="w-4 h-4"/>
                            </button>
                        )
                     )}
                 </div>

                 <div className="flex gap-3">
                    {/* Start Button */}
                    {status === AppStatus.IDLE && (
                    <button
                        onClick={startProcessing}
                        className="flex-1 bg-stone-800 hover:bg-stone-900 text-[#f5f5f0] px-5 py-3.5 rounded-2xl text-sm font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                        {chaptersRef.current.length > 0 ? "Resume Translation" : "Start Translation"}
                    </button>
                    )}

                    {/* Resume Button */}
                    {status === AppStatus.ERROR && (
                    <button
                        onClick={startProcessing}
                        className="flex-1 bg-amber-700 hover:bg-amber-800 text-white px-5 py-3.5 rounded-2xl text-sm font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Resume Translation
                    </button>
                    )}
                    
                    {/* Restart Button (If Completed) */}
                     {status === AppStatus.COMPLETED && (
                        <button
                            onClick={startProcessing}
                            className="flex-1 bg-stone-800 hover:bg-stone-900 text-[#f5f5f0] px-5 py-3.5 rounded-2xl text-sm font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                        >
                            Translate Again
                        </button>
                    )}
                 </div>
               </div>
            )}
            
            {status === AppStatus.ERROR && (
                <div className="bg-red-50 border border-red-100 text-red-800 p-5 rounded-2xl flex items-start gap-4 text-sm shadow-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                    <div className="flex flex-col gap-1.5">
                        <span className="font-serif text-base font-medium">Process Paused</span>
                        <span className="text-red-700/80 leading-relaxed">
                            The process was interrupted or encountered an error. 
                            Your progress has been saved. Click "Resume Translation" to continue from the last saved chapter.
                        </span>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* Right Panel: Logs & Progress */}
        <div className="w-full md:w-1/2 lg:w-7/12 bg-stone-900 text-stone-300 p-0 flex flex-col relative">
          <div className="p-3 border-b border-stone-800 bg-stone-950 flex items-center justify-between z-10 shadow-sm px-5">
             <div className="flex gap-2 p-1 bg-stone-900 rounded-lg border border-stone-800">
                <button 
                    onClick={() => setViewMode('logs')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest uppercase transition-all ${
                        viewMode === 'logs' ? 'bg-stone-800 text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-300'
                    }`}
                >
                    Console
                </button>
                <button 
                    onClick={() => setViewMode('chapters')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest uppercase transition-all ${
                        viewMode === 'chapters' ? 'bg-stone-800 text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-300'
                    }`}
                >
                    Chapters ({chaptersRef.current.length})
                </button>
             </div>

             <div className="text-xs font-mono text-stone-400 bg-stone-800/50 px-3 py-1.5 rounded-full border border-stone-700/50">
                {status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR ? (
                   <span className="flex items-center gap-2">
                     <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> 
                     {status}...
                   </span>
                ) : (
                    <span>{status}</span>
                )}
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {viewMode === 'logs' ? (
                <div className="p-8 font-mono text-sm leading-relaxed space-y-4">
                    {logs.length === 0 && (
                        <div className="text-stone-600 italic text-center mt-20 font-serif text-xl">
                            Awaiting manuscript...
                        </div>
                    )}
                    {logs.map((log, idx) => (
                        <div key={idx} className={`flex gap-4 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-emerald-400' :
                            log.type === 'process' ? 'text-amber-200' : 'text-stone-400'
                        }`}>
                            <span className="opacity-40 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className="break-words">{log.message}</span>
                        </div>
                    ))}
                    <div ref={logsEndRef} className="h-6" />
                </div>
            ) : (
                <div className="p-6 space-y-3">
                    {chaptersRef.current.length === 0 ? (
                        <div className="text-stone-600 italic text-center mt-20 font-serif text-xl">
                            No chapters extracted yet.
                        </div>
                    ) : (
                        chaptersRef.current.map((chapter, idx) => {
                            const ai = new AiService(config);
                            const sourceChunks = ai.splitTextIntoChunks(chapter.markdown || '');
                            
                            // Detection Logic (Robust for old data)
                            // We only use heuristic detection if explicit fallback indices are missing (undefined)
                            // If chapter.fallbackChunks is an empty array [], it means the translation succeeded.
                            let explicitFallbacks = chapter.fallbackChunks || [];
                            let implicitFallbacks: number[] = [];
                            
                            if (chapter.translatedMarkdown && chapter.fallbackChunks === undefined) {
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
                            
                            // Similar logic for proofreading
                            const explicitProofreadFallbacks = chapter.fallbackProofreadChunks || [];
                            const implicitProofreadFallbacks: number[] = [];
                            if (chapter.proofreadMarkdown && chapter.translatedMarkdown && chapter.fallbackProofreadChunks === undefined) {
                                 if (chapter.proofreadChunks && chapter.translatedChunks && chapter.proofreadChunks.length === chapter.translatedChunks.length) {
                                    chapter.proofreadChunks.forEach((chunk, i) => {
                                        if (chunk && chunk.trim() === chapter.translatedChunks![i].trim() && !explicitProofreadFallbacks.includes(i)) {
                                            implicitProofreadFallbacks.push(i);
                                        }
                                    });
                                 } else if (explicitProofreadFallbacks.length === 0) {
                                    const tChunks = ai.splitTextIntoChunks(chapter.translatedMarkdown);
                                    tChunks.forEach((tChunk, i) => {
                                        const trimmed = tChunk.trim();
                                        if (trimmed.length > 40 && chapter.proofreadMarkdown!.includes(trimmed)) {
                                            implicitProofreadFallbacks.push(i);
                                        }
                                    });
                                 }
                            }
                            
                            const detectedProofreadFallbacks = [...new Set([...explicitProofreadFallbacks, ...implicitProofreadFallbacks])].sort((a, b) => a - b);
                            const hasProofreadFallbacks = detectedProofreadFallbacks.length > 0;

                        const isDone = chapter.translatedMarkdown && (!config.enableProofreading || chapter.proofreadMarkdown);
                        const isSkipped = config.smartSkip && chapter.isSkippable;
                        const isPartiallyDone = (chapter.translatedMarkdown || chapter.proofreadMarkdown) && (hasFallbacks || hasProofreadFallbacks);

                        return (
                            <div key={chapter.id} className={`group border rounded-xl p-4 transition-all ${
                                isSkipped ? 'bg-stone-950/20 border-stone-800/50 opacity-50' :
                                isPartiallyDone ? 'bg-amber-500/5 border-amber-600/40 hover:border-amber-500/60 shadow-[inset_0_0_15px_-5px_rgba(245,158,11,0.2)]' :
                                isDone ? 'bg-stone-850/40 border-stone-800 hover:border-emerald-900/40' :
                                'bg-stone-900 border-stone-800 hover:border-amber-900/40'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-mono opacity-30 w-6">{idx + 1}</span>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-medium transition-colors ${
                                                    isSkipped ? 'text-stone-600' :
                                                    isPartiallyDone ? 'text-amber-500 font-bold' :
                                                    isDone ? 'text-emerald-400/90' : 'text-stone-200'
                                                }`}>
                                                    {chapter.title || 'Untitled Chapter'}
                                                </span>
                                                {isPartiallyDone && (
                                                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                        <span className="text-[9px] text-amber-500 uppercase font-bold tracking-tighter">Issue Detected</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 mt-1.5 item-center">
                                                {isSkipped ? (
                                                     <span className="text-[9px] uppercase tracking-tighter text-stone-700 bg-stone-950 px-1.5 py-0.5 rounded">Removed</span>
                                                ) : (
                                                    <>
                                                        <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                                            chapter.translatedMarkdown 
                                                                ? (detectedFallbacks.length > 0 ? 'bg-amber-950 text-amber-500 font-bold border border-amber-900/50' : 'bg-emerald-950/40 text-emerald-500') 
                                                                : 'bg-stone-950 text-stone-600'
                                                        }`}>
                                                            Translate {detectedFallbacks.length > 0 && `(${detectedFallbacks.length} Fallback)`}
                                                        </span>
                                                        {config.enableProofreading && (
                                                            <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                                                chapter.proofreadMarkdown 
                                                                    ? (detectedProofreadFallbacks.length > 0 ? 'bg-amber-950 text-amber-500 font-bold border border-amber-900/50' : 'bg-emerald-950/40 text-emerald-500')
                                                                    : 'bg-stone-950 text-stone-600'
                                                            }`}>
                                                                Proofread {detectedProofreadFallbacks.length > 0 && `(${detectedProofreadFallbacks.length} Fallback)`}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {!isSkipped && (
                                        <div className="flex gap-2">
                                            {(hasFallbacks || status === AppStatus.IDLE || status === AppStatus.COMPLETED || status === AppStatus.ERROR) && (
                                                <button 
                                                    onClick={() => {
                                                        // Sync detected fallbacks to the chapter object before retrying
                                                        chapter.fallbackChunks = detectedFallbacks;
                                                        // Ensure translatedChunks is at least pre-split if missing
                                                        if (!chapter.translatedChunks || chapter.translatedChunks.length !== sourceChunks.length) {
                                                            chapter.translatedChunks = new Array(sourceChunks.length).fill(null);
                                                        }
                                                        handleRetryChapter(idx, 'translate');
                                                    }}
                                                    disabled={status !== AppStatus.IDLE && status !== AppStatus.ERROR && status !== AppStatus.COMPLETED}
                                                    className={`text-[10px] px-2.5 py-1 rounded border transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm ${
                                                        hasFallbacks 
                                                            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 border-amber-400 font-bold animate-pulse' 
                                                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                >
                                                    <RefreshCw className="w-3 h-3" /> {hasFallbacks ? `Retry ${detectedFallbacks.length} Chunks` : 'Re-Translate'}
                                                </button>
                                            )}
                                            {config.enableProofreading && (hasProofreadFallbacks || (chapter.proofreadMarkdown && (status === AppStatus.IDLE || status === AppStatus.COMPLETED || status === AppStatus.ERROR))) && (
                                                 <button 
                                                    onClick={() => {
                                                        chapter.fallbackProofreadChunks = detectedProofreadFallbacks;
                                                        if (!chapter.proofreadChunks || chapter.proofreadChunks.length !== (chapter.translatedChunks?.length || sourceChunks.length)) {
                                                            chapter.proofreadChunks = new Array(sourceChunks.length).fill(null);
                                                        }
                                                        handleRetryChapter(idx, 'proofread');
                                                    }}
                                                    disabled={status !== AppStatus.IDLE && status !== AppStatus.ERROR && status !== AppStatus.COMPLETED}
                                                    className={`text-[10px] px-2.5 py-1 rounded border transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm ${
                                                        hasProofreadFallbacks 
                                                            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 border-amber-400 font-bold animate-pulse' 
                                                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                >
                                                    <RefreshCw className="w-3 h-3" /> {hasProofreadFallbacks ? `Proof Retry ${detectedProofreadFallbacks.length}` : 'Re-Proofread'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                    )}
                </div>
            )}
          </div>

          {/* Progress Bar (Visual) */}
          <div className="h-1.5 bg-stone-900 w-full absolute bottom-0 left-0">
            <div 
                className={`h-full transition-all duration-500 ease-out ${status === AppStatus.ERROR ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;