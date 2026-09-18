import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppHeader from '@/components/AppHeader';
import { useAppStore } from '@/store/appStore';
import { getDefineSpec, getDefinitionReport } from '@/data/templateDefinitions';
import '@/styles/template-rules.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository } from '@/data/cloudRepository';
import type { TemplateDefinitionReport } from '@/types';

export default function TemplateRules(){
  const {templateId}=useParams();
  const [activePromptPart,setActivePromptPart]=useState<number|null>(null);
  const [copyStatus,setCopyStatus]=useState<'idle'|'copied'|'failed'>('idle');
  const template=useAppStore(s=>s.templates.find(t=>t.id===templateId));
  const updateTemplate=useAppStore(s=>s.updateTemplate);
  const workspaceId=useAppStore(s=>s.workspace.id);
  const [definitionLoading,setDefinitionLoading]=useState(false);
  const report=getDefinitionReport(templateId);const spec=getDefineSpec(templateId);
  useEffect(()=>{
    setCopyStatus('idle');
  },[templateId,report?.seedreamPrompt]);
  useEffect(()=>{
    if(copyStatus==='idle')return;
    const timer=window.setTimeout(()=>setCopyStatus('idle'),2500);
    return()=>window.clearTimeout(timer);
  },[copyStatus]);
  const copyPrompt=async()=>{
    if(!report)return;
    try{
      await navigator.clipboard.writeText(report.seedreamPrompt);
      setCopyStatus('copied');
    }catch{
      setCopyStatus('failed');
    }
  };
  useEffect(()=>{
    if(!cloudEnabled||!templateId||template?.aiDefinition)return;
    let active=true;
    setDefinitionLoading(true);
    void cloudRepository.loadSharedDocument<TemplateDefinitionReport>(workspaceId,'rules',`definition-${templateId}`)
      .then(definition=>{if(active&&definition)updateTemplate(templateId,{aiDefinition:definition})})
      .catch(error=>console.error('[cloud] DEFINE 报告读取失败',error))
      .finally(()=>{if(active)setDefinitionLoading(false)});
    return()=>{active=false};
  },[template?.aiDefinition,templateId,updateTemplate,workspaceId]);
  if(!template)return null;
  const sections=report?[{id:'template-rules',title:'模板规则',english:'TEMPLATE RULES',rules:report.templateRules},{id:'visual-rules',title:'视觉品质规则',english:'VISUAL QUALITY RULES',rules:report.visualQualityRules}]:[];
  const activeRuleIds=activePromptPart===null?[]:report?.promptRuleMap[activePromptPart]?.ruleIds??[];
  return <><AppHeader showNavigation={false}/><main className="page rules-page">
    {report?<div className="rules-split">
      <aside className="rules-prompt-pane">
        <div className="rules-pane-heading"><Link className="rules-template-back" to={`/templates/${templateId}`} aria-label={`返回${template.name}模板主页`}><span className="eyebrow">RULE BOOK</span><h1>{template.name}</h1></Link></div>
        <section className="rules-initial-prompt">
          <div className="rules-prompt-heading"><h2>初始 Prompt <small>v{report.promptVersion}</small></h2><div className="rules-prompt-heading-actions"><div className="rules-prompt-map" aria-live="polite"><span>{activePromptPart===null?'悬停句子查看映射':'对应 RULE'}</span>{activeRuleIds.map(id=><span className="rules-rule-chip" key={id}>{id}</span>)}</div><button className={`btn rules-copy-prompt ${copyStatus==='failed'?'error':''}`} type="button" onClick={()=>{void copyPrompt()}} aria-label="复制完整初始 Prompt" aria-live="polite">{copyStatus==='copied'?'已复制':copyStatus==='failed'?'复制失败，请重试':'复制'}</button></div></div>
          <p>{report.promptRuleMap.map((part,index)=><span key={part.sentence} className={`rules-prompt-sentence ${activePromptPart===index?'active':''}`} tabIndex={0} role="button" aria-label={`${part.sentence} 对应规则 ${part.ruleIds.join('、')}`} onMouseEnter={()=>setActivePromptPart(index)} onMouseLeave={()=>setActivePromptPart(null)} onFocus={()=>setActivePromptPart(index)} onBlur={()=>setActivePromptPart(null)} onClick={()=>setActivePromptPart(activePromptPart===index?null:index)} onKeyDown={event=>{if(event.key==='Escape')setActivePromptPart(null);if(event.key==='Enter'||event.key===' '){event.preventDefault();setActivePromptPart(activePromptPart===index?null:index)}}}>{part.sentence}</span>)}</p>
        </section>
      </aside>
      <div className="rules-content-pane">
        {sections.filter(section=>section.rules.length>0).map(section=><section id={section.id} className="rules-section" key={section.id}><h2>{section.title}<small>{section.english}</small></h2><div className="quality-rule-grid">{section.rules.map(rule=><article className={`quality-rule ${activeRuleIds.includes(rule.id)?'mapped':''}`} key={rule.id} tabIndex={0}><header><span className="eyebrow">{rule.id}</span><h3>{rule.name}</h3><span className={`rule-level ${rule.priority==='MUST'?'must':''}`}>{rule.priority}</span></header><p>{rule.text}</p><div className="quality-rule-score" aria-label={`${rule.name}评分标准`}><strong>规则评分</strong>{rule.priority==='MUST'?<><div><b>通过</b><span>{rule.score2}</span></div><div><b>不通过</b><span>{rule.score0}</span></div></>:<><div><b>2 分</b><span>{rule.score2}</span></div><div><b>1 分</b><span>{rule.score1}</span></div><div><b>0 分</b><span>{rule.score0}</span></div></>}</div></article>)}</div></section>)}
      </div>
    </div>:<section className="rules-section"><h2>{template.name} · 模板规则</h2>{definitionLoading?<p className="rules-source-note">正在读取 DEFINE 报告与 Rules…</p>:spec?.rules.length?<div className="quality-rule-grid">{spec.rules.map(rule=><article className="quality-rule" key={rule.id}><header><span className="eyebrow">{rule.code}</span><span className={`rule-level ${rule.severity==='MUST'?'must':''}`}>{rule.severity}</span></header><p>{rule.content}</p></article>)}</div>:<p className="rules-source-note">尚未提供「{template.name}」的定义报告，暂无规则、支持输入说明和评分标准。请返回模板页重新运行 DEFINE。</p>}</section>}
  </main></>;
}
