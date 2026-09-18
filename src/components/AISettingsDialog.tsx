import { useEffect, useRef, useState } from 'react';
import '@/styles/ai-settings-layout.css';
import {
  clearAIProviderApiKey,
  fetchAIProviderSettings,
  CUSTOM_SERVICE_TEMPLATES,
  PROVIDER_PRESETS,
  resolvePreset,
  testAIProviderConnection,
  type AIProviderSettings,
  type ProviderPresetId,
} from '@/data/aiProvider';

interface AISettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const fallbackSettings = (): AIProviderSettings => ({
  presetId: 'agnes',
  baseUrl: PROVIDER_PRESETS[0].baseUrl,
  multimodalModel: PROVIDER_PRESETS[0].multimodalModel,
  seedreamBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  seedreamModel: 'seedream-4-5-251128',
  configured: false,
  seedreamConfigured: false,
  apiKeyMask: '',
  seedreamApiKeyMask: '',
  updatedAt: new Date(0).toISOString(),
});

/**
 * AI 设置弹窗。
 *
 * 重要：服务端不会把完整 API Key 返回给浏览器，所以密码框永远是空的。
 * 用户要替换 Key 时重新输入；留空保存则保留本机已保存的 Key。
 */
export default function AISettingsDialog({ open, onClose }: AISettingsDialogProps) {
  const [settings, setSettings] = useState<AIProviderSettings>(fallbackSettings);
  const [savedSettings, setSavedSettings] = useState<AIProviderSettings>(fallbackSettings);
  const [apiKey, setApiKey] = useState('');
  const [seedreamApiKey, setSeedreamApiKey] = useState('');
  const [agnesImageApiKey, setAgnesImageApiKey] = useState('');
  const [reuseAgnesImageKey, setReuseAgnesImageKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedService, setSelectedService] = useState('openai');
  const [activeTab, setActiveTab] = useState<'seedream' | 'multimodal'>('multimodal');
  const connectedDraft = useRef('');
  const attemptedDraft = useRef('');
  const testDraft = useRef<() => Promise<void>>(async () => {});
  const [connectionPending, setConnectionPending] = useState(false);
  const draftSignature = (value: AIProviderSettings, analysisKey: string, seedreamKey: string, agnesKey: string, reuse: boolean) => JSON.stringify([
    activeTab, value.presetId, value.baseUrl, value.multimodalModel, value.imageProvider || 'seedream', value.seedreamBaseUrl, value.seedreamModel,
    analysisKey, seedreamKey, agnesKey, reuse,
  ]);
  const signature = draftSignature(settings, apiKey, seedreamApiKey, agnesImageApiKey, reuseAgnesImageKey);

  useEffect(() => {
    if (!open) return;
    attemptedDraft.current = '';
    connectedDraft.current = '';
    setApiKey('');
    setSeedreamApiKey('');
    setAgnesImageApiKey('');
    setReuseAgnesImageKey(false);
    setMessage('');
    setError('');
    setBusy(true);
    void fetchAIProviderSettings()
      .then((next) => {
        setSavedSettings(next);
        const service = CUSTOM_SERVICE_TEMPLATES.find(item => item.id !== 'blank' && item.baseUrl === next.baseUrl);
        setSelectedService(next.presetId === 'custom' && next.baseUrl ? service?.id || 'blank' : 'openai');
        const openai = CUSTOM_SERVICE_TEMPLATES.find(item => item.id === 'openai')!;
        setSettings(next.presetId === 'custom' && !next.baseUrl ? { ...next, baseUrl: openai.baseUrl, multimodalModel: openai.multimodalModel } : next);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '无法读取本机 AI 设置');
      })
      .finally(() => setBusy(false));
  }, [open]);

  const hasSavedAnalysisKey = savedSettings.configured && savedSettings.presetId === settings.presetId && savedSettings.baseUrl.replace(/\/+$/, '') === settings.baseUrl.replace(/\/+$/, '');
  const savedDraftMatches = activeTab === 'multimodal'
    ? hasSavedAnalysisKey && settings.multimodalModel === savedSettings.multimodalModel && !apiKey.trim()
    : settings.imageProvider === 'agnes' ? Boolean(savedSettings.imageProvider === 'agnes' && savedSettings.agnesImageConfigured && !agnesImageApiKey.trim() && !reuseAgnesImageKey)
    : Boolean(savedSettings.imageProvider !== 'agnes' && savedSettings.seedreamConfigured && settings.seedreamBaseUrl === savedSettings.seedreamBaseUrl && settings.seedreamModel === savedSettings.seedreamModel && !seedreamApiKey.trim());
  const savedVerified = activeTab === 'multimodal' ? savedSettings.analysisVerified : settings.imageProvider === 'agnes' ? savedSettings.agnesImageVerified : savedSettings.seedreamVerified;
  useEffect(() => {
    if (!open) { setConnectionStatus('idle'); return; }
    if (savedDraftMatches && savedVerified) setConnectionStatus('success');
    else if (signature !== connectedDraft.current) setConnectionStatus('idle');
  }, [open, signature, savedDraftMatches, savedVerified]);
  const canAutoConnect = activeTab === 'multimodal'
    ? Boolean(settings.baseUrl && settings.multimodalModel && (apiKey.trim() || hasSavedAnalysisKey))
    : settings.imageProvider === 'agnes'
      ? Boolean(agnesImageApiKey.trim() || reuseAgnesImageKey || settings.agnesImageConfigured)
      : Boolean(seedreamApiKey.trim() || settings.seedreamConfigured);
  useEffect(() => {
    if (!open || busy || testing || savedDraftMatches || !canAutoConnect || signature === connectedDraft.current || signature === attemptedDraft.current) {
      setConnectionPending(false);
      return;
    }
    setConnectionPending(true);
    const timer = window.setTimeout(() => {
      attemptedDraft.current = signature;
      setConnectionPending(false);
      void testDraft.current();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [open, busy, testing, canAutoConnect, signature, savedDraftMatches]);

  if (!open) return null;

  const choosePreset = (presetId: ProviderPresetId) => {
    if(settings.presetId === presetId)return;
    const preset = resolvePreset(presetId);
    const service = CUSTOM_SERVICE_TEMPLATES.find(item => item.id === 'openai')!;
    const restoreSaved = savedSettings.presetId === presetId;
    if (presetId === 'custom') setSelectedService(restoreSaved ? CUSTOM_SERVICE_TEMPLATES.find(item => item.id !== 'blank' && item.baseUrl === savedSettings.baseUrl)?.id || 'blank' : 'openai');
    setSettings((current) => ({
      ...current,
      presetId,
      baseUrl: restoreSaved ? savedSettings.baseUrl : presetId === 'custom' ? service.baseUrl : preset.baseUrl,
      multimodalModel: restoreSaved ? savedSettings.multimodalModel : presetId === 'custom' ? service.multimodalModel : preset.multimodalModel,
    }));
    setApiKey('');
    setMessage('');
    setError('');
  };

  const update = (field: 'baseUrl' | 'multimodalModel' | 'seedreamBaseUrl' | 'seedreamModel', value: string) => {
    setSettings((current) => ({ ...current, [field]: value }));
    setMessage('');
    setError('');
  };

  const applyCustomTemplate = (templateId: string) => {
    const template = CUSTOM_SERVICE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedService(templateId);
    setSettings((current) => ({
      ...current,
      presetId: 'custom',
      baseUrl: template.baseUrl,
      multimodalModel: savedSettings.presetId === 'custom' && savedSettings.baseUrl === template.baseUrl ? savedSettings.multimodalModel : template.multimodalModel,
    }));
    setApiKey('');
    setMessage('');
    setError('');
  };

  const clearKey = async () => {
    if (!window.confirm('确定从本机删除所有 AI API Key 吗？删除后仍可重新填写。')) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const next = await clearAIProviderApiKey();
      setSavedSettings(next);
      setSettings(next);
      setAgnesImageApiKey('');
      setReuseAgnesImageKey(false);
      setApiKey('');
      setSeedreamApiKey('');
      setMessage('已从本机删除 API Key。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if(testing || busy)return;
    attemptedDraft.current = signature;
    setTesting(true);
    setMessage('');
    setError('');
    try {
      const result = await testAIProviderConnection({
        target: activeTab === 'multimodal' ? 'analysis' : 'image',
        settings: {
          presetId: settings.presetId,
          imageProvider: settings.imageProvider || 'seedream',
          baseUrl: settings.baseUrl,
          multimodalModel: settings.multimodalModel,
          seedreamBaseUrl: settings.seedreamBaseUrl,
          seedreamModel: settings.seedreamModel,
        },
        apiKey: apiKey.trim() || undefined,
        seedreamApiKey: seedreamApiKey.trim() || undefined,
        agnesImageApiKey: agnesImageApiKey.trim() || undefined,
        reuseAgnesImageKey,
      });
      setSavedSettings(result.settings);
      const merged = activeTab === 'multimodal' ? { ...result.settings, imageProvider: settings.imageProvider } : {
        ...result.settings, presetId: settings.presetId, baseUrl: settings.baseUrl, multimodalModel: settings.multimodalModel,
      };
      connectedDraft.current = draftSignature(merged, activeTab === 'multimodal' ? '' : apiKey, activeTab === 'seedream' ? '' : seedreamApiKey, activeTab === 'seedream' ? '' : agnesImageApiKey, activeTab === 'seedream' ? false : reuseAgnesImageKey);
      setSettings(merged);
      if(activeTab === 'multimodal') setApiKey('');
      else { setSeedreamApiKey(''); setAgnesImageApiKey(''); setReuseAgnesImageKey(false); }
      setConnectionStatus('success');
      setMessage(`连接成功，已自动保存：${result.provider} / ${result.model}${activeTab === 'seedream' ? '（已验证 Key 与模型权限，未实际出图）' : ''}`);
    } catch (reason: unknown) {
      setConnectionStatus('failed');
      setError(reason instanceof Error ? reason.message : '连接失败');
    } finally {
      setTesting(false);
    }
  };
  testDraft.current = test;

  const preset = resolvePreset(settings.presetId);
  const isCustom = settings.presetId === 'custom';
  const analysisConfigured = savedSettings.configured && savedSettings.presetId === settings.presetId && savedSettings.baseUrl.replace(/\/+$/, '') === settings.baseUrl.replace(/\/+$/, '');

  return (
    <div className="ai-settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ai-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <header className="ai-settings-header">
          <div>
            <span className="eyebrow">Key 仅保存在当前电脑</span>
            <div className="ai-settings-title-row">
              <h2 id="ai-settings-title">AI 服务设置</h2>
              <div className="ai-settings-key-links">
                {activeTab === 'seedream' ? (
                  <a className="ai-help-link" href="https://console.byteplus.com/ai/aiagency/model" target="_blank" rel="noreferrer">获取 Seedream Key ↗</a>
                ) : (
                  <a className="ai-help-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">获取 OpenAI Key ↗</a>
                )}
                <a className="ai-help-link" href={resolvePreset('agnes').helpUrl} target="_blank" rel="noreferrer">获取 Agnes Key ↗</a>
              </div>
            </div>
          </div>
          <div className="ai-settings-header-actions">
            <button className="ai-settings-close" type="button" onClick={onClose} aria-label="关闭 AI 设置">×</button>
          </div>
        </header>

        <div className="ai-settings-tab-row">
        <div className="ai-settings-tabs" role="tablist" aria-label="AI 能力配置">
          <button
            type="button"
            role="tab"
            disabled={testing || busy}
            aria-selected={activeTab === 'multimodal'}
            aria-controls="multimodal-panel"
            className={activeTab === 'multimodal' ? 'active' : ''}
            id="multimodal-tab"
            onClick={() => {setActiveTab('multimodal'); setError(''); setMessage('');}}
          >
            分析模型
          </button>
          <button
            type="button"
            role="tab"
            disabled={testing || busy}
            aria-selected={activeTab === 'seedream'}
            aria-controls="seedream-panel"
            className={activeTab === 'seedream' ? 'active' : ''}
            id="seedream-tab"
            onClick={() => {setActiveTab('seedream'); setError(''); setMessage('');}}
          >
            生图模型
          </button>
        </div>

        </div>

        <fieldset className="ai-settings-body" key={activeTab} disabled={busy || testing}>
        {activeTab === 'seedream' && (
          <div id="seedream-panel" role="tabpanel" aria-labelledby="seedream-tab">
            <div className="ai-provider-options" role="radiogroup" aria-label="生图服务商">
              <button type="button" role="radio" aria-checked={settings.imageProvider !== 'agnes'} className={settings.imageProvider !== 'agnes' ? 'selected' : ''} onClick={() => setSettings(current => ({ ...current, imageProvider: 'seedream' }))}>
                <span><b>Seedream（推荐实测）</b><small>建议使用 Seedream 生成验证图，实际检验模板风格与规则。需使用自己的 Seedream API Key。</small></span>
                <i>{settings.imageProvider !== 'agnes' ? '✓' : ''}</i>
              </button>
              <button type="button" role="radio" aria-checked={settings.imageProvider === 'agnes'} className={settings.imageProvider === 'agnes' ? 'selected' : ''} onClick={() => { setSettings(current => ({ ...current, imageProvider: 'agnes' })); setMessage(''); setError(''); }}>
                <span><b>Agnes（免费）</b><small>{resolvePreset('agnes').description}</small></span>
                <i>{settings.imageProvider === 'agnes' ? '✓' : ''}</i>
              </button>
            </div>
            {settings.imageProvider === 'agnes' ? (
              <>
                <div className="ai-settings-field">
                  <div className="ai-settings-key-heading">
                  <label htmlFor="agnes-image-key">API Key <em>{reuseAgnesImageKey ? '将复用分析模型 Key' : settings.agnesImageConfigured ? `已保存：${settings.agnesImageApiKeyMask}` : '未填写'}</em></label>
                <button className="btn" type="button" disabled={busy || testing} onClick={() => {
                  if(savedSettings.presetId !== 'agnes' || !savedSettings.configured) { setError('请先在分析模型中连接 Agnes，再复用 Key'); return; }
                  setAgnesImageApiKey(''); setReuseAgnesImageKey(true); attemptedDraft.current = ''; setError(''); setMessage('正在复用分析模型 Key，连接成功后自动保存。');
                }}>{reuseAgnesImageKey ? '已选择复用' : '复用分析模型 Key'}</button>
                  </div>
                  <input id="agnes-image-key" type="password" autoComplete="new-password" value={agnesImageApiKey} placeholder={reuseAgnesImageKey ? '连接成功后应用复用 Key；输入新值可改为手动填写' : settings.agnesImageConfigured ? '输入替换新 Key' : '粘贴 Agnes API Key'} onChange={event => { setAgnesImageApiKey(event.target.value); setReuseAgnesImageKey(false); }} />
                </div>
                <p className="ai-settings-model-note">模型版本：<code>{settings.agnesImageModel || '未确认，请填写 Key'}</code></p>
              </>
            ) : <>
            <label className="ai-settings-field">
              <span>API Key
                {settings.seedreamConfigured
                  ? <em className="ai-settings-tag-ok">已保存：{settings.seedreamApiKeyMask}</em>
                  : <em className="ai-settings-tag-warn">未填写</em>}
              </span>
              <input
                type="password"
                value={seedreamApiKey}
                autoComplete="new-password"
                placeholder={settings.seedreamConfigured ? '输入替换新 Key' : '粘贴 Seedream / BytePlus Ark API Key'}
                onChange={(event) => setSeedreamApiKey(event.target.value)}
              />
            </label>
            <p className="ai-settings-model-note">模型版本：<code>{settings.seedreamModel}</code></p>
            </>}
          </div>
        )}

        {activeTab === 'multimodal' && (
          <div id="multimodal-panel" role="tabpanel" aria-labelledby="multimodal-tab">
            <div className="ai-provider-options" role="radiogroup" aria-label="AI 服务商">
              {[resolvePreset('custom'), resolvePreset('agnes')].map((option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.presetId === option.id}
                  className={settings.presetId === option.id ? 'selected' : ''}
                  key={option.id}
                  onClick={() => choosePreset(option.id)}
                >
                  <span><b>{option.label}</b><small>{option.description}</small></span>
                  <i>{settings.presetId === option.id ? '✓' : ''}</i>
                </button>
              ))}
            </div>
            <label className="ai-settings-field">
              <span>
                API Key {!analysisConfigured && <em>未填写</em>}
                {analysisConfigured && <em>已保存：{savedSettings.apiKeyMask}</em>}
              </span>
              <input
                type="password"
                value={apiKey}
                autoComplete="new-password"
                placeholder={analysisConfigured ? '输入替换新 Key' : preset.placeholder}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <p className="ai-settings-model-note">模型版本：<code>{settings.multimodalModel || '未选择'}</code></p>
            {isCustom && (
              <>
                <label className="ai-settings-field">
                  <span>选择服务商</span>
                  <select value={selectedService} onChange={(event) => applyCustomTemplate(event.target.value)}>
                    {CUSTOM_SERVICE_TEMPLATES.map((template) => (
                      <option value={template.id} key={template.id}>{template.id === 'blank' ? '自定义其他模型' : template.label}</option>
                    ))}
                  </select>
                </label>
                {selectedService === 'blank' && <label className="ai-settings-field">
                  <span>Base URL <em>必填</em></span>
                  <input value={settings.baseUrl} placeholder="https://your-service.example.com/v1" onChange={(event) => update('baseUrl', event.target.value)} />
                </label>}
                <label className="ai-settings-field">
                  <span>分析模型</span>
                  <input value={settings.multimodalModel} placeholder="填写模型 ID" onChange={event => update('multimodalModel', event.target.value)} />
                </label>
              </>
            )}
          </div>
        )}

        {/* ── 操作按钮 ─────────────────────────────────── */}
        {error && <p className="ai-settings-feedback error" role="alert">{error}</p>}
        {message && <p className="ai-settings-feedback success" role="status">{message}</p>}
        </fieldset>

        <footer className="ai-settings-actions">
          <div>
            <button className="btn" type="button" disabled={busy || testing} onClick={() => { void clearKey(); }}>
              清除 Key
            </button>
          </div>
          <div>
            <button className={`btn ai-connection-${connectionStatus}`} type="button" disabled={busy || testing || connectionPending} onClick={() => { void test(); }}>
              {testing || connectionPending ? '连接中…' : connectionStatus === 'success' ? '连接成功' : connectionStatus === 'failed' ? '连接失败，重试' : savedDraftMatches ? '验证连接' : '等待填写 Key'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
