// ============================================================
// Flow Studio - 图片存储（IndexedDB）
// 从 ai-assistant 的 store.ts 复用，重命名避免与 Zustand store 冲突
// ============================================================

const DB_NAME = 'flow_studio_gallery';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function dataURLtoBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function isDataURL(s: string): boolean { return s.startsWith('data:'); }

/** 将各种 URL 转为 data: URL */
export async function resolveToDataURL(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
  if (url.startsWith('http') && !isLocalhost) return url;
  if (url.startsWith('blob:') || isLocalhost) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return url; }
  }
  return url;
}
