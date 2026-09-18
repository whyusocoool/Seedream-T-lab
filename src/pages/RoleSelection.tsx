import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import type { MemberRole } from '@/types';
import '@/styles/figma-screens.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository, type Job } from '@/data/cloudRepository';

const errorMessage=(reason:unknown,fallback:string)=>{
  if(reason&&typeof reason==='object'&&'message' in reason&&typeof reason.message==='string'){
    if(/jwt issued at future/i.test(reason.message))return '登录令牌正在同步，请稍等几秒后重试。';
    const detail=reason as {name?:unknown;code?:unknown;status?:unknown};
    const diagnostics=[typeof detail.name==='string'?detail.name:'',typeof detail.code==='string'?`code=${detail.code}`:'',typeof detail.status==='number'?`HTTP ${detail.status}`:''].filter(Boolean).join(' · ');
    return diagnostics?`${reason.message}（${diagnostics}）`:reason.message;
  }
  if(typeof reason==='string')return reason;
  return fallback;
};

export default function RoleSelection(){
  const nav=useNavigate();
  const {workspace,setCurrentUser,setAccountRoles}=useAppStore();
  const choose=(role:MemberRole)=>{
    const member=workspace.members.find(x=>x.role===role);
    if(member){setCurrentUser(member);nav('/templates')}
  };
  const roles=[
    {role:'ux' as MemberRole,title:'UX 设计师',img:'/images/figma-role-ux.png',desc:'定义视觉规格、审查规则并完成发布。'},
    {role:'tester' as MemberRole,title:'测试工程师',img:'/images/figma-role-tester.png',desc:'执行 FIT、评分诊断与回归验证。'},
  ];
  const [mode,setMode]=useState<'login'|'signup'>('login');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [job,setJob]=useState<Job|null>(null);
  const [error,setError]=useState('');
  const [verificationSent,setVerificationSent]=useState(false);
  const [resendMessage,setResendMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    let step='认证';
    try{
      if(mode==='signup'){
        if(!job)throw new Error('请先选择你的岗位');
        const result=await cloudRepository.signUp(email,password,name,job);
        if(!result.session){setVerificationSent(true);return;}
      }else await cloudRepository.signIn(email,password);
      step='读取用户资料';
      const profile=await cloudRepository.currentProfile();
      if(!profile)throw new Error('登录会话未建立，请重试');
      const roles:MemberRole[]=profile.jobs.length?profile.jobs:['viewer'];
      step='保存工作台状态';
      setAccountRoles(roles);
      setCurrentUser({id:profile.id,name:profile.name,avatarUrl:profile.avatarUrl,role:roles[0]});
      step='进入工作台';
      nav('/templates');
    }catch(reason){setError(`${step}失败：${errorMessage(reason,'登录失败，请重试')}`)}
    finally{setBusy(false)}
  };
  const resend=async()=>{
    setBusy(true);setResendMessage('');
    try{
      await cloudRepository.resendSignUp(email);
      setResendMessage('验证邮件已重新发送，请检查收件箱和垃圾邮件。');
    }catch(reason){
      setResendMessage(errorMessage(reason,'重新发送失败，请稍后再试'));
    }finally{setBusy(false)}
  };
  if(cloudEnabled)return <main className="cloud-auth-page">
    <section className="cloud-auth-brand"><div className="brand">seedream&nbsp; T-lab<i>.</i></div><h1>让视觉标准<br/>成为共同语言。</h1><p>账号决定身份，岗位决定画布；模板与测试结果在团队之间共享。</p></section>
    {verificationSent ? <section className="cloud-auth-form cloud-auth-sent">
      <div className="eyebrow">CHECK YOUR EMAIL</div><h2>验证邮件已发送</h2>
      <p>点击邮件里的验证链接即可激活账号，并自动回到工作台。</p>
      <p className="cloud-auth-hint">请在当前这台电脑上打开链接；如果使用另一台设备或浏览器，验证后需要登录一次。</p>
      {resendMessage&&<p className="cloud-auth-message">{resendMessage}</p>}
      <button className="cloud-auth-submit" type="button" disabled={busy} onClick={resend}>{busy?'正在发送…':'重新发送验证邮件'}</button>
      <button className="cloud-auth-switch" type="button" onClick={()=>{setVerificationSent(false);setMode('login');setResendMessage('')}}>返回登录</button>
    </section> : <form className="cloud-auth-form" onSubmit={submit}>
      <div className="eyebrow">TEAM WORKSPACE</div><h2>{mode==='login'?'登录':'创建账号'}</h2>
      {mode==='signup'&&<label>姓名<input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>}
      <label>邮箱<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
      <label>密码<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'}/></label>
      {mode==='signup'&&<fieldset><legend>岗位 <span aria-hidden="true">*</span></legend><div className="cloud-job-choice"><button type="button" aria-pressed={job==='ux'} className={job==='ux'?'active':''} onClick={()=>setJob('ux')}>UX</button><button type="button" aria-pressed={job==='tester'} className={job==='tester'?'active':''} onClick={()=>setJob('tester')}>测试</button></div>{!job&&<small className="cloud-field-hint">请选择你实际所属的岗位</small>}</fieldset>}
      {error&&<p className="cloud-auth-message">{error}</p>}
      <button className="cloud-auth-submit" disabled={busy||(mode==='signup'&&!job)}>{busy?'处理中…':mode==='login'?'登录':'创建账号'}</button>
      <button className="cloud-auth-switch" type="button" onClick={()=>{setMode(mode==='login'?'signup':'login');setJob(null);setError('')}}>{mode==='login'?'首次使用？创建账号':'已有账号？返回登录'}</button>
    </form>}
  </main>;
  return <main className="role-page figma-role-page">
    <section className="role-intro">
      <div><div className="brand">seedream&nbsp; T-lab<i>.</i></div><p className="role-subtitle">模板实验室</p></div>
      <h1>Make<br/>images<br/>behave.</h1>
      <p>一个为图像模板而生的协作工作台。</p>
    </section>
    <section className="role-options">{roles.map(role=><button className="role-card" key={role.role} onClick={()=>choose(role.role)}>
      <div className="role-portrait"><img src={role.img} alt={role.title}/></div>
      <div><h2>{role.title}</h2><p>{role.desc}</p><div className="role-action"><span>以此身份进入</span><span className="role-arrow" aria-hidden="true">→</span></div></div>
    </button>)}</section>
  </main>;
}
