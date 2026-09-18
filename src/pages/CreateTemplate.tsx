import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import AppHeader from '@/components/AppHeader';
import { defineTemplate, fetchAIProviderSettings } from '@/data/aiProvider';
import AISettingsDialog from '@/components/AISettingsDialog';
import '@/styles/create-template.css';
import '@/styles/ai-runtime.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository, isWorkspaceRole, type Job } from '@/data/cloudRepository';

interface LocationState {
  assets?: Array<{url:string;assetPath?:string}>;
}

export default function CreateTemplate() {
  const nav = useNavigate();
  const location = useLocation();
  const user = useAppStore((state) => state.currentUser);
  const create = useAppStore((state) => state.createTemplate);
  const incomingAssets = (location.state as LocationState | null)?.assets || [];
  const incoming = incomingAssets.map(item=>item.url);
  const [references, setReferences] = useState<string[]>(incoming);
  const [referencePaths, setReferencePaths] = useState<Array<string|undefined>>(incomingAssets.map(item=>item.assetPath));
  const [data, setData] = useState({ name: '', usageScenario: '', inputType: 'TEXT_ONLY' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const target = useRef<number | null>(null);

  const refreshAI=()=>void fetchAIProviderSettings().then(settings=>setAiConfigured(Boolean(settings.configured))).catch(()=>setAiConfigured(false));
  useEffect(()=>{refreshAI()},[]);

  const choose = (index: number | null) => {
    target.current = index;
    if (fileInput.current) {
      fileInput.current.multiple = index === null;
      fileInput.current.click();
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const index = target.current;
    const selected = Array.from(files);
    if (selected.some((file) => !file.type.startsWith('image/') || file.size > 20 * 1024 * 1024)) {
      setErrors((current) => ({ ...current, references: '请选择图片文件，每张不超过 20 MB' }));
      return;
    }
    if (index === null && references.length + selected.length > 6) {
      setErrors((current) => ({ ...current, references: '最多上传 6 张参考图，请减少本次选择的数量' }));
      return;
    }
    setBusy(true);
    try {
      const uploaded=cloudEnabled&&user&&isWorkspaceRole(user.role)
        ?await Promise.all(selected.map(file=>cloudRepository.uploadImage(useAppStore.getState().workspace.id,user.role as Job,file)))
        :null;
      const urls = uploaded?.map(item=>item.url) || await Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取失败'));
        reader.onload = () => {
          const url = String(reader.result);
          const image = new Image();
          image.onload = () => resolve(url);
          image.onerror = () => reject(new Error('无法解码'));
          image.src = url;
        };
        reader.readAsDataURL(file);
      })));
      setReferences((previous) => index === null ? [...previous, ...urls] : previous.map((url, i) => i === index ? urls[0] : url));
      setReferencePaths((previous)=>index===null?[...previous,...(uploaded?.map(item=>item.path)||selected.map(()=>undefined))]:previous.map((path,i)=>i===index?uploaded?.[0].path:path));
      setAiError('');
      setErrors((current) => ({ ...current, references: '' }));
    } catch {
      setErrors((current) => ({ ...current, references: '图片无法读取，请选择浏览器支持的图片格式' }));
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const startCreation = () => {
    if (busy) return;
    if(!aiConfigured){setSettingsOpen(true);return}
    const formData=formRef.current?new FormData(formRef.current):null;
    const submittedName=String(formData?.get('templateName')||data.name).trim();
    const submittedScenario=String(formData?.get('usageScenario')||data.usageScenario).trim();
    const nextErrors: Record<string, string> = {};
    if (!submittedName) nextErrors.name = '请输入模板名称';
    if (!submittedScenario) nextErrors.usageScenario = '请输入使用场景';
    if (references.length < 3 || references.length > 6) nextErrors.references = '请上传 3–6 张参考图片';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const template = create({
      ...data,
      name: submittedName,
      usageScenario: submittedScenario,
      description: submittedScenario,
      references,
      referencePaths: referencePaths.filter((path):path is string=>!!path),
      coverReferenceIndex: 0,
      defineStatus: 'ANALYZING',
      defineRequestedAt:new Date().toISOString(),
    });
    nav('/templates');

    const inputLabels:Record<string,string>={TEXT_ONLY:'纯文本',TEXT_WITH_IMAGE:'文本＋图片',IMAGE_ONLY:'单张图片'};
    void (async()=>{
      // Save the draft before submitting the model job, not after the model returns.
      if(cloudEnabled)await cloudRepository.saveSharedDocument(template.workspaceId,'template','catalog-v1',useAppStore.getState().templates);
      return defineTemplate(references,{templateId:template.id,templateName:submittedName,usageScenario:submittedScenario,runtimeInput:inputLabels[data.inputType]||data.inputType});
    })().then(result=>{
      useAppStore.getState().updateTemplate(template.id,{defineJobId:result.jobId});
    }).catch((reason:unknown)=>{
      const message=reason instanceof Error?reason.message:'模板规则分析失败，请检查 AI 设置或稍后重试。';
      useAppStore.getState().updateTemplate(template.id,{defineStatus:'FAILED',defineError:message});
    });
  };

  return <><AppHeader showNavigation={false}/><main className="create-layout figma-create-layout">
    <aside className="reference-panel">
      <div className="reference-heading"><div className="field-label">参考图 *</div><h2>上传 3–6 张参考图片</h2></div>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { void upload(event.target.files); event.target.value = ''; }}/>
      <div className="reference-slots">{Array.from({ length: Math.max(3, references.length + (references.length < 6 ? 1 : 0)) }, (_, i) => <div className="reference-slot" key={i}>
        <button type="button" disabled={busy} className="reference-upload" aria-label={references[i] ? `替换参考图 ${i + 1}` : `上传参考图 ${i + 1}`} onClick={() => choose(references[i] ? i : null)}>{references[i] ? <img src={references[i]} alt={`参考图 ${i + 1}`}/> : <span>＋ 上传图片</span>}</button>
        {references[i] && <button type="button" className="reference-remove" disabled={busy} aria-label={`删除参考图 ${i + 1}`} onClick={() => { setReferences((previous) => previous.filter((_, n) => n !== i)); setReferencePaths(previous=>previous.filter((_,n)=>n!==i)); setErrors(current=>({...current,references:''})); }}>×</button>}
      </div>)}</div>
      <p className={`reference-feedback ${errors.references||(references.length>0&&references.length<3)?'error':''}`} aria-live="polite">{busy ? '正在读取图片…' : errors.references || (references.length>0&&references.length<3 ? `图片过少：已选择 ${references.length} 张，还需至少 ${3-references.length} 张` : references.length ? `已选择 ${references.length} 张 · 点击图片可替换` : '点击灰色区域上传图片，支持多选')}</p>
      {aiError && <p className="ai-inline-error" role="alert">{aiError}</p>}
      <button className="btn back-btn" type="button" onClick={() => nav(incoming.length ? '/canvas' : '/templates')}>← 返回</button>
    </aside>
    <form ref={formRef} className="create-form" onSubmit={(event)=>{event.preventDefault();startCreation();}} noValidate>
      <label className="field"><span>模板名称 *</span><input name="templateName" required aria-invalid={!!errors.name} value={data.name} placeholder="例如：手帐贴纸" onChange={(event) => setData({ ...data, name: event.target.value })}/>{errors.name && <em role="alert">{errors.name}</em>}</label>
      <label className="field field-tall"><span>使用场景 *</span><textarea name="usageScenario" required aria-invalid={!!errors.usageScenario} value={data.usageScenario} placeholder="如典型用户、使用情境等" onChange={(event) => setData({ ...data, usageScenario: event.target.value })}/>{errors.usageScenario && <em role="alert">{errors.usageScenario}</em>}</label>
      <div className="field input-type"><span>输入类型 *</span><div className="segmented" role="group" aria-label="输入类型">{[['TEXT_ONLY', '纯文本'], ['TEXT_WITH_IMAGE', '文本＋图片'], ['IMAGE_ONLY', '纯图片']].map(([value, label]) => <button type="button" key={value} aria-pressed={data.inputType === value} className={data.inputType === value ? 'active' : ''} onClick={() => setData({ ...data, inputType: value })}>{label}</button>)}</div></div>
      <div className="form-actions"><button type="button" className="btn" onClick={() => nav('/templates')}>取消</button><button type="button" onClick={startCreation} disabled={busy} className={`btn primary ${!aiConfigured?'needs-ai':''}`}>{!aiConfigured?'请配置 AI':'创建并后台分析'}</button></div>
    </form>
    <AISettingsDialog open={settingsOpen} onClose={()=>{setSettingsOpen(false);refreshAI()}}/>
  </main></>;
}
