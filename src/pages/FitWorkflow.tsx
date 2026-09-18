import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import FitDialog from '@/components/FitDialog';
import { useAppStore } from '@/store/appStore';
import { useFitStore } from '@/store/fitStore';
import { savedFitRecords, type FitRecord } from '@/data/fitData';
import { getDefinitionReport } from '@/data/templateDefinitions';
import '@/styles/fit-workflow.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository } from '@/data/cloudRepository';
import { canEditTemplate } from '@/data/templateAccess';

export function FitMetrics({run,stage='FIT',detailsHref}:{run:FitRecord;stage?:'FIT'|'TUNE';detailsHref?:string}){
  const passed=run.status==='GO';
  return <div className="fit-report-summary">
    <header className="fit-report-heading">
      <div><span className="eyebrow">{stage} REPORT</span><div className="fit-report-title-line"><h2>{stage==='TUNE'?'调优报告':'适配报告'}</h2>{stage==='FIT'&&detailsHref&&<Link className="btn" to={detailsHref}>测试详情</Link>}</div></div>
      <div className={`fit-report-verdict ${passed?'pass':'fail'}`}><span>结论</span><strong>{passed?(stage==='TUNE'?'调优完成':'适配成功'):run.status}</strong><span className="fit-model-inline">Seedream 4.5</span></div>
    </header>
    <div className="fit-metrics"><div><span>MUST 总体通过率</span><strong>{run.must||'—'}</strong><small className={passed?'pass':'check'}>{passed?'PASS':'CHECK'}</small></div><div><span>PREFERRED 得分</span><strong>{run.report?`${run.report.summaryScores.preferred.toFixed(1)}%`:run.preferred||'—'}</strong><small className={passed?'pass':'check'}>{passed?'PASS':'CHECK'}</small></div></div>
  </div>;
}

function PageTurner({label,index,total,onPrevious,onNext}:{label:string;index:number;total:number;onPrevious:()=>void;onNext:()=>void}){
  return <div className="fit-page-turner"><button aria-label={`上一${label}`} disabled={index<=0} onClick={onPrevious}>‹</button><strong>{label}</strong><span>{total?index+1:0}/{total}</span><button aria-label={`下一${label}`} disabled={!total||index>=total-1} onClick={onNext}>›</button></div>;
}

export default function FitWorkflow({stage='FIT'}:{stage?:'FIT'|'TUNE'}){
  const {templateId=''}=useParams();const nav=useNavigate();
  const isTune=stage==='TUNE';
  const template=useAppStore(s=>s.templates.find(t=>t.id===templateId));
  const workspaceId=useAppStore(s=>s.workspace.id);
  const user=useAppStore(s=>s.currentUser);const editable=canEditTemplate(template,user?.id,user?.role);const canCreate=user?.role==='tester'&&editable;
  const local=useFitStore(s=>s.runs);const start=useFitStore(s=>s.start);
  const records=[...savedFitRecords(templateId),...local.filter(r=>r.templateId===templateId)].sort((a,b)=>(Number(a.name.replace(/\D/g,''))||0)-(Number(b.name.replace(/\D/g,''))||0));
  const [plan,setPlan]=useState(false);const [planTab,setPlanTab]=useState<'rules'|'advice'>('rules');const [active,setActive]=useState<number|null>(null);
  const [draftPromptVersions,setDraftPromptVersions]=useState<string[]>([]);
  const [draftPrompts,setDraftPrompts]=useState<Record<string,string>>({});
  const [expandedEvidence,setExpandedEvidence]=useState<Set<string>>(new Set());
  const [failureActions,setFailureActions]=useState<Record<string,'accepted'|'ignored'>>({});
  const [uxIssueDraft,setUxIssueDraft]=useState('');const [uxIssueSaved,setUxIssueSaved]=useState(false);
  const [showAllRules,setShowAllRules]=useState(false);
  const [cloudReady,setCloudReady]=useState(!cloudEnabled);
  const workflowBaseline=useRef<string|null>(null);
  const [workflowLoadError,setWorkflowLoadError]=useState('');
  const fitSpec=getDefinitionReport(templateId)!;
  const hasSpec=!!fitSpec;
  const promptVersions=Array.from(new Set([...records.map(record=>record.version),...draftPromptVersions]));
  const [activeVersion,setActiveVersion]=useState(records[0]?.version||fitSpec?.promptVersion||'');
  const runsForPrompt=records.filter(record=>record.version===activeVersion);
  const [activeRunId,setActiveRunId]=useState(runsForPrompt[0]?.id||records[0]?.id||'');
  const selectedRun=runsForPrompt.find(record=>record.id===activeRunId)||runsForPrompt[0];
  const promptIndex=Math.max(0,promptVersions.indexOf(activeVersion));
  const runIndex=Math.max(0,runsForPrompt.findIndex(record=>record.id===selectedRun?.id));
  const isDraft=draftPromptVersions.includes(activeVersion)&&!runsForPrompt.length;
  const tuneRules=selectedRun?.report?.tunePriorities||[];
  const activeMappedRules=active===null?[]:fitSpec?.promptRuleMap[active]?.ruleIds||[];
  useEffect(()=>{window.scrollTo(0,0);},[templateId]);
  useEffect(()=>{if(!promptVersions.includes(activeVersion)&&promptVersions[0])setActiveVersion(promptVersions[0]);},[activeVersion,promptVersions]);
  useEffect(()=>{setShowAllRules(false);setExpandedEvidence(new Set());setFailureActions({});setUxIssueDraft('');setUxIssueSaved(false);},[activeRunId]);
  useEffect(()=>{
    if(!cloudEnabled)return;let active=true;setCloudReady(false);workflowBaseline.current=null;setWorkflowLoadError('');
    void cloudRepository.loadSharedDocument<{draftPromptVersions:string[];draftPrompts:Record<string,string>;failureActions:Record<string,'accepted'|'ignored'>;uxIssueDraft:string;uxIssueSaved:boolean}>(workspaceId,'review',`workflow-${stage}-${templateId}`).then(data=>{
      if(!active)return;
      const loaded=data?{draftPromptVersions:data.draftPromptVersions||[],draftPrompts:data.draftPrompts||{},failureActions:data.failureActions||{},uxIssueDraft:data.uxIssueDraft||'',uxIssueSaved:!!data.uxIssueSaved}:{draftPromptVersions,draftPrompts,failureActions,uxIssueDraft,uxIssueSaved};
      workflowBaseline.current=JSON.stringify(loaded);
      if(data){setDraftPromptVersions(loaded.draftPromptVersions);setDraftPrompts(loaded.draftPrompts);setFailureActions(loaded.failureActions);setUxIssueDraft(loaded.uxIssueDraft);setUxIssueSaved(loaded.uxIssueSaved);}
      if(active)setCloudReady(true);
    }).catch(error=>{if(active)setWorkflowLoadError(`审查记录读取失败，已暂停保存：${String(error?.message||error)}`)});return()=>{active=false};
  },[stage,templateId,workspaceId]);
  useEffect(()=>{
    if(!cloudEnabled||!cloudReady||!editable||workflowBaseline.current===null)return;
    const payload={draftPromptVersions,draftPrompts,failureActions,uxIssueDraft,uxIssueSaved};const serialized=JSON.stringify(payload);
    if(workflowBaseline.current===serialized)return;
    const timer=window.setTimeout(()=>void cloudRepository.saveSharedDocument(workspaceId,'review',`workflow-${stage}-${templateId}`,payload).then(()=>{workflowBaseline.current=serialized}).catch(console.error),700);return()=>window.clearTimeout(timer);
  },[cloudReady,draftPromptVersions,draftPrompts,editable,failureActions,stage,templateId,uxIssueDraft,uxIssueSaved,workspaceId]);
  if(!template)return null;
  const begin=()=>{const prompt=draftPrompts[activeVersion]||selectedRun?.prompt;const run=start(templateId,[],'Seedream 4.5',activeVersion,prompt);nav(`/templates/${templateId}/fit/${run.id}/evidence`);};
  const selectPrompt=(version:string)=>{setActiveVersion(version);setActiveRunId(records.find(record=>record.version===version)?.id||'');};
  const createPrompt=()=>{
    const numbers=promptVersions.map(version=>Number(version)).filter(Number.isFinite);
    const next=`${(numbers.length?Math.max(...numbers):0)+.1}`.replace(/(\.\d)\d+$/,'$1');
    setDraftPromptVersions(old=>[...old,next]);
    setDraftPrompts(old=>({...old,[next]:fitSpec?.promptRuleMap.map(part=>part.sentence).join('')||''}));
    setActiveVersion(next);
    setActiveRunId('');
  };
  return <><AppHeader showNavigation={false}/><main className="page fit-page">
    {workflowLoadError&&<aside role="alert">{workflowLoadError}</aside>}
    {!records.length&&!draftPromptVersions.length?<div className="fit-empty">{canCreate?<button className="btn primary" onClick={createPrompt}>新建 Prompt</button>:<span>当前还没有可查看的测试结果。</span>}</div>:<div className="fit-workspace">
      <aside className="fit-prompt-pane">
        <div className="fit-pane-heading"><Link className="fit-template-back" to={`/templates/${templateId}`} aria-label={`返回${template.name}模板详情`}><span className="eyebrow">{isTune?'TUNE':'FIT VALIDATION'}</span><h1>{template.name}</h1></Link></div>
        <div className="fit-prompt-switch-row"><PageTurner label="Prompt" index={promptIndex} total={promptVersions.length} onPrevious={()=>selectPrompt(promptVersions[promptIndex-1])} onNext={()=>selectPrompt(promptVersions[promptIndex+1])}/><div className="fit-prompt-switch-actions">{canCreate&&<button className="fit-new-prompt" onClick={createPrompt}>＋ 新建</button>}{hasSpec&&!isDraft&&<div className="fit-prompt-map" aria-live="polite"><span>{active===null?'悬停句子查看映射':'对应 RULE'}</span>{activeMappedRules.map(id=><span className={`fit-rule-chip ${tuneRules.includes(id)?'needs-tune':''}`} key={id}>{id}</span>)}</div>}</div></div>
        <section className="fit-prompt fit-prompt-panel">
          {isDraft?<div className="fit-prompt-draft"><textarea aria-label={`Prompt v${activeVersion} 内容`} value={draftPrompts[activeVersion]||''} placeholder="输入 Prompt…" onChange={event=>setDraftPrompts(old=>({...old,[activeVersion]:event.target.value}))}/><div><span>草稿 · 测试开始后锁定</span><button className="btn primary" disabled={!draftPrompts[activeVersion]?.trim()} onClick={begin}>进入测试</button></div></div>:selectedRun?.prompt?<><p className="fit-prompt-text">{selectedRun.prompt}</p>{selectedRun.report&&<div className="fit-prompt-rules"><p className="fit-prompt-advice"><b>Prompt 调整建议</b>{selectedRun.report.recommendations[0]}</p></div>}</>:hasSpec?<><p className="fit-prompt-text">{fitSpec.promptRuleMap.map((part,i)=>{const needsTune=part.ruleIds.some(id=>tuneRules.includes(id));return <span key={i} className={`prompt-sentence ${active===i?'active':''} ${needsTune?'needs-tune':''}`} tabIndex={0} role="button" aria-label={`${part.sentence} 对应规则 ${part.ruleIds.join('、')}`} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} onClick={()=>setActive(active===i?null:i)} onKeyDown={e=>{if(e.key==='Escape')setActive(null);if(e.key==='Enter'||e.key===' '){e.preventDefault();setActive(active===i?null:i);}}}>{part.sentence}</span>})}</p>{selectedRun?.report&&<div className="fit-prompt-rules"><p className="fit-prompt-advice"><b>Prompt 调整建议</b>{selectedRun.report.recommendations[0]}</p></div>}</>:<p className="fit-source">此模板尚无已记录的 Prompt。</p>}
        </section>
      </aside>
      <section className="fit-results-pane">
        {isTune&&<div className="fit-run-tabs"><PageTurner label="测试轮次" index={runIndex} total={runsForPrompt.length} onPrevious={()=>setActiveRunId(runsForPrompt[runIndex-1].id)} onNext={()=>setActiveRunId(runsForPrompt[runIndex+1].id)}/><div className="fit-run-actions">{canCreate&&!isDraft&&<button className="fit-new-run" onClick={begin}>＋ 新一轮</button>}<button className="btn" onClick={()=>{setPlanTab('rules');setPlan(true)}}>TUNE 测试规则</button>{selectedRun&&<Link className="btn" to={`/templates/${templateId}/fit/${selectedRun.id}/evidence`}>{selectedRun.status==='PENDING'?'配置输入':'测试详情'}</Link>}</div></div>}
        {selectedRun?<div className="fit-selected-run">
          {selectedRun.status==='PENDING'?<div className="fit-empty-run"><p>本轮已建立，尚未执行或评分。</p>{!isTune&&<Link className="btn" to={`/templates/${templateId}/fit/${selectedRun.id}/evidence`}>配置输入</Link>}</div>:<FitMetrics run={selectedRun} stage={stage} detailsHref={!isTune?`/templates/${templateId}/fit/${selectedRun.id}/evidence`:undefined}/>} 
          {selectedRun.report?<>
            <section className="fit-result-section"><h3>Rule 表现 <span className="eyebrow">RULE PERFORMANCE</span><button className="fit-expand-rules" aria-expanded={showAllRules} onClick={()=>setShowAllRules(value=>!value)}>{showAllRules?'收起全部 ↑':'展开全部 ↓'}</button></h3><div className="fit-rule-performance" role="region" aria-label="全部规则评分"><table className="fit-table fit-performance-table"><thead><tr><th>RULE</th><th>类型</th><th>通过率 / 得分</th></tr></thead><tbody>{[...selectedRun.report.ruleScores].sort((a,b)=>Number(selectedRun.report?.tunePriorities.includes(b.ruleId))-Number(selectedRun.report?.tunePriorities.includes(a.ruleId))).filter(rule=>showAllRules||selectedRun.report?.tunePriorities.includes(rule.ruleId)).map(rule=>{const needsTune=selectedRun.report?.tunePriorities.includes(rule.ruleId);return <tr className={needsTune?'needs-tune':''} key={rule.ruleId}><th>{rule.ruleId}{needsTune&&<span className="fit-watch">待优化</span>}</th><td>{rule.priority}</td><td>{rule.priority==='MUST'?`${rule.scores.filter(s=>s.applicable&&s.score>=1).length}/${rule.scores.filter(s=>s.applicable).length}`:`${rule.score.toFixed(1)}%`}</td></tr>})}</tbody></table></div></section>
            <section className="fit-result-section"><h3>问题分析 <span className="eyebrow">ISSUE ANALYSIS</span></h3><div className="fit-diagnoses">{selectedRun.report.failures.map(f=>{const isExpanded=expandedEvidence.has(f.id);return <article key={f.id}><div className="eyebrow">Rule {f.relatedRules.join(' / ')}</div><div className="fit-diagnosis-title"><h4>{f.name}</h4></div><p>{f.description}</p>{user?.role==='ux'&&<div className="fit-failure-actions"><button className="btn primary" disabled={failureActions[f.id]==='accepted'} onClick={()=>setFailureActions(old=>({...old,[f.id]:'accepted'}))}>{failureActions[f.id]==='accepted'?'已采纳':'采纳'}</button><button className="btn" disabled={failureActions[f.id]==='ignored'} onClick={()=>setFailureActions(old=>({...old,[f.id]:'ignored'}))}>{failureActions[f.id]==='ignored'?'已忽略':'忽略'}</button></div>}<div className="fit-evidence-links"><button aria-expanded={isExpanded} onClick={()=>setExpandedEvidence(old=>{const next=new Set(old);next.has(f.id)?next.delete(f.id):next.add(f.id);return next})}>{isExpanded?'收起问题图片':'查看问题图片'}</button></div>{isExpanded&&<div className="fit-evidence-thumbnails">{f.evidenceCases.map(id=>{const evidence=selectedRun.inputs.find(item=>item.id===id);const image=evidence?.output||evidence?.url;return <Link key={id} to={`/templates/${templateId}/fit/${selectedRun.id}/evidence?filter=ISSUE#${encodeURIComponent(id)}`} aria-label={`打开 ${id} 测试详情`}>{image?<img src={image} alt={`${id} 问题图片`}/>:<span className="fit-image-empty">暂无图片</span>}<b>{id}</b></Link>})}</div>}</article>})}{user?.role==='ux'&&<article className="fit-ux-issue-entry"><span className="eyebrow">UX 补充问题</span><textarea value={uxIssueDraft} onChange={event=>{setUxIssueDraft(event.target.value);setUxIssueSaved(false)}} placeholder="描述你观察到的问题…" aria-label="问题描述"/><button className="btn" disabled={!uxIssueDraft.trim()} onClick={()=>setUxIssueSaved(true)}>{uxIssueSaved?'已保存':'保存问题'}</button></article>}</div></section>
          </>:selectedRun.status!=='PENDING'&&<p className="fit-source">此历史记录未提供完整规则汇总与诊断。</p>}
        </div>:<p className="fit-empty-run">这个 Prompt 暂无测试 Run。</p>}
      </section>
    </div>}
    {plan&&<FitDialog title={`${isTune?'TUNE':'FIT'} 测试规则`} onClose={()=>setPlan(false)}><div className="fit-rule-dialog-tabs" role="tablist"><button role="tab" aria-selected={planTab==='rules'} onClick={()=>setPlanTab('rules')}>规则评分表</button><button role="tab" aria-selected={planTab==='advice'} onClick={()=>setPlanTab('advice')}>选图参考</button></div>{hasSpec?(planTab==='rules'?<div className="fit-dialog-rule-groups">{(['MUST','PREFERRED'] as const).map(priority=><section key={priority}><h3>{priority}</h3><div className="fit-table-scroll"><table className="fit-table"><thead><tr><th>RULE</th><th>规则</th>{priority==='MUST'?<><th>通过</th><th>不通过</th></>:<><th>2 分</th><th>1 分</th><th>0 分</th></>}</tr></thead><tbody>{[...fitSpec.templateRules,...fitSpec.visualQualityRules].filter(rule=>rule.priority===priority).map(rule=><tr key={rule.id}><th>{rule.id}</th><td>{rule.name}</td>{priority==='MUST'?<><td>{rule.score2}<br/><span className="fit-source">基本通过：{rule.score1}</span></td><td>{rule.score0}</td></>:<><td>{rule.score2}</td><td>{rule.score1}</td><td>{rule.score0}</td></>}</tr>)}</tbody></table></div></section>)}</div>:<><p className="fit-source">{fitSpec.fitTestPlan.summary}</p><div className="fit-table-scroll"><table className="fit-table"><thead><tr><th>分层</th><th>Test ID</th><th>建议测试输入</th><th>主要挑战变量</th><th>每图运行</th></tr></thead><tbody>{fitSpec.fitTestPlan.rows.map(row=><tr key={row.testId}><td>{row.tier}</td><th>{row.testId}</th><td>{row.inputDescription}</td><td>{row.challengeVariable}</td><td>{row.runsPerInput}</td></tr>)}</tbody></table></div><p className="fit-source">这是计划建议，实际输入以本轮测试详情为准。</p></>):<p>此模板尚未配置 {isTune?'TUNE':'FIT'} 测试规则。</p>}</FitDialog>}
  </main></>;
}
