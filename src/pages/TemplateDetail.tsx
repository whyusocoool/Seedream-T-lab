import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { defineTemplate, generateImage, type GeneratedImage, type StyleSummary } from '@/data/aiProvider';
import { useAppStore } from '@/store/appStore';
import { mockData } from '@/data/mockData';
import type { StageType } from '@/types';
import { getDefineSpec, getDefinitionReport } from '@/data/templateDefinitions';
import '@/styles/template-detail.css';
import '@/styles/ai-runtime.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository, isWorkspaceRole } from '@/data/cloudRepository';
import InviteDialog from '@/components/InviteDialog';
import { canDeleteTemplate, canEditTemplate } from '@/data/templateAccess';
import { getUXStageAction } from '@/data/templateTodo';
import { cloudRead } from '@/data/cloudRead';

const labels: Record<StageType, [string, string]> = { DEFINE: ['DEFINE', '规格定义'], FIT: ['FIT', '适配验证'], UX_RULE_REVIEW: ['UX REVIEW', '规则审查'], TUNE: ['TUNE', '参数优化'], RELEASE: ['RELEASE', '发布'] };
const inputLabels: Record<string, string> = { TEXT_ONLY: '纯文本', TEXT_WITH_IMAGE: '文本＋图片', IMAGE_ONLY: '单张图片' };
const flow: StageType[] = ['DEFINE', 'FIT', 'TUNE', 'RELEASE'];
export const stageStatusLabels: Record<string, string> = { NOT_STARTED: '待办', IN_PROGRESS: '进行中', READY_FOR_HANDOFF: '待交接', COMPLETED: '完成', PASSED: '通过', FAILED: '未通过', BLOCKED: '中止', STOPPED: '中止', CONDITIONAL_PASS: '条件通过' };

const generatedStorageKey = (templateId: string) => `seedream-generated-images/${templateId}`;

const readGeneratedImages = (templateId: string): GeneratedImage[] => {
  try {
    const raw = window.localStorage.getItem(generatedStorageKey(templateId));
    return raw ? JSON.parse(raw) as GeneratedImage[] : [];
  } catch {
    return [];
  }
};

const writeGeneratedImages = (templateId: string, images: GeneratedImage[]) => {
  try {
    window.localStorage.setItem(generatedStorageKey(templateId), JSON.stringify(images.slice(0, 8)));
  } catch {
    // 图片 URL 可能很大；当前页面仍然会保留本次结果。
  }
};

export default function TemplateDetail() {
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  const navigate = useNavigate();
  const { templateId } = useParams();
  const user = useAppStore((state) => state.currentUser);
  const template = useAppStore((state) => state.templates).find((item) => item.id === templateId);
  const deleteTemplate = useAppStore((state) => state.deleteTemplate);
  const updateTemplate = useAppStore((state) => state.updateTemplate);
  const workspaceId = useAppStore((state) => state.workspace.id);
  const [showAI, setShowAI] = useState(false);
  const [showInvite,setShowInvite]=useState(false);
  const [prompt, setPrompt] = useState(template?.aiPrompt || '');
  const [styleSummary, setStyleSummary] = useState<StyleSummary | null>(template?.aiStyleSummary || null);
  const [generated, setGenerated] = useState<GeneratedImage[]>(() => (!cloudEnabled && templateId) ? readGeneratedImages(templateId) : []);
  const [aiBusy, setAiBusy] = useState<'definition' | 'generation' | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [generatedCloudReady,setGeneratedCloudReady]=useState(!cloudEnabled);
  const generatedBaseline=useRef<string|null>(null);
  const [recoveryDismissed,setRecoveryDismissed]=useState(()=>window.localStorage.getItem(`recovery-dismissed/${templateId}`)==='yes');
  const [hydratedTemplateId,setHydratedTemplateId]=useState<string>();
  useEffect(()=>{
    if(!template || hydratedTemplateId === template.id)return;
    setPrompt(template.aiPrompt || '');
    setStyleSummary(template.aiStyleSummary || null);
    setHydratedTemplateId(template.id);
  },[template,hydratedTemplateId]);
  useEffect(()=>{
    if(!cloudEnabled||!templateId)return;let active=true;setGeneratedCloudReady(false);generatedBaseline.current=null;
    void cloudRead(cloudRepository.loadSharedDocument<GeneratedImage[]>(workspaceId,'template',`generated-${templateId}`)).then(async images=>{
      if(images!==null&&!Array.isArray(images))throw new Error('生图结果记录格式异常');
      const hydrated=await cloudRead(Promise.all((images||[]).map(async image=>image.assetPath?{...image,url:await cloudRepository.imageUrl(image.assetPath),dataUrl:undefined}:image)));
      if(!active)return;
      generatedBaseline.current=JSON.stringify(hydrated);setGenerated(hydrated);setGeneratedCloudReady(true);
    }).catch(error=>{if(active)setAiError(`生图历史读取失败，已暂停保存：${String(error?.message||error)}`)});
    return()=>{active=false};
  },[templateId,workspaceId]);
  useEffect(()=>{
    if(!cloudEnabled||!generatedCloudReady||!templateId||generatedBaseline.current===null||generatedBaseline.current===JSON.stringify(generated))return;const timer=window.setTimeout(()=>void cloudRepository.saveSharedDocument(workspaceId,'template',`generated-${templateId}`,generated).then(()=>{generatedBaseline.current=JSON.stringify(generated)}).catch(console.error),700);return()=>window.clearTimeout(timer);
  },[generated,generatedCloudReady,templateId,workspaceId]);
  useEffect(()=>{
    if(!templateId || hydratedTemplateId !== templateId)return;
    const current=useAppStore.getState().templates.find(item=>item.id===templateId);
    if((current?.aiPrompt||'')===prompt&&JSON.stringify(current?.aiStyleSummary||null)===JSON.stringify(styleSummary))return;
    const timer=window.setTimeout(()=>updateTemplate(templateId,{aiPrompt:prompt,aiStyleSummary:styleSummary||undefined}),700);return()=>window.clearTimeout(timer);
  },[prompt,styleSummary,templateId,hydratedTemplateId,updateTemplate]);
  const run = mockData.runs.filter((item) => item.templateCaseId === templateId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const spec = getDefineSpec(templateId);
  const report = getDefinitionReport(templateId);
  const stages = run ? mockData.stages.filter((stage) => stage.runId === run.id) : [];
  const stageActionKey=getUXStageAction(run,stages)?.key;
  useEffect(()=>{
    if(user?.role==='ux'&&template&&stageActionKey&&template.uxSeenStageKey!==stageActionKey)updateTemplate(template.id,{uxSeenStageKey:stageActionKey,uxSeenActionKeys:[...new Set([...(template.uxSeenActionKeys||[]),stageActionKey])].slice(-100)});
  },[user?.role,template?.id,template?.uxSeenStageKey,stageActionKey,updateTemplate]);
  useEffect(()=>{
    if(template?.defineStatus==='SUCCEEDED'&&template.defineCompletedAt){setPrompt(template.aiPrompt||'');setStyleSummary(template.aiStyleSummary||null);}
  // A newly completed background DEFINE replaces the displayed draft as well.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[template?.defineCompletedAt]);
  if (!user || !template) return <><AppHeader /><main className="page"><p role="status">模板尚未载入，正在等待团队数据。若长时间未出现，请返回模板列表重试。</p><Link className="btn" to="/templates">返回模板列表</Link></main></>;
  const editable=canEditTemplate(template,user.id,user.role);

  const member = (id?: string) => mockData.workspace.members.find((item) => item.id === id);
  const ux = member(run?.uxAssigneeId) || member(template.ownerId);
  const hasEnteredFit = stages.some((stage) => stage.type === 'FIT');
  const tester = hasEnteredFit ? (member(run?.testerAssigneeId) || mockData.workspace.members.find((person) => person.role === 'tester')) : undefined;
  const route = (type: StageType) => type === 'DEFINE' || type === 'UX_RULE_REVIEW' ? `/templates/${templateId}/define` : type === 'FIT' ? `/templates/${templateId}/fit` : `/templates/${templateId}/stages/${type.toLowerCase()}`;
  const references = template.referenceImages?.length
    ? template.referenceImages
    : spec?.references.map((image) => image.url) || [];
  const gallery = references.length ? references : template.coverImageUrl ? [template.coverImageUrl] : [];
  const inputType = report ? '单张图片' : inputLabels[template.runtimeInputType] || template.runtimeInputType;
  const inputTiers = report ? [
    { code: 'P0', title: '优势输入', items: report.initialApplicability.p0Advantage },
    { code: 'P1', title: '支持输入', items: report.initialApplicability.p1Supported },
    { code: 'P2', title: '边界 / 不推荐', items: report.initialApplicability.p2BoundaryNotRecommended },
  ] : [];

  const rerunDefinition = async () => {
    if (gallery.length < 3 || gallery.length > 6) {
      setAiError('重新运行 DEFINE 需要 3–6 张参考图。请先补齐参考图后再试。');
      return;
    }
    if(template.defineStatus==='ANALYZING'&&template.defineJobId)return;
    setAiBusy('definition');
    updateTemplate(template.id,{defineStatus:'ANALYZING',defineError:undefined,defineDiagnostics:undefined,defineJobId:undefined,defineProgress:undefined,defineRequestedAt:new Date().toISOString()});
    setAiError('');
    setAiMessage('');
    try {
      const result = await defineTemplate(gallery, {
        templateId:template.id,
        templateName: template.name,
        usageScenario: template.usageScenario,
        runtimeInput: inputLabels[template.runtimeInputType] || template.runtimeInputType,
      });
      updateTemplate(template.id,{defineJobId:result.jobId});
      setAiMessage('DEFINE 已在后台启动，可以离开此页面。');
      setShowAI(false);
    } catch (reason: unknown) {
      const message=reason instanceof Error?reason.message:reason&&typeof reason==='object'&&'message' in reason?String(reason.message):'未知错误';
      updateTemplate(template.id,{defineStatus:'FAILED',defineError:message});
      setAiError(`DEFINE 未完成：${message}`);
    } finally {
      setAiBusy(null);
    }
  };

  const generate = async () => {
    if (!prompt.trim()) {
      setAiError('请先填写 Prompt，或点击「总结风格」。');
      return;
    }
    setAiBusy('generation');
    setAiError('');
    setAiMessage('');
    try {
      const result = await generateImage(prompt.trim(), gallery[0]);
      const durableImages=cloudEnabled&&isWorkspaceRole(user.role)?await Promise.all(result.images.map(async(image,index)=>{
        const source=image.dataUrl||image.url;if(!source)return image;
        const response=await fetch(source);if(!response.ok)throw new Error('生成图片转存失败');
        const blob=await response.blob();const file=new File([blob],`generated-${Date.now()}-${index}.${blob.type.split('/')[1]||'png'}`,{type:blob.type||'image/png'});
        const uploaded=await cloudRepository.uploadImage(workspaceId,user.role as 'ux'|'tester',file);
        return {...image,url:uploaded.url,dataUrl:undefined,assetPath:uploaded.path};
      })):result.images;
      const next = [...durableImages, ...generated].slice(0, 8);
      setGenerated(next);
      if (!cloudEnabled) writeGeneratedImages(template.id, next);
      setAiMessage(`已生成 ${result.images.length} 张图片（${result.model}）。`);
    } catch (reason: unknown) {
      setAiError(reason instanceof Error ? reason.message : '生图失败，请检查 AI 设置。');
    } finally {
      setAiBusy(null);
    }
  };

  return <><AppHeader showNavigation={false}/><main className="page template-detail-page">
    {template.recoveryNote&&!recoveryDismissed&&<aside role="status" style={{padding:12,background:'#fff4df',marginBottom:16,display:'flex',gap:12,alignItems:'center'}}><span style={{flex:1}}>{template.recoveryNote} <Link to="/recovery">核对并恢复参考图</Link></span><button type="button" aria-label="关闭恢复提示" onClick={()=>{setRecoveryDismissed(true);window.localStorage.setItem(`recovery-dismissed/${templateId}`,'yes')}}>×</button></aside>}
    <section className="template-detail-layout">
      <aside className="template-detail-sidebar">
        <div>
          <div className="eyebrow"><span className="dot"/>{template.alias || template.name}</div>
          <div className="template-detail-title"><h1>{template.name}</h1><div className="template-detail-title-actions">{editable&&<button className="btn" type="button" onClick={() => { setShowAI(true); setAiError(''); setAiMessage(''); }}>AI 运行</button>}<Link className="btn primary" to={`/templates/${templateId}/rules`}>RULES</Link></div></div>
          <p>{spec?.templateDescription || template.usageScenario}</p>
          {template.defineStatus==='ANALYZING'&&<Link className="template-define-notice" to={`/templates/${template.id}/define`}>DEFINE 正在后台分析 · 点击查看步骤，可以随时离开</Link>}
          {template.defineStatus==='FAILED'&&<Link className="template-define-notice failed" to={`/templates/${template.id}/define`}>DEFINE 分析失败 · 查看步骤与完整返回</Link>}
        </div>
        <dl className="template-detail-description"><dt>使用场景</dt><dd>{spec?.usageScenario || template.usageScenario}</dd></dl>
        <div className="team template-detail-team" id="team">
          {(template.team?.length?template.team.map(person=>({person,role:person.role==='ux'?'UX':'TEST'})):[{ person: ux, role: 'UX' }, { person: tester, role: 'TEST' }]).map(({ person, role }) => person && <div className="person" key={`${role}-${'profileId' in person?person.profileId:person.id}`}><img className="avatar" src={person.avatarUrl||(role==='UX'?'/images/avatar-ux-cat.png':'/images/avatar-tester.png')} alt=""/><span><b>{person.name}</b><br/><span className="eyebrow">{role}</span></span></div>)}
          {user.role==='ux'&&<button className="btn" type="button" onClick={() => setShowInvite(true)}>＋ 邀请</button>}
        </div>
        <div className="template-detail-footer">
          <section className="detail-input-summary" tabIndex={0} aria-label={`输入类型 ${inputType}，悬停或聚焦查看适用输入`}>
            <div className="detail-input-type"><span>输入类型</span><span>{inputType}</span></div>
            <div className="detail-input-tiers">{inputTiers.map((tier) => <article key={tier.code}><header><span className="eyebrow">{tier.code}</span><b>{tier.title}</b></header>{tier.items.map((item,index) => {const text=typeof item==='string'?item:item.description;return <p key={`${index}-${text}`}>{text}</p>})}</article>)}</div>
          </section>
          {canDeleteTemplate(template,user.id) && <button className="template-delete" type="button" onClick={() => {
            if (!templateId || !window.confirm(`确定删除模板“${template.name}”吗？删除后将无法从模板总览中打开。`)) return;
            deleteTemplate(templateId);
            navigate('/templates', { replace: true });
          }}>删除模板</button>}
        </div>
      </aside>
      <div className="template-detail-right">
        <div className="template-detail-gallery" aria-label="模板参考图，可左右滚动" tabIndex={0}
          onPointerDown={(event) => { if (event.button !== 0) return; drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (drag.current) event.currentTarget.scrollLeft = drag.current.scroll - (event.clientX - drag.current.x); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? 180 : -180, behavior: 'smooth' }); } }}>
          {gallery.map((src, index) => <figure key={`${src}-${index}`}><img draggable={false} src={src} alt={`${template.name}参考图 ${index + 1}`}/></figure>)}
          {!gallery.length && <p className="empty-state">暂无参考图片</p>}
        </div>
        <section className="template-detail-workflow" aria-label="验证流程">
          <div className="flow-heading"><span className="eyebrow">验证流程</span><span>{run?.runNumber || '尚未开始'}</span></div>
          <div className="detail-flow-list">{flow.map((type, index) => {
            const stage = stages.find((item) => item.type === type);
            const visited = !!stage && stage.status !== 'NOT_STARTED';
            const review = type === 'FIT' ? stages.find((item) => item.type === 'UX_RULE_REVIEW') : undefined;
            const content = <><span className="eyebrow">{String(index + 1).padStart(2, '0')}</span><span className="flow-name"><b>{labels[type][0]}</b><small>{labels[type][1]}{review?.status === 'IN_PROGRESS' ? ' · 规则审查中' : ''}</small></span><span className={`flow-status status-${stage?.status || 'NOT_STARTED'}`}>{stageStatusLabels[stage?.status || 'NOT_STARTED'] || stage?.status}</span></>;
            return visited || type === 'FIT' || type === 'DEFINE' ? <Link className="detail-flow-row" key={type} to={route(type)}>{content}</Link> : <div className="detail-flow-row pending" key={type} aria-disabled="true">{content}</div>;
          })}</div>
        </section>
      </div>
    </section>

    {showAI && <div className="ai-runtime-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAI(false); }}>
      <section className="ai-runtime-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-runtime-title">
        <header className="ai-runtime-header"><div><span className="eyebrow">REAL MULTIMODAL RUNTIME</span><h2 id="ai-runtime-title">AI 总结与生图</h2><p>{template.name} · 只通过本机代理调用你选择的模型</p></div><button type="button" className="ai-runtime-close" onClick={() => setShowAI(false)} aria-label="关闭 AI 运行">×</button></header>
        <div className="ai-runtime-source"><div className="ai-runtime-source-head"><b>参考图</b><span>{gallery.length} 张 · 第一张会作为生图视觉输入</span></div><div className="ai-runtime-thumbs">{gallery.map((src, index) => <img key={`${src}-${index}`} src={src} alt={`参考图 ${index + 1}`}/>)}</div></div>
        <div className="ai-runtime-actions"><button className="btn" type="button" disabled={aiBusy !== null || (template.defineStatus==='ANALYZING'&&!!template.defineJobId) || gallery.length < 3 || gallery.length > 6} onClick={() => { void rerunDefinition(); }}>{aiBusy === 'definition' ? '正在提交后台任务' : template.defineStatus==='ANALYZING'&&template.defineJobId?'DEFINE 后台分析中':'重新运行 DEFINE'}</button><span>按 Template Spec v2.1 预检查后生成报告，启动后可离开</span></div>
        {aiBusy==='definition'&&<p role="status">正在准备图片并提交后台任务…提交完成后无需等待模型返回。</p>}
        {styleSummary && <section className="ai-runtime-summary"><span className="eyebrow">STYLE SUMMARY · {styleSummary.stableFeatures.length} STABLE FEATURES</span><h3>{styleSummary.title}</h3><p>{styleSummary.visualSummary}</p><div className="ai-runtime-tags">{styleSummary.stableFeatures.map((feature) => <span key={feature.name}>{feature.name}</span>)}</div></section>}
        <label className="ai-runtime-prompt"><span>生成 Prompt</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="点击「总结风格」自动生成，也可以手动修改…"/></label>
        {aiError && <p className="ai-inline-error" role="alert">{aiError}</p>}{aiMessage && <p className="ai-inline-success" role="status">{aiMessage}</p>}
        <div className="ai-runtime-actions ai-runtime-generate"><button className="btn primary" type="button" disabled={aiBusy !== null || !prompt.trim()} onClick={() => { void generate(); }}>{aiBusy === 'generation' ? '生成中…' : '生成图片 →'}</button><span>结果只保存在当前浏览器的本地缓存中</span></div>
        {!!generated.length && <div className="ai-runtime-results">{generated.map((image, index) => { const src = image.dataUrl || image.url; return src ? <figure key={`${src}-${index}`}><img src={src} alt={`AI 生成结果 ${index + 1}`}/><figcaption className="eyebrow">OUTPUT {String(index + 1).padStart(2, '0')}</figcaption></figure> : null; })}</div>}
      </section>
    </div>}
  </main>{showInvite&&<InviteDialog template={template} onClose={()=>setShowInvite(false)}/>}</>;
}
