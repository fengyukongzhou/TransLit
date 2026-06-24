import React, { useState, DragEvent, ChangeEvent } from 'react';
import { Upload, FileUp } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.epub')) {
        setError(null);
        onFileSelect(file);
      } else {
        setError("Please upload a valid .epub file");
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent flickering when dragging over child elements
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Basic validation for EPUB extension
      if (file.name.toLowerCase().endsWith('.epub')) {
        setError(null);
        onFileSelect(file);
      } else {
        setError("Please upload a valid .epub file");
      }
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border border-dashed rounded-2xl transition-all duration-300 group
        ${disabled 
          ? 'opacity-50 cursor-not-allowed border-stone-200 bg-stone-50' 
          : isDragging 
            ? 'border-amber-500 bg-amber-50/50 ring-4 ring-amber-500/10' 
            : 'border-stone-300 hover:border-amber-400 hover:bg-[#fcfcfb] bg-white shadow-sm hover:shadow-md'
        }`}
    >
      <input
        type="file"
        accept=".epub"
        onChange={handleFileChange}
        disabled={disabled}
        className="hidden"
        id="epub-upload"
      />
      <label 
        htmlFor="epub-upload" 
        className={`flex flex-col items-center justify-center w-full p-8 gap-4 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`p-4 rounded-full shrink-0 transition-all duration-300 ${isDragging ? 'bg-amber-100 scale-110' : 'bg-stone-100 group-hover:bg-amber-50 group-hover:scale-105'}`}>
          {isDragging ? (
            <FileUp className={`w-8 h-8 ${isDragging ? 'text-amber-600' : 'text-stone-400'}`} />
          ) : (
            <Upload className="w-8 h-8 text-stone-400 group-hover:text-amber-600 transition-colors" />
          )}
        </div>
        
        <div className="flex flex-col items-center text-center">
          <h3 className={`font-serif text-lg font-medium transition-colors ${isDragging ? 'text-amber-700' : 'text-stone-800'}`}>
            {isDragging ? "Drop Manuscript Here" : "Upload Manuscript"}
          </h3>
          <p className={`text-sm mt-1.5 transition-colors ${isDragging ? 'text-amber-600/80' : 'text-stone-500'}`}>
            {isDragging ? "Release to begin processing" : "Drag & drop your EPUB file, or click to browse"}
          </p>
          {error && (
            <p className="text-sm mt-3 text-red-600 font-medium bg-red-50 px-3 py-1 rounded-full border border-red-100">
              {error}
            </p>
          )}
        </div>
      </label>
    </div>
  );
};

export default FileUpload;