import {useEffect,useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {useAppStore} from '@/store/appStore';
import {cloudRepository} from '@/data/cloudRepository';
import {cloudRead} from '@/data/cloudRead';

export default function WorkspaceRecovery(){
  const user=useAppStore(s=>s.currentUser);
  const workspaceId=useAppStore(s=>s.workspace.id);
  const templates=useAppStore(s=>s.templates);
  const [images,setImages]=useState<Array<{path:string;url:string;name:string}>>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [templateId,setTemplateId]=useState('');
  const [message,setMessage]=useState('正在读取原始 UX 图片…');
  const [busy,setBusy]=useState(false);
  const restoreOldCatalog=async()=>{
    if(busy)return;setBusy(true);
    try{
      const response=await fetch('/api/recovery/origin-caches');
      if(!response.ok)throw new Error('旧缓存备份无法读取');
      const {archives}=await response.json() as {archives:Array<{value:{entries:Record<string,string>}}>};
      const recovered=new Map<string,typeof templates[number]>();
      for(const archive of archives){
        const raw=archive.value.entries['seedream-app-storage'];if(!raw)continue;
        const entries=JSON.parse(raw)?.state?.templates;
        if(!Array.isArray(entries))continue;
        const sameTeam=entries.some(t=>t.workspaceId===workspaceId);
        for(const t of entries){
          // The initial local workspace used ws-001 before its cloud UUID migration.
          // Accept legacy cases only alongside an actual case from this team.
          if(t.workspaceId!==workspaceId&&!(sameTeam&&t.workspaceId==='ws-001'&&workspaceId==='00000000-0000-4000-8000-000000000001'))continue;
          const prior=recovered.get(t.id);if(!prior||t.updatedAt>prior.updatedAt)recovered.set(t.id,t);
        }
      }
      const [catalog,self,colleagues]=await Promise.all([cloudRepository.loadSharedDocument<typeof templates>(workspaceId,'template','catalog-v1'),cloudRepository.currentProfile(),cloudRepository.searchColleagues(workspaceId,'Lico')]);
      if(!Array.isArray(catalog)||self?.name.replace(/\s/g,'').toLowerCase()!=='hanyiwang')throw new Error('无法核对现有目录与负责人，未保存');
      const lico=colleagues.filter(p=>p.name.trim().toLowerCase()==='lico');if(lico.length!==1)throw new Error('无法唯一核对 Lico');
      const merged=[...catalog];
      for(const source of recovered.values()){
        const current=merged.find(t=>t.id===source.id);
        if(current&&!current.recoveryNote)continue;
        const paths=source.referenceImagePaths||[];
        if(paths.some(path=>!path.startsWith(`${workspaceId}/ux/`)))throw new Error('备份参考图不属于当前 UX 团队');
        const urls=await cloudRead(Promise.all(paths.map(path=>cloudRepository.imageUrl(path))));
        const cover=source.coverReferenceIndex??Math.max(0,paths.indexOf(source.coverImagePath||''));
        const restored={...source,...current,workspaceId,ownerId:self.id,collaborators:[lico[0].id],responsibilityVersion:2,team:[{profileId:self.id,name:self.name,role:'ux' as const},{profileId:lico[0].id,name:lico[0].name,role:'tester' as const}],
          ...(paths.length?{referenceImagePaths:paths,referenceImages:urls,coverImagePath:paths[cover],coverImageUrl:urls[cover],coverReferenceIndex:cover}:{}),
          aiStyleSummary:current?.aiStyleSummary||source.aiStyleSummary,
          recoveryNote:'已从旧网址原缓存恢复目录、可用参考图和封面；参考图备份时间早于最新报告，请核对版本。测试历史与原画布布局尚未完整恢复。',updatedAt:new Date().toISOString()};
        if(current)merged.splice(merged.indexOf(current),1,restored);else merged.push(restored);
      }
      await cloudRepository.saveSharedDocument(workspaceId,'template','catalog-v1',merged);
      useAppStore.getState().replaceTemplates(merged);
      setMessage(`旧缓存已恢复。当前目录 ${merged.length} 个模板，未替换原 DEFINE 报告。`);
    }catch(error){setMessage(String((error as Error)?.message||error))}finally{setBusy(false)}
  };
  useEffect(()=>{
    if(user?.role!=='ux')return;let active=true;
    void cloudRead(cloudRepository.inspectRecoverySources(workspaceId,'ux',user.id)).then(async scan=>{
      if(scan.errors.some(Boolean))throw new Error(scan.errors.filter(Boolean).join('；'));
      const sorted=(scan.images||[]).filter(i=>i.id).sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
      const hydrated=await cloudRead(Promise.all(sorted.map(async i=>{const path=`${workspaceId}/ux/${i.name}`;return {path,name:i.name,url:await cloudRepository.imageUrl(path)};})));
      if(active){setImages(hydrated);setMessage('选择原参考图（按点击顺序对应 REF01–REF06），再恢复到对应模板。仅保存关联，不重新分析。');}
    }).catch(error=>{if(active)setMessage(String(error?.message||error))});
    return()=>{active=false};
  },[workspaceId,user?.id,user?.role]);
  if(user?.role!=='ux')return <Navigate to="/templates" replace/>;
  const apply=async()=>{
    if(!templateId||selected.length<3||selected.length>6||busy)return;
    setBusy(true);
    try{
      const catalog=await cloudRead(cloudRepository.loadSharedDocument<typeof templates>(workspaceId,'template','catalog-v1'));
      const target=catalog?.find(t=>t.id===templateId);
      if(!target)throw new Error('云端没有对应模板，未保存');
      const hero=Math.max(0,Math.min(selected.length-1,Number(target.aiDefinition?.heroReference?.replace('REF','')||1)-1));
      const changes={referenceImagePaths:selected,referenceImages:selected.map(path=>images.find(i=>i.path===path)!.url),coverReferenceIndex:hero,coverImagePath:selected[hero],coverImageUrl:images.find(i=>i.path===selected[hero])!.url,recoveryNote:'原 DEFINE 报告及经核对的参考图已恢复；原画布布局和测试历史仍待恢复。',updatedAt:new Date().toISOString()};
      await cloudRepository.saveSharedDocument(workspaceId,'template','catalog-v1',catalog!.map(t=>t.id===templateId?{...t,...changes}:t));
      useAppStore.getState().updateTemplate(templateId,changes);
      setMessage('参考图、顺序和封面已保存到云端。');setSelected([]);
    }catch(error){setMessage(String((error as Error)?.message||error))}finally{setBusy(false)}
  };
  return <main style={{padding:24,maxWidth:1100,margin:'auto',height:'100dvh',overflowY:'auto'}}><Link to="/templates">返回模板</Link><h1>原参考图核对恢复</h1><p role="status">{message}</p><button disabled={busy} onClick={()=>void restoreOldCatalog()}>恢复旧网址缓存中的模板</button><div style={{display:'flex',gap:16,marginBottom:16}}><select aria-label="恢复到模板" value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">选择模板</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button disabled={busy||!templateId||selected.length<3||selected.length>6} onClick={()=>void apply()}>{busy?'恢复中…':`恢复参考图（${selected.length} 张）`}</button><button onClick={()=>setSelected([])}>清空选择</button></div><div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:12}}>{images.map((image,index)=><button key={image.path} aria-label={`原图片 ${index+1}`} onClick={()=>setSelected(old=>old.includes(image.path)?old.filter(p=>p!==image.path):[...old,image.path])} style={{border:selected.includes(image.path)?'3px solid #fa5624':'1px solid #ccc',padding:4,background:'#fff'}}><img src={image.url} style={{width:'100%',height:90,objectFit:'contain'}} alt={`原图片 ${index+1}`}/><div>{index+1}{selected.includes(image.path)?` · REF${String(selected.indexOf(image.path)+1).padStart(2,'0')}`:''}</div></button>)}</div></main>;
}
