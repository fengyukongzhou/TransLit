
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
    setConfig(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'baseUrl' || field === 'apiKey' || field === 'modelName') {
        localStorage.setItem('translit_api_config', JSON.stringify({
          baseUrl: next.baseUrl,
          apiKey: next.apiKey,
          modelName: next.modelName
        }));
      }
      return next;
    });
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

  return (
    <div className="bg-white rounded-none border border-black shadow-none overflow-hidden mb-6 transition-all">
      <div className="px-6 py-5 border-b border-black bg-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-black" />
            <h2 className="font-mono text-lg font-bold text-black uppercase tracking-widest">Configuration</h2>
        </div>
      </div>

      <div className="p-6 space-y-8">
        
        {/* --- API Settings Section --- */}
        <div>
            <button
                onClick={() => setShowApiSettings(!showApiSettings)}
                className="flex items-center gap-3 text-xs font-bold text-black hover:text-neutral-600 transition-colors mb-5 focus:outline-none group uppercase tracking-widest w-full font-mono"
            >
                <span>API Configuration</span>
                <div className="h-px bg-black flex-1 transition-colors" />
                {showApiSettings ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {showApiSettings && (
                <div className="space-y-6 mb-8 animate-in slide-in-from-top-2">
                    <div className="space-y-4 bg-white p-5 rounded-none border border-black shadow-none">
                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-bold text-black mb-2 uppercase tracking-widest font-mono">
                                    <LinkIcon className="w-3 h-3"/> Base URL
                                </label>
                                <input
                                    type="text"
                                    value={config.baseUrl}
                                    onChange={(e) => handleChange('baseUrl', e.target.value)}
                                    disabled={disabled}
                                    placeholder="https://integrate.api.nvidia.com/v1"
                                    className="w-full px-4 py-2.5 text-sm rounded-none border border-neutral-300 focus:border-black focus:ring-0 outline-none font-mono text-black bg-white shadow-none transition-all"
                                />
                            </div>
                            
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-bold text-black mb-2 uppercase tracking-widest font-mono">
                                    <Cpu className="w-3 h-3"/> Model Name
                                </label>
                                <input
                                    type="text"
                                    value={config.modelName}
                                    onChange={(e) => handleChange('modelName', e.target.value)}
                                    disabled={disabled}
                                    placeholder="minimaxai/minimax-m2.1"
                                    className="w-full px-4 py-2.5 text-sm rounded-none border border-neutral-300 focus:border-black focus:ring-0 outline-none font-mono text-black bg-white shadow-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-bold text-black mb-2 uppercase tracking-widest font-mono">
                                    <Key className="w-3 h-3"/> API Key
                                </label>
                                <input
                                    type="password"
                                    value={config.apiKey}
                                    onChange={(e) => handleChange('apiKey', e.target.value)}
                                    disabled={disabled}
                                    placeholder="Enter your API Key"
                                    className="w-full px-4 py-2.5 text-sm rounded-none border border-neutral-300 focus:border-black focus:ring-0 outline-none font-mono text-black bg-white shadow-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Test Connection Section - Separated with Divider */}
                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            onClick={handleTestConnection}
                            disabled={disabled || testStatus === 'testing' || !config.apiKey}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-none text-xs font-mono font-bold tracking-widest uppercase shadow-none border border-black transition-all
                                ${testStatus === 'success' ? 'bg-white text-black' : 
                                  testStatus === 'error' ? 'bg-black text-white' :
                                  'bg-black text-white hover:bg-neutral-800'
                                } ${disabled || (testStatus === 'testing') || !config.apiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                                className="text-[10px] text-white bg-black p-3 rounded-none border border-black break-all font-mono leading-relaxed"
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
            <label className="text-xs font-bold text-black uppercase tracking-widest font-mono">
              Source Language
            </label>
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => !disabled && setIsLangOpen(!isLangOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between pl-5 pr-4 py-3.5 bg-white border ${isLangOpen ? 'border-black ring-1 ring-black' : 'border-neutral-300 hover:border-black'} rounded-none text-sm text-black font-mono outline-none transition-all cursor-pointer shadow-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-black" />
                  <span>{config.sourceLanguage}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-black transition-transform duration-300 ${isLangOpen ? 'rotate-180' : ''}`} />
              </button>

              {isLangOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-black rounded-none shadow-none overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar py-2">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          handleChange('sourceLanguage', lang);
                          setIsLangOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-5 py-2.5 text-sm font-mono transition-colors ${config.sourceLanguage === lang ? 'bg-black text-white' : 'text-black hover:bg-neutral-100'}`}
                      >
                        <span>{lang}</span>
                        {config.sourceLanguage === lang && <Check className="w-4 h-4 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>

          {/* Feature Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-none border border-black shadow-none transition-all">
            <label className="flex items-center gap-3 p-3 rounded-none bg-white border border-transparent hover:border-black shadow-none transition-all cursor-pointer group min-h-[64px]">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.enableProofreading}
                        onChange={(e) => handleChange('enableProofreading', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-white border border-black peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:border after:border-black after:rounded-none after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-black shadow-none peer-checked:after:bg-white"></div>
                </div>
                <div className="flex flex-col min-w-0 font-mono">
                    <div className="flex items-center gap-1.5 text-black transition-colors select-none">
                        <FileCheck className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-bold uppercase tracking-widest">Two-Step</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest truncate">Polished</span>
                </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-none bg-white border border-transparent hover:border-black shadow-none transition-all cursor-pointer group min-h-[64px]" title="Optimized for literary prose">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.useRecommendedPrompts}
                        onChange={(e) => handleChange('useRecommendedPrompts', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-white border border-black peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:border after:border-black after:rounded-none after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-black shadow-none peer-checked:after:bg-white"></div>
                </div>
                <div className="flex flex-col min-w-0 font-mono">
                    <div className="flex items-center gap-1.5 text-black transition-colors select-none">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-bold uppercase tracking-widest">Lit Mode</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest truncate">Style Pros</span>
                </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-none bg-white border border-transparent hover:border-black shadow-none transition-all cursor-pointer group min-h-[64px]" title="Enable terminology and glossary system">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.enableGlossary}
                        onChange={(e) => handleChange('enableGlossary', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-white border border-black peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:border after:border-black after:rounded-none after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-black shadow-none peer-checked:after:bg-white"></div>
                </div>
                <div className="flex flex-col min-w-0 font-mono">
                    <div className="flex items-center gap-1.5 text-black transition-colors select-none">
                        <BookA className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-bold uppercase tracking-widest">Glossary</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest truncate">Consistency</span>
                </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-none bg-white border border-transparent hover:border-black shadow-none transition-all cursor-pointer group min-h-[64px]" title="Skip Title Page, Copyright, TOC, etc.">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.smartSkip}
                        onChange={(e) => handleChange('smartSkip', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-white border border-black peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:border after:border-black after:rounded-none after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-black shadow-none peer-checked:after:bg-white"></div>
                </div>
                <div className="flex flex-col min-w-0 font-mono">
                    <div className="flex items-center gap-1.5 text-black transition-colors select-none">
                        <ScanEye className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-bold uppercase tracking-widest">Auto Skip</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest truncate">Auto Filter</span>
                </div>
            </label>
          </div>

        {/* Advanced Prompts Section (Collapsible) */}
        <div className="pt-2">
            <button
                onClick={() => setShowPrompts(!showPrompts)}
                className="flex items-center gap-3 text-xs font-bold text-black hover:text-neutral-600 transition-colors mb-4 focus:outline-none group uppercase tracking-widest w-full font-mono"
            >
                <span>Additional Context & Notes</span>
                <div className="h-px bg-black flex-1 transition-colors" />
                {showPrompts ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {showPrompts && (
                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2.5">
                        <label className="flex items-center gap-2 text-xs font-bold text-black uppercase tracking-widest font-mono">
                           <BookA className="w-3.5 h-3.5 text-black"/> Book Meta Info & Translation Notes
                        </label>
                        <p className="text-[10px] text-neutral-500 italic pb-1 font-mono">
                          Provide context like author, genre, style (e.g. "Hard-boiled"), or specific character names/title translations. This info is added to all translation modes.
                        </p>
                        <textarea
                            value={config.additionalContext}
                            onChange={(e) => handleChange('additionalContext', e.target.value)}
                            disabled={disabled}
                            placeholder="Example: This is a cyberpunk novel by William Gibson. Use a gritty, tech-focused style. Translate 'The Sprawl' as '蔓延城'."
                            rows={5}
                            className="w-full px-4 py-3.5 text-xs md:text-sm rounded-none border bg-white border-neutral-300 text-black focus:border-black focus:ring-0 outline-none transition-all font-mono leading-relaxed resize-y shadow-none"
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