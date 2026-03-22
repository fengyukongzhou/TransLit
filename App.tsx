
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
  systemInstruction: 'You are a professional translator. Translate the following content preserving the markdown format.',
  proofreadInstruction: 'Proofread the following text for grammar and flow.',
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
      // const images = imagesRef.current; // MEMORY OPTIMIZATION: Don't load yet

      // Step 2 & 3: Translate & Proofread Loop
      const totalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
      
      const effectiveSystemInstruction = config.useRecommendedPrompts 
        ? RECOMMENDED_TRANSLATION_PROMPT 
        : config.systemInstruction;
        
      const effectiveProofreadInstruction = config.useRecommendedPrompts
        ? RECOMMENDED_PROOFREAD_PROMPT
        : config.proofreadInstruction;

      addLog(`Starting translation using ${config.modelName}...`, "info");
      if (config.smartSkip) {
        addLog("Smart Skip enabled: Title pages, Copyright, TOC will be REMOVED. References will be KEPT (untranslated).", "info");
      }

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        let updated = false;
        
        // Skip empty chapters usually
        if (!chapter.markdown || chapter.markdown.trim().length < 10) {
           if (!chapter.translatedMarkdown) { // Only log if not already processed/skipped
               addLog(`Skipping empty/short chapter: ${chapter.title}`, "info");
           }
           continue;
        }
        
        // Handle Smart Skip Logic
        if (config.smartSkip) {
            // Case 1: Skippable (Copyright, TOC, etc.) -> Remove completely from output
            if (chapter.isSkippable) {
                 continue;
            }

            // Case 2: Reference (Bibliography, etc.) -> Keep but don't translate
            if (chapter.isReference) {
                if (!chapter.translatedMarkdown) {
                    addLog(`Keeping reference chapter untranslated: ${chapter.title}`, "info");
                    chapter.translatedMarkdown = chapter.markdown;
                    chapter.proofreadMarkdown = chapter.markdown;
                    updated = true;
                }
            }
        }

        // --- Translation ---
        if (chapter.translatedMarkdown) {
            // Already translated (or preserved as reference), move on
        } else {
            setStatus(AppStatus.TRANSLATING);
            // Only log if we are actually doing work
            addLog(`Translating [${i+1}/${chapters.length}]: ${chapter.title}`, "process");
            
            // Initialize chunks if needed
            if (!chapter.translatedChunks) {
                chapter.translatedChunks = [];
            }
            
            const translated = await aiService.translateContent(
              chapter.markdown, 
              config.targetLanguage, 
              effectiveSystemInstruction,
              async (current, total, chunkResult, isFallback) => {
                  if (isFallback) {
                      addLog(`  > ⚠️ API returned empty/error for part ${current}/${total}. Kept original text.`, 'error');
                  } else if (total > 1) {
                      addLog(`  > Translating part ${current}/${total}...`, 'info');
                  }
                  
                  // SAVE PROGRESS AFTER EACH CHUNK
                  if (chapter.translatedChunks) {
                      // Ensure we don't duplicate if logic is weird, but append is safer
                      // Actually, we are passing existingChunks to service, so it returns new ones.
                      // But here we want to update the chapter object in real-time.
                      // The service returns the *current* chunk result in the callback.
                      
                      // We need to be careful: existingChunks passed to service are 0..N
                      // The callback fires for N+1...M
                      // So we can just push.
                      // However, to be robust against race conditions or retries, 
                      // we should trust the service's index? 
                      // The service callback provides (current, total, result). 'current' is 1-based index.
                      
                      chapter.translatedChunks![current - 1] = chunkResult;
                      
                      // Save to DB
                      await persistenceService.current.updateChapter(chapter);
                      await saveSessionState(AppStatus.TRANSLATING);
                  }
              },
              chapter.translatedChunks // Pass existing chunks to resume
            );
            chapter.translatedMarkdown = translated;
            // Ensure chunks are fully synced (though they should be)
            chapter.translatedChunks = translated.split('\n\n'); // Rough sync, or just keep what we have
            updated = true;
        }

        // Update progress
        const currentTotalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
        
        // Calculate steps done. 
        const stepsDone = chapters.reduce((acc, c) => {
             if (config.smartSkip && c.isSkippable) return acc + (config.enableProofreading ? 2 : 1);
             return acc + (c.translatedMarkdown ? 1 : 0) + (c.proofreadMarkdown ? 1 : 0);
        }, 0);
        
        const newProgress = (stepsDone / currentTotalSteps) * 100;
        setProgress(newProgress);

        // Save after translation if updated
        if (updated) {
            await persistenceService.current.updateChapter(chapter);
            await saveSessionState(AppStatus.TRANSLATING);
        }

        // --- Proofreading ---
        updated = false;
        if (config.enableProofreading) {
          if (chapter.proofreadMarkdown) {
              // Already proofread, move on
          } else {
              setStatus(AppStatus.PROOFREADING);
              addLog(`Proofreading [${i+1}/${chapters.length}]: ${chapter.title}`, "process");
              
              if (!chapter.proofreadChunks) {
                  chapter.proofreadChunks = [];
              }

              const proofread = await aiService.proofreadContent(
                chapter.translatedMarkdown!, 
                effectiveProofreadInstruction,
                async (current, total, chunkResult, isFallback) => {
                    if (isFallback) {
                        addLog(`  > ⚠️ API returned empty/error for part ${current}/${total}. Kept original text.`, 'error');
                    } else if (total > 1) {
                        addLog(`  > Proofreading part ${current}/${total}...`, 'info');
                    }
                    
                    if (chapter.proofreadChunks) {
                        chapter.proofreadChunks![current - 1] = chunkResult;
                        await persistenceService.current.updateChapter(chapter);
                        await saveSessionState(AppStatus.PROOFREADING);
                    }
                },
                chapter.proofreadChunks
              );
              chapter.proofreadMarkdown = proofread;
              updated = true;
              
              // Update progress again
               const stepsDoneAfter = chapters.reduce((acc, c) => {
                    if (config.smartSkip && c.isSkippable) return acc + (config.enableProofreading ? 2 : 1);
                    return acc + (c.translatedMarkdown ? 1 : 0) + (c.proofreadMarkdown ? 1 : 0);
               }, 0);
              const newProgressAfter = (stepsDoneAfter / currentTotalSteps) * 100;
              setProgress(newProgressAfter);
          }
        }

        // Save after proofreading if updated
        if (updated) {
            await persistenceService.current.updateChapter(chapter);
            await saveSessionState(AppStatus.PROOFREADING);
        }
      }

      // Step 4: Repackage
      setStatus(AppStatus.PACKAGING);
      
      const chaptersToPack = config.smartSkip 
        ? chapters.filter(c => !c.isSkippable)
        : chapters;

      addLog(`Recompiling EPUB (Packaged ${chaptersToPack.length} / ${chapters.length} chapters)...`, "process");
      
      // MEMORY OPTIMIZATION: Load images just in time for packaging
      addLog("Loading images from database...", "info");
      const images = await persistenceService.current.loadImages();

      const blob = await epubService.current.generateEpub(
        chaptersToPack, 
        images, 
        currentFile?.name.replace('.epub', '') || 'translated_book',
        config.targetLanguage,
        coverPathRef.current
      );
      
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
      
      setStatus(AppStatus.COMPLETED);
      await saveSessionState(AppStatus.COMPLETED);
      addLog("Workflow complete! Download ready.", "success");

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
            {status === AppStatus.COMPLETED && downloadUrl && (
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
          <div className="p-5 border-b border-stone-800 bg-stone-950 flex items-center justify-between z-10 shadow-sm">
             <span className="font-mono text-xs tracking-widest uppercase text-stone-400">Workflow Console</span>
             <div className="text-xs font-mono text-stone-400 bg-stone-800/50 px-3 py-1.5 rounded-full border border-stone-700/50">
                {status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR ? (
                   <span className="flex items-center gap-2">
                     <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> 
                     {status}... {Math.round(progress)}%
                   </span>
                ) : (
                    <span>{status}</span>
                )}
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 font-mono text-sm leading-relaxed space-y-4 custom-scrollbar">
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

          {/* Progress Bar (Visual) */}
          <div className="h-1.5 bg-stone-900 w-full absolute bottom-0 left-0">
            <div 
                className={`h-full transition-all duration-500 ease-out ${status === AppStatus.ERROR ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${progress}%` }}
            />
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;