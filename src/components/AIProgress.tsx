import { useEffect, useState } from 'react';
import '@/styles/ai-progress.css';

export default function AIProgress({ active }: { active: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return <div className="ai-define-progress" role="status" aria-live="polite" aria-label="DEFINE 正在分析">
    <div className="ai-define-progress-head"><span>模型分析并生成结构化报告</span><b>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</b></div>
    <div className="ai-define-progress-track indeterminate" aria-hidden="true"><span/></div>
    <small>模型返回后会自动校验 JSON；结构不完整时会自动修复一次。</small>
  </div>;
}
