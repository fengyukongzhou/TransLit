
import { AppConfig, AppStatus, Chapter, ProcessingLog } from '../types';

const DB_NAME = 'epub_translator_db';
const DB_VERSION = 1;
const STORES = {
  METADATA: 'metadata',
  CHAPTERS: 'chapters',
  IMAGES: 'images',
  LOGS: 'logs'
};

export interface SessionState {
  status: AppStatus;
  config: AppConfig;
  progress: number;
  fileName: string;
  coverPath?: string;
  lastUpdated: number;
}

export class PersistenceService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA);
        }
        if (!db.objectStoreNames.contains(STORES.CHAPTERS)) {
          db.createObjectStore(STORES.CHAPTERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.IMAGES)) {
          db.createObjectStore(STORES.IMAGES);
        }
        if (!db.objectStoreNames.contains(STORES.LOGS)) {
          db.createObjectStore(STORES.LOGS, { keyPath: 'timestamp' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error("Database not initialized");
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // --- Session Metadata ---

  async saveSession(state: SessionState): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.METADATA, 'readwrite');
      const request = store.put(state, 'currentSession');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadSession(): Promise<SessionState | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.METADATA);
      const request = store.get('currentSession');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearSession(): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.METADATA, STORES.CHAPTERS, STORES.IMAGES, STORES.LOGS], 'readwrite');
      
      transaction.objectStore(STORES.METADATA).clear();
      transaction.objectStore(STORES.CHAPTERS).clear();
      transaction.objectStore(STORES.IMAGES).clear();
      transaction.objectStore(STORES.LOGS).clear();
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Chapters ---

  async saveChapters(chapters: Chapter[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORES.CHAPTERS, 'readwrite');
      const store = transaction.objectStore(STORES.CHAPTERS);
      
      // Clear existing chapters first to avoid stale data
      store.clear();

      chapters.forEach(chapter => {
        store.put(chapter);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async updateChapter(chapter: Chapter): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.CHAPTERS, 'readwrite');
      const request = store.put(chapter);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadChapters(): Promise<Chapter[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.CHAPTERS);
      const request = store.getAll();
      request.onsuccess = () => {
        // Sort by ID or ensure order if necessary. 
        // Assuming getAll returns in insertion order for simple keys, but here keys are strings (id).
        // The caller might need to sort them if order matters and IDs aren't sortable.
        // However, we usually rely on the array order. 
        // Let's assume the App handles sorting or we stored them with a sortable key?
        // Actually, 'id' in Chapter is usually a string ref from EPUB.
        // To be safe, we might want to store an index, but for now let's trust the caller to re-sort or
        // we just return what we have. The App.tsx uses chaptersRef.current which is an array.
        // IndexedDB getAll() returns sorted by key.
        // If we need original order, we should add an 'index' field to Chapter.
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- Images ---

  async saveImages(images: Record<string, Blob>): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORES.IMAGES, 'readwrite');
      const store = transaction.objectStore(STORES.IMAGES);
      
      store.clear();

      Object.entries(images).forEach(([path, blob]) => {
        store.put(blob, path);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async loadImages(): Promise<Record<string, Blob>> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.IMAGES);
      const request = store.getAllKeys();
      
      request.onsuccess = async () => {
        const keys = request.result as string[];
        const images: Record<string, Blob> = {};
        
        // Load all images (might be heavy, but necessary for reconstruction)
        // Optimization: Could load on demand, but for now load all.
        let loaded = 0;
        if (keys.length === 0) {
            resolve({});
            return;
        }

        const transaction = this.db!.transaction(STORES.IMAGES, 'readonly');
        const imgStore = transaction.objectStore(STORES.IMAGES);

        keys.forEach(key => {
            const imgReq = imgStore.get(key);
            imgReq.onsuccess = () => {
                images[key] = imgReq.result;
                loaded++;
                if (loaded === keys.length) resolve(images);
            };
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- Logs ---

  async saveLog(log: ProcessingLog): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.LOGS, 'readwrite');
      const request = store.put(log);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadLogs(): Promise<ProcessingLog[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.LOGS);
      const request = store.getAll();
      request.onsuccess = () => {
        const logs = request.result as ProcessingLog[];
        logs.sort((a, b) => a.timestamp - b.timestamp);
        resolve(logs);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
