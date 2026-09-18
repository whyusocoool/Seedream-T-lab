import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import FitDialog from '@/components/FitDialog';
import { savedFitRecords } from '@/data/fitData';
import { getDefinitionReport } from '@/data/templateDefinitions';
import { useAppStore } from '@/store/appStore';
import { useFitStore } from '@/store/fitStore';
import '@/styles/fit-workflow.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository, isWorkspaceRole, type Job } from '@/data/cloudRepository';
import { canEditTemplate } from '@/data/templateAccess';

export default function FitEvidence(){
  const {templateId='',runId}=useParams();const location=useLocation();
  const user=useAppStore(s=>s.currentUser);const definition=getDefinitionReport(templateId);
  const template=useAppStore(s=>s.templates.find(item=>item.id===templateId));const editable=canEditTemplate(template,user?.id,user?.role);
  const workspaceId=useAppStore(s=>s.workspace.id);
  const ruleNames=Object.fromEntries([...(definition?.templateRules||[]),...(definition?.visualQualityRules||[])].map(rule=>[rule.id,rule.name]));
  const local=useFitStore(s=>s.runs);const add=useFitStore(s=>s.addInputs);
  const run=[...local.filter(r=>r.templateId===templateId),...savedFitRecords(templateId)].find(r=>r.id===runId);
  const requestedFilter=new URLSearchParams(location.search).get('filter');
  const [filter,setFilter]=useState(requestedFilter==='ISSUE'?'ISSUE':'ALL');const [preview,setPreview]=useState<{src:string;name:string}|null>(null);
  const [uxReviewNotes,setUxReviewNotes]=useState<Record<string,string>>({});
  const [savedUxReviewNotes,setSavedUxReviewNotes]=useState<Record<string,boolean>>({});
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(requestedFilter==='ISSUE')setFilter('ISSUE');},[requestedFilter]);
  useEffect(()=>{if(!cloudEnabled||!runId)return;void cloudRepository.loadSharedDocument<Record<string,string>>(workspaceId,'review',`evidence-${runId}`).then(notes=>{if(notes)setUxReviewNotes(notes)}).catch(console.error)},[runId,workspaceId]);
  useEffect(()=>{if(location.hash)document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({block:'start'});else window.scrollTo(0,0);},[location.hash,runId]);
  const upload=async(files:FileList|null)=>{
    if(!files?.length||!run)return;const list=Array.from(files);setError('');
    if(list.some(f=>!f.type.startsWith('image/')||f.size>20*1024*1024)){setError('请选择图片文件，每张不超过 20 MB。');return;}
    setBusy(true);try{
      if(!editable)throw new Error('你没有此模板的编辑权限');
      const uploaded=cloudEnabled&&user&&isWorkspaceRole(user.role)
        ?await Promise.all(list.map(file=>cloudRepository.uploadImage(workspaceId,user.role as Job,file)))
        :await Promise.all(list.map(f=>new Promise<{url:string;assetPath?:string}>((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{const image=new Image();image.onload=()=>resolve({url:String(r.result)});image.onerror=reject;image.src=String(r.result);};r.readAsDataURL(f);})));
      add(run.id,uploaded.map(item=>({url:item.url,assetPath:'path' in item?item.path:item.assetPath})));
    }catch{setError('图片上传失败，请重试。');}finally{setBusy(false);}
  };
  const saveReview=async(id:string)=>{if(!editable)return;if(cloudEnabled)await cloudRepository.saveSharedDocument(workspaceId,'review',`evidence-${runId}`,uxReviewNotes);setSavedUxReviewNotes(old=>({...old,[id]:true}))};
  const cases=run?.inputs.filter(c=>filter==='ALL'||(filter==='ISSUE'?c.scores.some(s=>s.score!==null&&s.score<2):c.id.startsWith(filter)))||[];
  return <><AppHeader showNavigation={false}/><main className="page fit-page fit-evidence-page"><header className="fit-page-heading"><div><span className="eyebrow">{run?.name||'RUN'} / TEST DETAILS</span><h1>测试详情<span>INPUT / OUTPUT</span></h1></div><Link className="btn" to={`/templates/${templateId}/fit`}>← 返回 FIT</Link></header>
    {!run?<p className="fit-source">未找到本轮记录。未执行的本地测试记录仅保留于本次会话。</p>:<>
      <div className="fit-evidence-toolbar"><div className="fit-filters">{[['ISSUE','问题图片'],['ALL','全部'],['P0','优势输入'],['P1','支持输入'],['P2','边界输入']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><span className="eyebrow">{cases.length} / {run.inputs.length} INPUTS</span>{run.status==='PENDING'&&<button className="btn primary" disabled={busy} onClick={()=>input.current?.click()}>{busy?'读取中…':'上传输入图片 ＋'}</button>}</div>
      <input type="file" accept="image/*" multiple hidden ref={input} onChange={e=>{void upload(e.target.files);e.target.value='';}}/>
      {error&&<p role="alert">{error}</p>}
      {run.status==='PENDING'&&<p className="fit-source">本轮等待执行。输入已保存到当前会话，尚未连接生成服务；不会自动生成测试结果或评分。</p>}
      {!cases.length&&<p className="fit-empty">{run.inputs.length?'没有符合筛选的图片。':'上传本轮测试输入图片后，将在这里进行对照。'}</p>}
      {cases.map(c=><article className="fit-evidence-case" id={c.id} key={c.id}><div className="fit-case-label"><b>{c.id}</b><span className="eyebrow">{c.id.split('-')[0]}</span></div><div className="fit-case-media"><div className="fit-image-pair">{[{src:c.url,label:'INPUT'},{src:c.output,label:'OUTPUT'}].map(item=><figure key={item.label}><figcaption className="eyebrow">{item.label} / {c.id}</figcaption>{item.src?<button onClick={()=>setPreview({src:item.src!,name:`${c.id} · ${item.label}`})} aria-label={`放大 ${c.id} ${item.label}`}><img loading="lazy" src={item.src} alt={`${c.id} ${item.label}`}/></button>:<div className="fit-image-empty">{item.label==='OUTPUT'?'等待测试输出':'未记录输入图片'}</div>}</figure>)}</div></div><aside className="fit-case-scores"><h3 className="eyebrow">RULE 分数</h3>{c.scores.length?<table><tbody>{c.scores.map(s=><tr key={s.rule} className={`${s.type==='MUST'?'rule-must':'rule-preferred'} ${s.score!==null&&s.score<2?'score-low':''}`}><th><span>{s.rule}</span><small>{ruleNames[s.rule]||'规则表现'}</small></th><td>{s.score===null?'—':`${s.score} 分`}</td></tr>)}</tbody></table>:<p className="fit-source">待评分</p>}{user?.role==='ux'&&<div className="fit-ux-review-note"><span>UX 审阅问题</span><textarea aria-label={`${c.id} UX 审阅问题`} value={uxReviewNotes[c.id]||''} onChange={event=>{setUxReviewNotes(old=>({...old,[c.id]:event.target.value}));setSavedUxReviewNotes(old=>({...old,[c.id]:false}))}} placeholder="描述你观察到的问题…"/><button className="btn" disabled={!uxReviewNotes[c.id]?.trim()} onClick={()=>void saveReview(c.id)}>{savedUxReviewNotes[c.id]?'已保存':'保存问题'}</button></div>}</aside></article>)}
    </>}
    {preview&&<FitDialog title={preview.name} onClose={()=>setPreview(null)}><img className="fit-large-image" src={preview.src} alt={preview.name}/></FitDialog>}
  </main></>;
}
