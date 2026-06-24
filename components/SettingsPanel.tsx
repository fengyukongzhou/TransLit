
import React, { useState, useRef, useEffect } from 'react';
import { Settings, BookA, Sparkles, ScanEye, ChevronDown, ChevronRight, FileText, Server, Key, Link as LinkIcon, Cpu, PlugZap, CheckCircle2, XCircle, Globe, Check, FileCheck, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppConfig } from '../types';
import { AiService } from '../services/geminiService';

interface SettingsPanelProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  disabled: boolean;
}

const LANGUAGES = [
  "English",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Russian",
  "Italian",
  "Portuguese"
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ config, setConfig, disabled }) => {
  const [showPrompts, setShowPrompts] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (field: keyof AppConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    if (field === 'baseUrl' || field === 'apiKey' || field === 'modelName') {
        setTestStatus('idle');
        setLastError(null);
    }
  };

  const handleTestConnection = async () => {
      setTestStatus('testing');
      setLastError(null);
      try {
          const service = new AiService(config);
          await service.testConnection();
          setTestStatus('success');
          setTimeout(() => setTestStatus('idle'), 3000);
      } catch (error: any) {
          console.error(error);
          setTestStatus('error');
          setLastError(error.message || "Failed to connect");
      }
  };

  const isGemini = config.baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai/' && config.modelName === 'gemini-3-flash-preview';

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-6 transition-all hover:shadow-md">
      <div className="px-6 py-5 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-stone-500" />
            <h2 className="font-serif text-lg font-medium text-stone-800">Configuration</h2>
        </div>
      </div>

      <div className="p-6 space-y-8">
        
        {/* --- API Settings Section --- */}
        <div>
            <button
                onClick={() => setShowApiSettings(!showApiSettings)}
                className="flex items-center gap-3 text-xs font-bold text-stone-400 hover:text-stone-800 transition-colors mb-5 focus:outline-none group uppercase tracking-widest w-full"
            >
                <span>API Configuration</span>
                <div className="h-px bg-stone-200 flex-1 group-hover:bg-stone-300 transition-colors" />
                {showApiSettings ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {showApiSettings && (
                <div className="space-y-6 mb-8 animate-in slide-in-from-top-2">
                    {/* Segmented Control for API Mode */}
                    <div className="flex p-1 bg-stone-100 rounded-xl border border-stone-200">
                        <button
                            onClick={() => {
                                handleChange('baseUrl', 'https://integrate.api.nvidia.com/v1');
                                handleChange('modelName', 'minimaxai/minimax-m2.1');
                                handleChange('apiKey', '');
                            }}
                            disabled={disabled}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all relative ${!isGemini ? 'text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                             {!isGemini && (
                                <motion.div 
                                    layoutId="api-tab"
                                    className="absolute inset-0 bg-white shadow-sm rounded-lg border border-stone-200/50"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-2">
                                <LinkIcon className="w-3.5 h-3.5" />
                                Custom API
                            </span>
                        </button>
                        <button
                            onClick={() => {
                                handleChange('baseUrl', 'https://generativelanguage.googleapis.com/v1beta/openai/');
                                handleChange('modelName', 'gemini-3-flash-preview');
                                // @ts-ignore
                                handleChange('apiKey', process.env.GEMINI_API_KEY || '');
                            }}
                            disabled={disabled}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all relative ${isGemini ? 'text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                            {isGemini && (
                                <motion.div 
                                    layoutId="api-tab"
                                    className="absolute inset-0 bg-white shadow-sm rounded-lg border border-stone-200/50"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-2">
                                <Sparkles className={`w-3.5 h-3.5 ${isGemini ? 'text-amber-500' : ''}`} />
                                Gemini Flash
                            </span>
                        </button>
                    </div>

                    {/* Mode Specific Content */}
                    <AnimatePresence mode="wait">
                        {!isGemini ? (
                            <motion.div
                                key="custom-api"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-4 bg-stone-50/50 p-5 rounded-2xl border border-stone-200 shadow-inner"
                            >
                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[10px] font-bold text-stone-500 mb-2 uppercase tracking-widest">
                                            <LinkIcon className="w-3 h-3"/> Base URL
                                        </label>
                                        <input
                                            type="text"
                                            value={config.baseUrl}
                                            onChange={(e) => handleChange('baseUrl', e.target.value)}
                                            disabled={disabled}
                                            placeholder="https://integrate.api.nvidia.com/v1"
                                            className="w-full px-4 py-2.5 text-sm rounded-xl border border-stone-200 focus:border-stone-400 focus:ring-1 focus:ring-stone-400 outline-none font-mono text-stone-700 bg-white shadow-sm transition-all"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="flex items-center gap-2 text-[10px] font-bold text-stone-500 mb-2 uppercase tracking-widest">
                                            <Cpu className="w-3 h-3"/> Model Name
                                        </label>
                                        <input
                                            type="text"
                                            value={config.modelName}
                                            onChange={(e) => handleChange('modelName', e.target.value)}
                                            disabled={disabled}
                                            placeholder="minimaxai/minimax-m2.1"
                                            className="w-full px-4 py-2.5 text-sm rounded-xl border border-stone-200 focus:border-stone-400 focus:ring-1 focus:ring-stone-400 outline-none font-mono text-stone-700 bg-white shadow-sm transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-[10px] font-bold text-stone-500 mb-2 uppercase tracking-widest">
                                            <Key className="w-3 h-3"/> API Key
                                        </label>
                                        <input
                                            type="password"
                                            value={config.apiKey}
                                            onChange={(e) => handleChange('apiKey', e.target.value)}
                                            disabled={disabled}
                                            placeholder="Enter your API Key"
                                            className="w-full px-4 py-2.5 text-sm rounded-xl border border-stone-200 focus:border-stone-400 focus:ring-1 focus:ring-stone-400 outline-none bg-white shadow-sm transition-all"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="gemini-api"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="bg-[#fcfcf9] p-6 rounded-2xl border border-stone-200 flex flex-col items-center justify-center space-y-3 shadow-inner"
                            >
                                <div className="p-3 bg-amber-50 rounded-full">
                                    <Sparkles className="w-6 h-6 text-amber-600" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-stone-800 font-serif text-lg font-medium">Gemini 3.0 Flash</h3>
                                    <p className="text-xs text-stone-500 max-w-[240px] mt-1 italic font-medium leading-relaxed">
                                        Using platform-managed API access. No additional configuration required.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Test Connection Section - Separated with Divider */}
                    <div className="pt-4 border-t border-stone-100 flex flex-col gap-3">
                        <button
                            onClick={handleTestConnection}
                            disabled={disabled || testStatus === 'testing' || (!config.apiKey && !isGemini)}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold tracking-wide transition-all uppercase shadow-sm
                                ${testStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                                  testStatus === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                                  'bg-stone-800 text-stone-50 hover:bg-stone-900 active:scale-[0.98]'
                                } ${disabled || (testStatus === 'testing') || (!config.apiKey && !isGemini) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {testStatus === 'testing' ? <PlugZap className="w-3.5 h-3.5 animate-pulse" /> : 
                             testStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
                             testStatus === 'error' ? <XCircle className="w-3.5 h-3.5" /> : 
                             <PlugZap className="w-3.5 h-3.5" />}
                            
                            {testStatus === 'testing' ? 'Testing Connection...' : 
                             testStatus === 'success' ? 'Service Verified' : 
                             testStatus === 'error' ? 'Verification Failed' : 
                             'Verify API Status'}
                        </button>
                        
                        {testStatus === 'error' && lastError && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="text-[10px] text-red-600 bg-red-50/50 p-3 rounded-xl border border-red-100 break-all font-mono leading-relaxed"
                            >
                                {lastError}
                            </motion.div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* --- Standard Settings --- */}
        
        {/* Source Language */}
        <div className="space-y-3">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
              Source Language
            </label>
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => !disabled && setIsLangOpen(!isLangOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between pl-5 pr-4 py-3.5 bg-[#f5f5f0] border ${isLangOpen ? 'border-stone-400 ring-2 ring-stone-400/20' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-100'} rounded-2xl text-sm text-stone-800 font-medium outline-none transition-all cursor-pointer shadow-sm ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-stone-500" />
                  <span>{config.sourceLanguage}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform duration-300 ${isLangOpen ? 'rotate-180' : ''}`} />
              </button>

              {isLangOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar py-2">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          handleChange('sourceLanguage', lang);
                          setIsLangOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-5 py-2.5 text-sm transition-colors ${config.sourceLanguage === lang ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700 hover:bg-stone-50'}`}
                      >
                        <span>{lang}</span>
                        {config.sourceLanguage === lang && <Check className="w-4 h-4 text-amber-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>

          {/* Feature Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-stone-50 rounded-2xl border border-stone-200/60 shadow-sm transition-all hover:bg-stone-100/30">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-white border border-stone-100/50 shadow-sm hover:shadow-md hover:border-stone-200 transition-all cursor-pointer group min-h-[64px]">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.enableProofreading}
                        onChange={(e) => handleChange('enableProofreading', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-stone-100 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-stone-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-800 shadow-inner"></div>
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 text-stone-700 group-hover:text-stone-900 transition-colors select-none">
                        <FileCheck className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        <span className="text-sm font-semibold">Two-Step</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-medium uppercase tracking-tight truncate">Polished</span>
                </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-white border border-stone-100/50 shadow-sm hover:shadow-md hover:border-stone-200 transition-all cursor-pointer group min-h-[64px]" title="Optimized for literary prose">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.useRecommendedPrompts}
                        onChange={(e) => handleChange('useRecommendedPrompts', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-stone-100 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-stone-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-800 shadow-inner"></div>
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 text-stone-700 group-hover:text-stone-900 transition-colors select-none">
                        <Sparkles className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        <span className="text-sm font-semibold">Lit Mode</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-medium uppercase tracking-tight truncate">Style Pros</span>
                </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-white border border-stone-100/50 shadow-sm hover:shadow-md hover:border-stone-200 transition-all cursor-pointer group min-h-[64px]" title="Enable terminology and glossary system">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.enableGlossary}
                        onChange={(e) => handleChange('enableGlossary', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-stone-100 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-stone-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-800 shadow-inner"></div>
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 text-stone-700 group-hover:text-stone-900 transition-colors select-none">
                        <BookA className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        <span className="text-sm font-semibold">Glossary</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-medium uppercase tracking-tight truncate">Consistency</span>
                </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-white border border-stone-100/50 shadow-sm hover:shadow-md hover:border-stone-200 transition-all cursor-pointer group min-h-[64px]" title="Skip Title Page, Copyright, TOC, etc.">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.smartSkip}
                        onChange={(e) => handleChange('smartSkip', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-stone-100 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-stone-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-800 shadow-inner"></div>
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 text-stone-700 group-hover:text-stone-900 transition-colors select-none">
                        <ScanEye className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        <span className="text-sm font-semibold">Auto Skip</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-medium uppercase tracking-tight truncate">Auto Filter</span>
                </div>
            </label>
          </div>

        {/* Advanced Prompts Section (Collapsible) */}
        <div className="pt-2">
            <button
                onClick={() => setShowPrompts(!showPrompts)}
                className="flex items-center gap-3 text-xs font-bold text-stone-400 hover:text-stone-800 transition-colors mb-4 focus:outline-none group uppercase tracking-widest w-full"
            >
                <span>Additional Context & Notes</span>
                <div className="h-px bg-stone-200 flex-1 group-hover:bg-stone-300 transition-colors" />
                {showPrompts ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {showPrompts && (
                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2.5">
                        <label className="flex items-center gap-2 text-xs font-bold text-stone-600 uppercase tracking-wide">
                           <BookA className="w-3.5 h-3.5 text-stone-400"/> Book Meta Info & Translation Notes
                        </label>
                        <p className="text-[10px] text-stone-500 italic pb-1">
                          Provide context like author, genre, style (e.g. "Hard-boiled"), or specific character names/title translations. This info is added to all translation modes.
                        </p>
                        <textarea
                            value={config.additionalContext}
                            onChange={(e) => handleChange('additionalContext', e.target.value)}
                            disabled={disabled}
                            placeholder="Example: This is a cyberpunk novel by William Gibson. Use a gritty, tech-focused style. Translate 'The Sprawl' as '蔓延城'."
                            rows={5}
                            className="w-full px-4 py-3.5 text-xs md:text-sm rounded-2xl border bg-white border-stone-300 text-stone-700 focus:border-stone-500 focus:ring-2 focus:ring-stone-400 outline-none transition-all font-mono leading-relaxed resize-y shadow-sm"
                        />
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;