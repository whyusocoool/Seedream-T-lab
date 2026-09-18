import { useEffect, useState } from 'react';
import AISettingsDialog from '@/components/AISettingsDialog';
import { fetchAIProviderSettings, type AIProviderSettings } from '@/data/aiProvider';

/**
 * 只显示当前本机 AI 配置状态，不显示完整 API Key。
 */
export default function AIStatusButton() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AIProviderSettings | null>(null);

  const refresh = () => {
    void fetchAIProviderSettings().then(setSettings).catch(() => {
      // 设置弹窗会给出更详细错误；状态按钮保持可用。
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const ready = Boolean(settings?.configured || settings?.seedreamConfigured);
  return <>
    <button type="button" className={`ai-status-button ${ready ? 'configured' : 'unconfigured'}`} onClick={() => setOpen(true)} title={ready?'本机 AI 已配置':'AI 未配置，点击配置'}>
      <span className="ai-status-dot" />
      <span>{ready ? 'AI 已连接' : '配置 AI'}</span>
    </button>
    <AISettingsDialog open={open} onClose={() => { setOpen(false); refresh(); }} />
  </>;
}
