
import React, { useState, useRef, useEffect } from 'react';
import { Settings, BookA, Sparkles, ScanEye, ChevronDown, ChevronRight, FileText, Server, Key, Link as LinkIcon, Cpu, PlugZap, CheckCircle2, XCircle, Globe, Check } from 'lucide-react';
import { AppConfig } from '../types';
import { AiService } from '../services/geminiService';

interface SettingsPanelProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  disabled: boolean;
}

const LANGUAGES = [
  "Chinese (Simplified)",
  "Chinese (Traditional)",
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
                <div className="space-y-5 mb-8 animate-in slide-in-from-top-2">
                    <div className="relative w-full [perspective:1000px]">
                        <div className={`w-full transition-transform duration-700 [transform-style:preserve-3d] ${isGemini ? '[transform:rotateY(180deg)]' : ''}`}>
                            
                            {/* Front Side (Custom API) */}
                            <div className={`w-full bg-[#f5f5f0] p-5 rounded-2xl border border-stone-200 flex flex-col justify-center space-y-4 [backface-visibility:hidden] ${isGemini ? 'pointer-events-none' : ''}`}>
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 mb-2 uppercase tracking-wide">
                                        <LinkIcon className="w-3.5 h-3.5"/> Base URL
                                    </label>
                                    <input
                                        type="text"
                                        value={config.baseUrl}
                                        onChange={(e) => handleChange('baseUrl', e.target.value)}
                                        disabled={disabled || isGemini}
                                        placeholder="https://integrate.api.nvidia.com/v1"
                                        className="w-full px-4 py-3 text-sm rounded-xl border border-stone-300 focus:border-stone-500 focus:ring-1 focus:ring-stone-500 outline-none font-mono text-stone-700 bg-white shadow-sm transition-all"
                                    />
                                </div>
                                
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 mb-2 uppercase tracking-wide">
                                        <Cpu className="w-3.5 h-3.5"/> Model Name
                                    </label>
                                    <input
                                        type="text"
                                        value={config.modelName}
                                        onChange={(e) => handleChange('modelName', e.target.value)}
                                        disabled={disabled || isGemini}
                                        placeholder="minimaxai/minimax-m2.1"
                                        className="w-full px-4 py-3 text-sm rounded-xl border border-stone-300 focus:border-stone-500 focus:ring-1 focus:ring-stone-500 outline-none font-mono text-stone-700 bg-white shadow-sm transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 mb-2 uppercase tracking-wide">
                                        <Key className="w-3.5 h-3.5"/> API Key
                                    </label>
                                    <input
                                        type="password"
                                        value={config.apiKey}
                                        onChange={(e) => handleChange('apiKey', e.target.value)}
                                        disabled={disabled || isGemini}
                                        placeholder="nvapi-..."
                                        className="w-full px-4 py-3 text-sm rounded-xl border border-stone-300 focus:border-stone-500 focus:ring-1 focus:ring-stone-500 outline-none bg-white shadow-sm transition-all"
                                    />
                                </div>

                                <div className="pt-3">
                                    <button
                                        onClick={() => {
                                            handleChange('baseUrl', 'https://generativelanguage.googleapis.com/v1beta/openai/');
                                            handleChange('modelName', 'gemini-3-flash-preview');
                                            // @ts-ignore
                                            handleChange('apiKey', process.env.GEMINI_API_KEY || '');
                                        }}
                                        disabled={disabled || isGemini}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold tracking-wide transition-all bg-stone-800 text-[#f5f5f0] hover:bg-stone-900 shadow-sm"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        Switch to GEMINI 3.0 FLASH
                                    </button>
                                </div>
                            </div>

                            {/* Back Side (Gemini Active) */}
                            <div className={`absolute inset-0 w-full h-full bg-[#f5f5f0] p-5 rounded-2xl border border-stone-200 flex flex-col items-center justify-center space-y-3 [backface-visibility:hidden] [transform:rotateY(180deg)] ${!isGemini ? 'pointer-events-none' : ''}`}>
                                <div className="flex items-center gap-2 text-stone-800 font-serif text-lg">
                                    <Sparkles className="w-5 h-5 text-amber-600" />
                                    <span>GEMINI 3.0 FLASH Active</span>
                                </div>
                                <p className="text-xs text-stone-500 text-center px-4 font-medium">
                                    Using managed Gemini API. Configuration is hidden.
                                </p>
                                <button
                                    onClick={() => {
                                        handleChange('baseUrl', 'https://integrate.api.nvidia.com/v1');
                                        handleChange('modelName', 'minimaxai/minimax-m2.1');
                                        handleChange('apiKey', '');
                                    }}
                                    disabled={disabled || !isGemini}
                                    className="mt-3 text-xs font-medium text-stone-500 hover:text-stone-800 underline underline-offset-4 transition-colors tracking-wide"
                                >
                                    Switch to Custom API
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Test Connection Button */}
                    <div className="space-y-2">
                        <button
                            onClick={handleTestConnection}
                            disabled={disabled || testStatus === 'testing' || !config.apiKey}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold tracking-wide transition-all uppercase
                                ${testStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                                  testStatus === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                                  'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 active:scale-[0.98] shadow-sm'
                                } ${disabled || !config.apiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {testStatus === 'testing' ? <PlugZap className="w-3.5 h-3.5 animate-pulse" /> : 
                             testStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
                             testStatus === 'error' ? <XCircle className="w-3.5 h-3.5" /> : 
                             <PlugZap className="w-3.5 h-3.5" />}
                            
                            {testStatus === 'testing' ? 'Testing Connection...' : 
                             testStatus === 'success' ? 'Connection Verified' : 
                             testStatus === 'error' ? 'Connection Failed' : 
                             'Test API Connection'}
                        </button>
                        
                        {testStatus === 'error' && lastError && (
                            <div className="text-[10px] text-red-500 bg-red-50 p-2 rounded border border-red-100 break-all">
                                {lastError}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* --- Standard Settings --- */}
        
        {/* Target Language */}
        <div className="space-y-3">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
              Target Language
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
                  <span>{config.targetLanguage}</span>
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
                          handleChange('targetLanguage', lang);
                          setIsLangOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-5 py-2.5 text-sm transition-colors ${config.targetLanguage === lang ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700 hover:bg-stone-50'}`}
                      >
                        <span>{lang}</span>
                        {config.targetLanguage === lang && <Check className="w-4 h-4 text-amber-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>

          {/* Feature Toggles */}
          <div className="flex flex-col sm:flex-row gap-6 sm:items-center pt-2">
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.enableProofreading}
                        onChange={(e) => handleChange('enableProofreading', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-stone-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-800 shadow-inner"></div>
                </div>
                <span className="text-sm font-medium text-stone-600 group-hover:text-stone-900 transition-colors select-none">AI Proofreading</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group" title="Skip Title Page, Copyright, TOC, etc.">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.smartSkip}
                        onChange={(e) => handleChange('smartSkip', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-stone-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-800 shadow-inner"></div>
                </div>
                <div className="flex items-center gap-1.5 text-stone-600 group-hover:text-stone-900 transition-colors select-none">
                    <ScanEye className="w-3.5 h-3.5 opacity-60" />
                    <span className="text-sm font-medium">Smart Skip</span>
                </div>
            </label>
          </div>

        <div className="h-px bg-stone-100 w-full my-6" />

        {/* Recommended Prompts Toggle Card */}
        <div 
            onClick={() => !disabled && handleChange('useRecommendedPrompts', !config.useRecommendedPrompts)}
            className={`
                relative group cursor-pointer rounded-2xl border transition-all duration-300 overflow-hidden
                ${config.useRecommendedPrompts 
                    ? 'border-stone-800 bg-stone-50 ring-1 ring-stone-800/10 shadow-sm' 
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-[#f5f5f0]'
                } 
                ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
            `}
        >
           <div className="p-5 flex items-start gap-4">
              <div className={`p-3 rounded-xl shrink-0 transition-colors ${config.useRecommendedPrompts ? 'bg-stone-800 text-amber-400' : 'bg-stone-100 text-stone-400 group-hover:text-stone-600 group-hover:bg-stone-200'}`}>
                 <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                 <div className="flex items-center justify-between mb-1.5">
                    <span className={`font-serif text-base font-medium ${config.useRecommendedPrompts ? 'text-stone-900' : 'text-stone-700'}`}>
                        Use Chinese Prompts
                    </span>
                    {config.useRecommendedPrompts && (
                        <span className="shrink-0 bg-stone-200 text-stone-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">
                            Active
                        </span>
                    )}
                 </div>
                 <p className={`text-xs leading-relaxed truncate ${config.useRecommendedPrompts ? 'text-stone-600' : 'text-stone-500'}`}>
                    Optimized for Chinese literary translation.
                 </p>
              </div>
           </div>
        </div>

        {/* Advanced Prompts Section (Collapsible) */}
        <div className="pt-2">
            <button
                onClick={() => setShowPrompts(!showPrompts)}
                className="flex items-center gap-3 text-xs font-bold text-stone-400 hover:text-stone-800 transition-colors mb-4 focus:outline-none group uppercase tracking-widest w-full"
            >
                <span>Advanced Prompt Settings</span>
                <div className="h-px bg-stone-200 flex-1 group-hover:bg-stone-300 transition-colors" />
                {showPrompts ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {showPrompts && (
                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2.5">
                        <label className="flex items-center gap-2 text-xs font-bold text-stone-600 uppercase tracking-wide">
                           <BookA className="w-3.5 h-3.5 text-stone-400"/> System Instruction
                        </label>
                        <textarea
                            value={config.useRecommendedPrompts ? "Recommended prompts active. Custom instruction ignored." : config.systemInstruction}
                            onChange={(e) => handleChange('systemInstruction', e.target.value)}
                            disabled={disabled || config.useRecommendedPrompts}
                            rows={5}
                            className={`w-full px-4 py-3.5 text-xs md:text-sm rounded-2xl border focus:ring-2 focus:ring-stone-400 outline-none transition-all font-mono leading-relaxed resize-y
                                ${config.useRecommendedPrompts 
                                    ? 'bg-[#f5f5f0] text-stone-400 border-stone-200 italic' 
                                    : 'bg-white border-stone-300 text-stone-700 focus:border-stone-500 shadow-sm'
                                }`}
                        />
                    </div>

                    {config.enableProofreading && (
                        <div className="space-y-2.5">
                            <label className="flex items-center gap-2 text-xs font-bold text-stone-600 uppercase tracking-wide">
                                <FileText className="w-3.5 h-3.5 text-stone-400"/> Proofreading Instruction
                            </label>
                            <textarea
                                value={config.useRecommendedPrompts ? "Recommended prompts active. Custom instruction ignored." : config.proofreadInstruction}
                                onChange={(e) => handleChange('proofreadInstruction', e.target.value)}
                                disabled={disabled || config.useRecommendedPrompts}
                                rows={3}
                                className={`w-full px-4 py-3.5 text-xs md:text-sm rounded-2xl border focus:ring-2 focus:ring-stone-400 outline-none transition-all font-mono leading-relaxed resize-y
                                    ${config.useRecommendedPrompts 
                                        ? 'bg-[#f5f5f0] text-stone-400 border-stone-200 italic' 
                                        : 'bg-white border-stone-300 text-stone-700 focus:border-stone-500 shadow-sm'
                                    }`}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;