import { useEffect, useState } from 'react';
import type { TemplateCase } from '@/types';
import '@/styles/definition-progress.css';

const steps=['检查参考图一致性','核验 Criteria 收敛度与有效 Rules','编写 Prompt、评分卡与 DEFINE 报告','校验 JSON、29 项遍历与 Rules–Prompt 映射','报告完成，等待 UX 审阅'];
export default function DefinitionProgress({template}:{template:TemplateCase}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const progress=template.defineProgress;
  const running=template.defineStatus==='ANALYZING';
  const end=running?now:Date.parse(progress?.updatedAt||'');
  const seconds=progress?Math.max(0,Math.floor((end-Date.parse(progress.startedAt))/1000)):0;
  const completed=new Set(progress?.history.map(h=>h.phase));
  const phaseSeconds=progress?Math.max(0,Math.floor((end-Date.parse(progress.updatedAt))/1000)):0;
  return <section className="definition-progress" aria-label="DEFINE 后台任务步骤">
    <header><div><span className="eyebrow">DEFINE · SPEC V2.1</span><h2>{running?'后台分析中':template.defineStatus==='FAILED'?'分析未完成':'分析已完成'}</h2></div>{running&&<span className="definition-spinner" aria-label="分析中"/>}</header>
    <p>无需停留在此页面。任务由本地服务执行；可离开或关闭浏览器，本地服务需保持运行。</p>
    {progress?<><p aria-live="polite">当前：{progress.phase} · 总用时 {Math.floor(seconds/60)} 分 {seconds%60} 秒{running?` · 当前阶段 ${phaseSeconds} 秒`:''}</p>
      <ol>{steps.map(step=>{const current=running&&progress.phase===step;const failed=progress.failedPhase===step;const done=completed.has(step)&&!current&&!failed;return <li className={failed?'failed':current?'current':done?'done':''} key={step}><span>{failed?'×':done?'✓':current?'●':'○'}</span>{step}{failed?' · 失败':current?' · 当前':done?' · 已完成':''}</li>})}</ol>
      {progress.failedPhase&&<p>失败所在步骤：{progress.failedPhase}</p>}
      {progress.phase==='修复报告结构（一次）'&&<p>首次结构校验未通过，正在进行一次修复。</p>}
      {running&&<small>模型返回速度不确定，无法保证剩余时间。每次模型请求最长等待 3 分钟；结构异常时最多再修复一次。超过限制会显示失败原因，不会一直显示即将完成。</small>}
      <details><summary>查看步骤时间记录</summary>{progress.history.map((entry,index)=><p key={index}>{new Date(entry.at).toLocaleTimeString()} · {entry.phase}</p>)}</details>
    </>:<p>{template.defineRequestedAt?(running?'正在准备图片并提交后台任务…':'后台任务未能启动，原因见下方。'):'这轮旧任务没有服务端步骤记录，无法判断卡点或恢复结果。请返回模板页重新运行 DEFINE。'}</p>}
    {template.defineError&&<pre className="definition-error" role="alert">{template.defineError}</pre>}
    {template.defineDiagnostics?.map((output,index)=><details key={index}><summary>{output.stage} · 查看完整模型返回</summary><pre className="definition-error">{output.text||'（空响应）'}</pre></details>)}
  </section>;
}
