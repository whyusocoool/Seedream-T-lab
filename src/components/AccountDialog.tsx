import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cloudRepository } from '@/data/cloudRepository';
import type { Job } from '@/data/cloudRepository';
import { useAppStore } from '@/store/appStore';

const messageOf=(reason:unknown)=>reason&&typeof reason==='object'&&'message' in reason?String(reason.message):'保存失败，请重试';

export default function AccountDialog({onClose}:{onClose:()=>void}){
  const user=useAppStore(state=>state.currentUser)!;
  const roles=useAppStore(state=>state.accountRoles);
  const setUser=useAppStore(state=>state.setCurrentUser);
  const setRoles=useAppStore(state=>state.setAccountRoles);
  const navigate=useNavigate();
  const [name,setName]=useState(user.name);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [panel,setPanel]=useState<'profile'|'password'|'job'>('profile');
  const avatar=user.role==='tester'?'/images/avatar-tester.png':'/images/avatar-ux-cat.png';

  useEffect(()=>{
    let active=true;
    void cloudRepository.currentAccount().then(account=>{if(active){setName(account.name);setEmail(account.email)}}).catch(reason=>{if(active)setError(messageOf(reason))}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);

  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setError('');setMessage('');
    if(password&&password.length<8){setError('新密码至少 8 位');return}
    if(password!==confirmPassword){setError('两次输入的新密码不一致');return}
    setBusy(true);
    try{
      const previousEmail=email;
      const account=await cloudRepository.updateAccount({name,email,password:panel==='password'?password||undefined:undefined});
      setUser({...user,name:account.name,avatarUrl:account.avatarUrl});
      setPassword('');setConfirmPassword('');
      setMessage(account.email===previousEmail?'个人资料已保存':'资料已保存；如果修改了邮箱，请按邮件提示确认');
    }catch(reason){setError(messageOf(reason))}finally{setBusy(false)}
  };
  const changeJob=async(job:Job)=>{setBusy(true);setError('');setMessage('');try{await cloudRepository.changeJob(job);setRoles([job]);setUser({...user,role:job});setPanel('profile');setMessage(`已切换为${job==='ux'?' UX':'测试'}岗位`)}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}};
  const logout=async()=>{setBusy(true);try{await cloudRepository.signOut()}finally{setUser(null);setRoles([]);navigate('/role')}};

  return <div className="account-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <header><div><span className="eyebrow">ACCOUNT</span><h2 id="account-title">个人资料</h2></div><button type="button" className="account-close" onClick={onClose} aria-label="关闭">×</button></header>
      <div className="account-identity"><img className="avatar" src={avatar} alt=""/><div><b>{user.name}</b><span>{roles.map(role=>role==='tester'?'测试':role==='ux'?'UX':role).join(' / ')}</span></div></div>
      {panel==='profile'&&<form onSubmit={save}>
        <label>姓名<input required disabled={loading||busy} value={name} onChange={event=>setName(event.target.value)}/></label>
        <label>账号邮箱<input required type="email" disabled={loading||busy} value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email"/></label>
        {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-success">{message}</p>}
        <button className="btn primary account-save" disabled={loading||busy}>{busy?'保存中…':'保存资料'}</button>
        <div className="account-secondary-actions"><button className="btn" type="button" onClick={()=>{setPanel('password');setError('');setMessage('')}}>修改密码</button><button className="btn" type="button" onClick={()=>{setPanel('job');setError('');setMessage('')}}>修改岗位</button></div>
      </form>}
      {panel==='password'&&<form onSubmit={save}><button className="account-panel-back" type="button" onClick={()=>setPanel('profile')}>← 返回个人资料</button>
        <h3>修改密码</h3>
        <label>新密码<input type="password" minLength={8} disabled={loading||busy} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" placeholder="至少 8 位"/></label>
        <label>再次输入<input type="password" disabled={loading||busy} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} autoComplete="new-password"/></label>
        {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-success">{message}</p>}
        <button className="btn primary account-save" disabled={loading||busy||!password}>{busy?'保存中…':'确认修改密码'}</button>
      </form>}
      {panel==='job'&&<section className="account-job-panel"><button className="account-panel-back" type="button" onClick={()=>setPanel('profile')}>← 返回个人资料</button><h3>修改岗位</h3><p>岗位决定你使用的画布和工作流界面。</p><div className="account-job-options"><button disabled={busy||user.role==='ux'} onClick={()=>void changeJob('ux')}>UX {user.role==='ux'&&'· 当前'}</button><button disabled={busy||user.role==='tester'} onClick={()=>void changeJob('tester')}>测试 {user.role==='tester'&&'· 当前'}</button></div>{error&&<p className="account-error">{error}</p>}</section>}
      <footer><span>账号设置仅影响你自己</span><button type="button" onClick={()=>void logout()} disabled={busy}>退出登录</button></footer>
    </section>
  </div>;
}
