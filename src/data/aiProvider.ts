/**
 * AI 服务配置与本地 API 客户端。
 *
 * 隐私契约：
 *  - API Key 只由本机 Vite/Node 进程保存到 macOS Keychain；
 *  - 浏览器 localStorage 只保存服务商、Base URL 和模型名，不保存 Key；
 *  - 浏览器请求本项目的本地 `/api/ai/*`，Key 只会短暂经过本机回环请求，不会进入前端 bundle、外部网络或我们的云端；
 *  - 本地代理只把 Key 发给用户选择的 AI 服务，不写日志、不返回给浏览器；
 *  - 用户可以随时清除 Key。
 */

import { supabase } from '@/data/supabase';
import type { TemplateDefinitionReport } from '@/types';

const STORAGE_KEY = 'seedream-ai-provider/v3';

export type ProviderPresetId = 'agnes' | 'custom';

export interface ProviderPreset {
  id: ProviderPresetId;
  label: string;
  description: string;
  baseUrl: string;
  multimodalModel: string;
  imageModel?: string;
  helpUrl?: string;
  placeholder: string;
}

export const CUSTOM_SERVICE_TEMPLATES = [
  { id: 'blank', label: '手动填写', baseUrl: '', multimodalModel: '', imageModel: '', note: '自己填写接口地址和多模态模型' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', multimodalModel: 'gpt-4o-mini', imageModel: 'gpt-image-1', note: '图片分析' },
  { id: 'kimi', label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', multimodalModel: 'moonshot-v1-8k-vision-preview', imageModel: '', note: '图片分析' },
  { id: 'qwen', label: '通义千问（阿里云）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', multimodalModel: 'qwen-vl-max', imageModel: '', note: '图片分析' },
  { id: 'zhipu', label: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', multimodalModel: 'glm-4v-plus', imageModel: '', note: '图片分析' },
  { id: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', multimodalModel: 'Qwen/Qwen2.5-VL-72B-Instruct', imageModel: '', note: '图片分析' },
  { id: 'gemini', label: 'Gemini（Google）', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', multimodalModel: 'gemini-2.0-flash', imageModel: '', note: '图片分析' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', multimodalModel: 'openai/gpt-4o-mini', imageModel: '', note: '图片分析' },
] as const;

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'agnes',
    label: 'Agnes（免费）',
    description: '暂无其他API Key?可先使用 Agnes免费模型。效果欠佳，仅供参考。',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    multimodalModel: 'agnes-2.5-flash',
    imageModel: '',
    helpUrl: 'https://agnes-ai.com/en/docs/overview',
    placeholder: '在 agnes-ai.com 控制台创建并粘贴 sk-...',
  },
  {
    id: 'custom',
    label: '自定义Key（推荐GPT-5.6 sol 轻度）',
    description: '填写自己的 API Key，选择支持图片输入的分析模型。费用由对应服务商收取。',
    baseUrl: '',
    multimodalModel: '',
    imageModel: '',
    placeholder: '粘贴你的 API Key',
  },
];

/** 浏览器端可见的设置。apiKey / seedreamApiKey 绝不会出现在这个类型中。 */
export interface AIProviderSettings {
  imageProvider?: 'seedream' | 'agnes';
  agnesImageConfigured?: boolean;
  agnesImageApiKeyMask?: string;
  agnesImageModel?: string;
  analysisVerified?: boolean;
  seedreamVerified?: boolean;
  agnesImageVerified?: boolean;
  presetId: ProviderPresetId;
  baseUrl: string;
  multimodalModel: string;
  imageModel?: string;
  seedreamBaseUrl: string;
  seedreamModel: string;
  configured: boolean;
  seedreamConfigured: boolean;
  apiKeyMask: string;
  seedreamApiKeyMask: string;
  updatedAt: string;
}

export type EditableAIProviderSettings = Pick<AIProviderSettings,'presetId'|'baseUrl'|'multimodalModel'|'seedreamBaseUrl'|'seedreamModel'> & Partial<Pick<AIProviderSettings,'imageModel'|'imageProvider'>>;

export interface AIServerSettings extends AIProviderSettings {
  providerReachable?: boolean;
}

export interface StyleFeature {
  name: string;
  description: string;
}

export interface StyleSummary {
  title: string;
  visualSummary: string;
  stableFeatures: StyleFeature[];
  allowedVariations: string[];
  negativeConstraints: string[];
  prompt: string;
}

export interface StyleSummaryResult {
  summary: StyleSummary;
  model: string;
  imageCount: number;
}

export interface TemplateDefinitionResult {
  summary: StyleSummary;
  definition: TemplateDefinitionReport;
  model: string;
  imageCount: number;
}

export interface GeneratedImage {
  url?: string;
  dataUrl?: string;
  assetPath?: string;
  revisedPrompt?: string;
}

export interface ImageGenerationResult {
  images: GeneratedImage[];
  model: string;
}

export const DEFAULT_SETTINGS: AIProviderSettings = {
  presetId: 'agnes',
  baseUrl: PROVIDER_PRESETS[0].baseUrl,
  multimodalModel: PROVIDER_PRESETS[0].multimodalModel,
  imageModel: PROVIDER_PRESETS[0].imageModel,
  seedreamBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  seedreamModel: 'seedream-4-5-251128',
  configured: false,
  seedreamConfigured: false,
  apiKeyMask: '',
  seedreamApiKeyMask: '',
  updatedAt: new Date(0).toISOString(),
};

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
let localSessionTokenPromise: Promise<string> | null = null;

const getLocalSessionToken = async (): Promise<string> => {
  if (!localSessionTokenPromise) {
    localSessionTokenPromise = fetch('/api/ai/session')
      .then(async (response) => {
        if (!response.ok) throw new Error(`本地 AI 服务未启动（HTTP ${response.status}）`);
        const payload = await response.json() as { token?: unknown };
        if (typeof payload.token !== 'string' || !payload.token) throw new Error('本地 AI 会话无效');
        return payload.token;
      })
      .catch((error) => {
        localSessionTokenPromise = null;
        throw error;
      });
  }
  return localSessionTokenPromise;
};

const isPresetId = (value: unknown): value is ProviderPresetId => value === 'agnes' || value === 'custom';

const localSettings = (): AIProviderSettings => {
  if (!isBrowser) return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const value = JSON.parse(raw) as Partial<AIProviderSettings>;
    const presetId = isPresetId(value.presetId) ? value.presetId : DEFAULT_SETTINGS.presetId;
    const preset = resolvePreset(presetId);
    return {
      ...DEFAULT_SETTINGS,
      agnesImageConfigured: value.agnesImageConfigured === true,
      agnesImageApiKeyMask: value.agnesImageApiKeyMask || '',
      agnesImageModel: value.agnesImageModel || '',
      analysisVerified: value.analysisVerified === true,
      seedreamVerified: value.seedreamVerified === true,
      agnesImageVerified: value.agnesImageVerified === true,
      imageProvider: value.imageProvider === 'agnes' ? 'agnes' : 'seedream',
      presetId,
      baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : preset.baseUrl,
      multimodalModel: typeof value.multimodalModel === 'string' ? value.multimodalModel : (typeof (value as Partial<AIProviderSettings> & { chatModel?: unknown }).chatModel === 'string' ? (value as Partial<AIProviderSettings> & { chatModel: string }).chatModel : preset.multimodalModel),
      imageModel: typeof value.imageModel === 'string' ? value.imageModel : (typeof value.seedreamModel === 'string' ? value.seedreamModel : preset.imageModel),
      seedreamBaseUrl: typeof value.seedreamBaseUrl === 'string' ? value.seedreamBaseUrl : DEFAULT_SETTINGS.seedreamBaseUrl,
      seedreamModel: typeof value.seedreamModel === 'string' ? value.seedreamModel : DEFAULT_SETTINGS.seedreamModel,
      configured: value.configured === true,
      seedreamConfigured: value.seedreamConfigured === true,
      apiKeyMask: typeof value.apiKeyMask === 'string' ? value.apiKeyMask : '',
      seedreamApiKeyMask: typeof value.seedreamApiKeyMask === 'string' ? value.seedreamApiKeyMask : '',
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : DEFAULT_SETTINGS.updatedAt,
    };
  } catch (error) {
    console.warn('[seedream-ai] 无法读取本地 AI 设置，将使用默认值', error);
    return DEFAULT_SETTINGS;
  }
};

const persistPublicSettings = (settings: AIProviderSettings): void => {
  if (!isBrowser) return;
  try {
    // 只写非敏感字段。
    const { presetId, baseUrl, multimodalModel, imageModel, seedreamBaseUrl, seedreamModel, configured, seedreamConfigured, apiKeyMask, seedreamApiKeyMask, updatedAt } = settings;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      agnesImageConfigured: settings.agnesImageConfigured, agnesImageApiKeyMask: settings.agnesImageApiKeyMask,
      agnesImageModel: settings.agnesImageModel,
      analysisVerified: settings.analysisVerified, seedreamVerified: settings.seedreamVerified, agnesImageVerified: settings.agnesImageVerified,
      imageProvider: settings.imageProvider || 'seedream', presetId, baseUrl, multimodalModel, imageModel, seedreamBaseUrl, seedreamModel,
      configured, seedreamConfigured, apiKeyMask, seedreamApiKeyMask, updatedAt,
    }));
  } catch (error) {
    console.warn('[seedream-ai] 无法写入本地 AI 设置', error);
  }
};

export const maskApiKey = (key: string): string => {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return `${trimmed[0] ?? '•'}${'•'.repeat(Math.max(4, trimmed.length - 1))}`;
  return `${trimmed.slice(0, 4)}${'•'.repeat(6)}${trimmed.slice(-4)}`;
};

export const resolvePreset = (presetId: ProviderPresetId): ProviderPreset =>
  PROVIDER_PRESETS.find((preset) => preset.id === presetId) ?? PROVIDER_PRESETS[0];

export const loadAIProviderSettings = (): AIProviderSettings => localSettings();

const parseError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json() as { error?: string; message?: string };
    return payload.error || payload.message || `请求失败（HTTP ${response.status}）`;
  } catch {
    return `请求失败（HTTP ${response.status}）`;
  }
};

const withTimeout = async <T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(message);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const sessionToken = await getLocalSessionToken();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const userId = data.user?.id || 'guest';
  const requestWithToken=(token:string)=>fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-seedream-session': token,
      'x-seedream-user': userId,
      ...(init?.headers || {}),
    },
  });
  let response=await requestWithToken(sessionToken);
  if(response.status===403){
    const body=await response.clone().json().catch(()=>null) as {error?:string}|null;
    if(body?.error==='本地 AI 会话已失效，请刷新页面'){
      localSessionTokenPromise=null;
      response=await requestWithToken(await getLocalSessionToken());
    }
  }
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<T>;
};

export const fetchAIProviderSettings = async (): Promise<AIServerSettings> => {
  const settings = await requestJson<AIServerSettings>('/api/ai/settings');
  const normalized={...settings,imageModel:settings.imageModel||settings.seedreamModel||''};
  persistPublicSettings(normalized);
  return normalized;
};

/** 保存多模态配置和可选的 Seedream Key。apiKey 只经过本机代理，不写入浏览器存储。 */
export const saveAIProviderSettings = async (
  settings: EditableAIProviderSettings,
  apiKey?: string,
  seedreamApiKey?: string,
  agnesImage?: { agnesImageApiKey?: string; reuseAgnesImageKey?: boolean },
): Promise<AIServerSettings> => {
  const saved = await requestJson<AIServerSettings>('/api/ai/settings', {
    method: 'PUT',
    body: JSON.stringify({ ...settings, ...agnesImage, seedreamModel:settings.imageModel||settings.seedreamModel, seedreamBaseUrl:settings.seedreamBaseUrl||settings.baseUrl, ...(apiKey !== undefined ? { apiKey } : {}), ...(seedreamApiKey !== undefined ? { seedreamApiKey } : {}) }),
  });
  const normalized={...saved,imageModel:saved.imageModel||saved.seedreamModel||settings.imageModel||''};
  persistPublicSettings(normalized);
  return normalized;
};

export const clearAIProviderApiKey = async (): Promise<AIServerSettings> => {
  const cleared = await requestJson<AIServerSettings>('/api/ai/settings/key', { method: 'DELETE' });
  persistPublicSettings(cleared);
  return cleared;
};

export const testAIProviderConnection = async (draft: {
  target: 'analysis' | 'image'; settings: EditableAIProviderSettings;
  apiKey?: string; seedreamApiKey?: string; agnesImageApiKey?: string; reuseAgnesImageKey?: boolean;
}): Promise<{ model: string; provider: string; settings: AIServerSettings }> => {
  const result = await requestJson<{ model: string; provider: string; settings: AIServerSettings }>('/api/ai/connection-test', { method: 'POST', body: JSON.stringify(draft) });
  persistPublicSettings(result.settings);
  return result;
};

const dataUrlFromSource = async (source: string): Promise<string> => {
  if (source.startsWith('data:')) return source;
  const response = await withTimeout(
    (signal) => fetch(source, { signal }),
    45_000,
    '读取参考图超时，请检查图片链接后重试',
  );
  if (!response.ok) throw new Error(`无法读取图片（HTTP ${response.status}）`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'));
    reader.readAsDataURL(blob);
  });
};

export const toImageDataUrls = async (sources: string[]): Promise<string[]> =>
  Promise.all(sources.map(dataUrlFromSource));

export const summarizeStyle = async (sources: string[], instruction?: string): Promise<StyleSummaryResult> => {
  const images = await toImageDataUrls(sources);
  return requestJson<StyleSummaryResult>('/api/ai/style-summary', {
    method: 'POST',
    body: JSON.stringify({ images, instruction }),
  });
};

export interface DefinitionJob {
  id:string;templateId:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';phase:string;startedAt:string;updatedAt:string;
  history:Array<{phase:string;at:string}>;result?:TemplateDefinitionResult;error?:string;
  outputs?:Array<{stage:string;text:string}>;
  failedPhase?:string;
}
export const fetchDefinitionJobs=()=>requestJson<DefinitionJob[]>('/api/ai/definition-jobs');
export const defineTemplate = async (sources:string[],input:{templateId:string;templateName:string;usageScenario:string;runtimeInput:string}):Promise<{jobId:string}>=>{
  const images=await toImageDataUrls(sources);
  return requestJson<{jobId:string}>('/api/ai/template-definition', { method: 'POST', body: JSON.stringify({ images, ...input }) });
};

export const generateImage = async (prompt: string, image?: string): Promise<ImageGenerationResult> => {
  const imageDataUrl = image ? (await toImageDataUrls([image]))[0] : undefined;
  return requestJson<ImageGenerationResult>('/api/ai/generate-image', {
    method: 'POST',
    body: JSON.stringify({ prompt, imageDataUrl }),
  });
};
