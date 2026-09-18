import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/data/supabase';

type CallbackState = 'checking' | 'success' | 'login-required' | 'error';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>('checking');

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setState('error');
      return;
    }

    let active = true;
    let timer: number | undefined;
    const finish = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error && !error.message.toLowerCase().includes('already')) throw error;
        }
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!active) return;
        if (data.session) {
          setState('success');
          timer = window.setTimeout(() => navigate('/templates', { replace: true }), 900);
        } else {
          setState('login-required');
        }
      } catch {
        if (active) setState('error');
      }
    };
    void finish();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [navigate]);

  return <main className="auth-callback-page">
    <section className="auth-callback-card">
      <div className="eyebrow">ACCOUNT VERIFICATION</div>
      {state === 'checking' && <><h1>正在验证邮箱…</h1><p>请稍候，正在为你连接团队空间。</p></>}
      {state === 'success' && <><div className="auth-callback-mark">✓</div><h1>邮箱验证成功</h1><p>账号已激活，正在进入工作台。</p></>}
      {state === 'login-required' && <><div className="auth-callback-mark">✓</div><h1>邮箱已验证</h1><p>验证链接是在另一个浏览器中打开的，请登录一次即可进入。</p><button onClick={() => navigate('/role', { replace: true })}>返回登录</button></>}
      {state === 'error' && <><h1>验证链接无效或已过期</h1><p>请返回登录；如果账号尚未激活，请重新注册以获取新邮件。</p><button onClick={() => navigate('/role', { replace: true })}>返回登录</button></>}
    </section>
  </main>;
}
