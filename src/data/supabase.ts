import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const cloudEnabled = Boolean(url && anonKey);

const isQuotaError = (error: unknown) =>
  error instanceof DOMException && (error.name === 'QuotaExceededError' || /quota has been exceeded/i.test(error.message));

const authStorage = typeof window === 'undefined' ? undefined : {
  getItem(key: string) {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      // Login must not delete the user's only remaining canvas/template cache.
      window.sessionStorage.setItem(key, value);
    }
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

// Older builds cached cloud-backed canvas images and generated previews in
// localStorage. Safari has a small per-origin quota; once full, Supabase cannot
// persist the login session. Keep cloud data in the cloud and retain only the
// lightweight template metadata locally.
if (cloudEnabled && typeof window !== 'undefined') {
  try {
    const appKey = 'seedream-app-storage';
    const raw = window.localStorage.getItem(appKey);
    if (raw) {
      const persisted = JSON.parse(raw) as { state?: { templates?: Array<Record<string, unknown>> } };
      if (Array.isArray(persisted.state?.templates)) {
        persisted.state.templates = persisted.state.templates.map((template) => {
          const images = Array.isArray(template.referenceImages) ? template.referenceImages : [];
          const paths = Array.isArray(template.referenceImagePaths) ? template.referenceImagePaths : [];
          const fullyCloudBacked = images.length > 0 && paths.length === images.length;
          return {
            ...template,
            ...(fullyCloudBacked ? { referenceImages: undefined } : {}),
            ...(typeof template.coverImageUrl === 'string' && template.coverImageUrl.startsWith('data:') && template.coverImagePath ? { coverImageUrl: undefined } : {}),
          };
        });
        window.localStorage.setItem(appKey, JSON.stringify(persisted));
      }
    }
  } catch (error) {
    console.warn('[storage] 无法压缩旧的云端图片缓存', error);
  }
}

export const supabase = cloudEnabled
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
    })
  : null;
