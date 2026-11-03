import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';

export function AuthGate({ children }: { children: (user: string, logout: () => Promise<void>) => ReactNode }) {
  const [user, setUser] = useState('');
  const [checking, setChecking] = useState(true);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { signal: controller.signal }).then(r => r.json()).then(v => { if (v.authenticated) setUser(v.user); })
      .catch(() => { if (!controller.signal.aborted) setError('无法连接登录服务，请确认上位机服务已启动。'); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);
  const login = async (event: FormEvent) => {
    event.preventDefault(); setWorking(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: account.trim(), password }) });
      const data = await response.json();
      if (!response.ok || !data.authenticated) throw new Error(data.error ?? '登录失败。');
      setUser(data.user); setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败，请重试。'); }
    finally { setWorking(false); }
  };
  const logout = async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('退出登录失败，请重试。');
    setUser(''); setPassword('');
  };
  if (checking) return <main className="login-shell"><p role="status">正在打开湘绣工作台…</p></main>;
  if (user) return <>{children(user, logout)}</>;
  return <main className="login-shell">
    <section className="login-story"><div className="login-brand"><span className="brand-mark">湘绣</span><span>一针千韵<small>非遗智能刺绣工作台</small></span></div><div className="login-poem"><span>以针为笔</span><span>以线传情</span></div><p>让传统针法，遇见智能创作。</p><small className="login-caption">XIANG EMBROIDERY · INTELLIGENT STUDIO</small></section>
    <section className="login-card"><span className="login-eyebrow">一针一线 · 绣见新生</span><h1>欢迎回来</h1><p>登录，开始你的湘绣创作。</p>
      <form onSubmit={event => void login(event)}><label htmlFor="login-account">账号</label><div className="login-input"><UserRound size={18}/><input id="login-account" name="username" autoComplete="username" placeholder="请输入账号" value={account} onChange={e => setAccount(e.target.value)} required maxLength={80}/></div>
      <label htmlFor="login-password">密码</label><div className="login-input"><LockKeyhole size={18}/><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="请输入密码" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128}/><button type="button" aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
      {error && <p className="login-error" role="alert">{error}</p>}<button className="login-submit" disabled={working || !account.trim() || !password} type="submit">{working ? '正在登录…' : '登录工作台'}<ArrowRight size={17}/></button></form>
      <small className="login-footnote">湘绣 · 传统之美，指尖新生</small></section>
  </main>;
}
