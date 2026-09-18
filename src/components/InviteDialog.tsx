import { useEffect, useState } from 'react';
import { cloudRepository,type CloudColleague } from '@/data/cloudRepository';
import { useAppStore } from '@/store/appStore';
import type { TemplateCase } from '@/types';

const errorText=(reason:unknown)=>reason&&typeof reason==='object'&&'message' in reason?String(reason.message):'搜索失败，请重试';

export default function InviteDialog({template,onClose}:{template:TemplateCase;onClose:()=>void}){
  const user=useAppStore(state=>state.currentUser)!;
  const workspaceId=useAppStore(state=>state.workspace.id);
  const updateTemplate=useAppStore(state=>state.updateTemplate);
  const [query,setQuery]=useState('');const [results,setResults]=useState<CloudColleague[]>([]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    setResults([]);setError('');
    if(query.trim().length<2){setBusy(false);return;}
    setBusy(true);
    const timer=window.setTimeout(()=>{
      void cloudRepository.searchColleagues(workspaceId,query)
        .then(people=>{if(active)setResults(people.filter(person=>person.id!==user.id));})
        .catch(reason=>{if(active)setError(errorText(reason));})
        .finally(()=>{if(active)setBusy(false);});
    },350);
    return()=>{active=false;window.clearTimeout(timer);};
  },[query,workspaceId,user.id]);
  const invite=(person:CloudColleague)=>{
    if(user.role!=='ux')return;
    const existing=template.invitations||[];
    if(existing.some(item=>item.profileId===person.id))return;
    updateTemplate(template.id,{collaborators:Array.from(new Set([...template.collaborators,person.id])),team:[...(template.team||[]).filter(item=>item.profileId!==person.id),{profileId:person.id,name:person.name,role:person.jobs.includes('tester')?'tester':'ux',avatarUrl:person.avatarUrl}],invitations:[...existing,{profileId:person.id,name:person.name,email:person.email,status:'ACCEPTED',invitedBy:user.id,invitedAt:new Date().toISOString()}]});
  };
  const invited=new Set((template.invitations||[]).map(item=>item.profileId));
  return <div className="invite-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
    <header><div><span className="eyebrow">TEAM INVITATION</span><h2 id="invite-title">邀请协作者</h2><p>邀请后立即加入「{template.name}」，无需对方确认。</p></div><button onClick={onClose} aria-label="关闭">×</button></header>
    <label><span>姓名或邮箱</span><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="至少输入 2 个字符"/></label>
    <div className="invite-results" aria-live="polite">{busy&&<p>搜索中…</p>}{error&&<p className="invite-error">{error}</p>}{!busy&&query.trim().length>=2&&!results.length&&!error&&<p>当前工作区没有匹配的同事。请尝试对方注册时使用的完整邮箱，并确认对方已验证邮箱、登录并选择岗位。</p>}{results.map(person=><article key={person.id}><div><div className="invite-person-heading"><b>{person.name}</b>{person.jobs.map(job=><small className="invite-job-tag" key={job}>{job==='tester'?'测试':'UX'}</small>)}</div><span>{person.email}</span></div><button className="btn" disabled={invited.has(person.id)} onClick={()=>invite(person)}>{invited.has(person.id)?'已邀请':'邀请'}</button></article>)}</div>
  </section></div>;
}
