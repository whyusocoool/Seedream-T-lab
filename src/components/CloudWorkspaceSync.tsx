import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useFitStore } from '@/store/fitStore';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository } from '@/data/cloudRepository';
import type { TemplateCase } from '@/types';
import type { FitRecord } from '@/data/fitData';
import { migrateTemplateResponsibilities } from '@/data/templateResponsibilities';
import { cloudRead } from '@/data/cloudRead';
import { recoverWorkspace } from '@/data/recoverWorkspace';

const hydrateTemplates=async(templates:TemplateCase[])=>Promise.all(templates.map(async template=>{
  if(!template.referenceImagePaths?.length)return template;
  const referenceImages=await Promise.all(template.referenceImagePaths.map(path=>cloudRepository.imageUrl(path)));
  const coverIndex=template.coverReferenceIndex??0;
  return {...template,referenceImages,coverImageUrl:template.coverImagePath?await cloudRepository.imageUrl(template.coverImagePath):referenceImages[coverIndex]||referenceImages[0]};
}));

const hydrateRuns=async(runs:FitRecord[])=>Promise.all(runs.map(async run=>({
  ...run,
  inputs:await Promise.all(run.inputs.map(async input=>({
    ...input,
    url:input.assetPath?await cloudRepository.imageUrl(input.assetPath):input.url,
    output:input.outputAssetPath?await cloudRepository.imageUrl(input.outputAssetPath):input.output,
  }))),
})));

export default function CloudWorkspaceSync(){
  const user=useAppStore(state=>state.currentUser);
  const workspaceId=useAppStore(state=>state.workspace.id);
  const templates=useAppStore(state=>state.templates);
  const replaceTemplates=useAppStore(state=>state.replaceTemplates);
  const runs=useFitStore(state=>state.runs);
  const replaceRuns=useFitStore(state=>state.replaceRuns);
  const [ready,setReady]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [emptyCatalog,setEmptyCatalog]=useState('');
  const [recoveryScan,setRecoveryScan]=useState<Awaited<ReturnType<typeof cloudRepository.inspectRecoverySources>>|null>(null);
  const [recovering,setRecovering]=useState(false);
  const recover=async()=>{
    if(!recoveryScan||recovering)return;
    setRecovering(true);
    try{await recoverWorkspace(recoveryScan);setRetry(value=>value+1);setRecoveryScan(null);}
    catch(error){setEmptyCatalog(`恢复未完成：${String((error as Error)?.message||error)}。已完成的记录保留，再次恢复不会重复添加。`);}
    finally{setRecovering(false);}
  };
  const [retry,setRetry]=useState(0);
  const templateBaseline=useRef<string|null>(null);
  const runBaseline=useRef<string|null>(null);
  const definitionBaseline=useRef<Record<string,string>>({});

  useEffect(()=>{
    if(!cloudEnabled||!user){setReady(false);return;}
    let active=true;setReady(false);setLoadError('');setEmptyCatalog('');templateBaseline.current=null;runBaseline.current=null;
    void Promise.all([
      cloudRead(cloudRepository.loadSharedDocument<TemplateCase[]>(workspaceId,'template','catalog-v1')),
      cloudRead(cloudRepository.loadSharedDocument<FitRecord[]>(workspaceId,'fit_run','runs-v1')),
    ]).then(async([cloudTemplates,cloudRuns])=>{
      if(!active)return;
      if(cloudTemplates!==null&&!Array.isArray(cloudTemplates))throw new Error('云端模板目录格式异常，已暂停自动保存');
      if(cloudRuns!==null&&!Array.isArray(cloudRuns))throw new Error('云端运行记录格式异常，已暂停自动保存');
      if(cloudTemplates===null)setEmptyCatalog('云端未返回当前团队的模板目录。可能是目录不存在或读取权限不足；没有用空目录覆盖云端。');
      else if(!cloudTemplates.length){
        setEmptyCatalog('云端返回的模板目录为空，正在检查当前团队的其他原始记录和图片…');
        try{
          const scan=await cloudRead(cloudRepository.inspectRecoverySources(workspaceId,user.role==='tester'?'tester':'ux',user.id));
          if(!active)return;
          setRecoveryScan(scan);
          setEmptyCatalog(`当前团队原始文档 ${scan.documents?.length??0} 条，当前角色画布 ${scan.canvases?.length??0} 条，图片 ${scan.images?.filter(image=>image.id).length??0} 张。恢复检查记录已保存在本机；未写回空目录。${scan.errors.filter(Boolean).length?'部分检查失败：'+scan.errors.filter(Boolean).join('；'):''}`);
        }catch(error){if(active)setEmptyCatalog(`云端目录为空；恢复来源检查失败：${String((error as Error)?.message||error)}`);}
      }
      if(cloudTemplates){
        let catalog=cloudTemplates;
        if(user.role==='ux'&&catalog.some(item=>item.responsibilityVersion!==2))try{
          const [hanyiMatches,licoMatches]=await Promise.all([cloudRepository.searchColleagues(workspaceId,'Hanyi'),cloudRepository.searchColleagues(workspaceId,'Lico')]);
          const hanyi=hanyiMatches.filter(person=>person.name.replace(/\s/g,'').toLowerCase()==='hanyiwang');
          const lico=licoMatches.filter(person=>person.name.trim().toLowerCase()==='lico');
          if(hanyi.length===1&&lico.length===1){
            catalog=migrateTemplateResponsibilities(catalog,hanyi[0],lico[0]);
            await cloudRepository.saveSharedDocument(workspaceId,'template','catalog-v1',catalog);
          }else console.error('[cloud] 负责人迁移未执行：Hanyi Wang 或 Lico 账户无法唯一确定');
        }catch(error){console.error('[cloud] 负责人迁移失败，保留原目录',error)}
        const hydrated=await cloudRead(hydrateTemplates(catalog));
        if(active)replaceTemplates(hydrated);
      }
      if(cloudRuns){const hydrated=await cloudRead(hydrateRuns(cloudRuns));if(active)replaceRuns(hydrated);}
      if(active){
        const catalog=useAppStore.getState().templates;
        templateBaseline.current=JSON.stringify(catalog);
        runBaseline.current=JSON.stringify(useFitStore.getState().runs);
        definitionBaseline.current=Object.fromEntries(catalog.filter(t=>t.aiDefinition).map(t=>[t.id,JSON.stringify(t.aiDefinition)]));
        setReady(true);
      }
    }).catch(error=>{console.error('[cloud] 团队数据读取失败；禁止用未加载的本地目录覆盖云端',error);if(active)setLoadError(error instanceof Error?error.message:String(error?.message||'团队模板暂时无法读取'));});
    return()=>{active=false};
  // The signed-in account identifies one shared team workspace. Role switches
  // must not restart hydration or overwrite the other role's data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id,workspaceId,retry]);

  useEffect(()=>{
    if(!cloudEnabled||!ready||!user)return;
    let active=true;let fetching=false;
    const refresh=async()=>{
      if(fetching||document.hidden)return;fetching=true;
      try{
        const remote=await cloudRepository.loadSharedDocument<TemplateCase[]>(workspaceId,'template','catalog-v1');
        if(!active||!remote)return;
        const local=useAppStore.getState().templates;
        const changed=remote.filter(item=>!local.some(current=>current.id===item.id&&current.updatedAt>=item.updatedAt));
        if(!changed.length)return;
        const hydrated=await hydrateTemplates(changed);
        if(!active)return;
        const latest=useAppStore.getState().templates;
        replaceTemplates([...latest.filter(item=>!hydrated.some(incoming=>incoming.id===item.id&&incoming.updatedAt>item.updatedAt)),...hydrated.filter(item=>!latest.some(current=>current.id===item.id&&current.updatedAt>=item.updatedAt))]);
      }catch(error){console.error('[cloud] 模板邀请同步失败',error)}finally{fetching=false}
    };
    const timer=window.setInterval(()=>void refresh(),5000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[ready,user?.id,workspaceId,replaceTemplates]);

  useEffect(()=>{
    if(!ready||!user)return;
    const serialized=JSON.stringify(templates);
    if(templateBaseline.current===null||templateBaseline.current===serialized)return;
    const timer=window.setTimeout(()=>void cloudRepository.saveSharedDocument(workspaceId,'template','catalog-v1',templates).then(()=>{templateBaseline.current=serialized;}).catch(error=>console.error('[cloud] 模板保存失败',error)),900);
    return()=>window.clearTimeout(timer);
  },[ready,templates,user,workspaceId]);

  useEffect(()=>{
    if(!ready||!user)return;
    const definitions=templates.filter(template=>template.aiDefinition&&definitionBaseline.current[template.id]!==JSON.stringify(template.aiDefinition));
    if(!definitions.length)return;
    const timer=window.setTimeout(()=>void Promise.all(definitions.map(template=>
      cloudRepository.saveSharedDocument(workspaceId,'rules',`definition-${template.id}`,template.aiDefinition).then(()=>{definitionBaseline.current[template.id]=JSON.stringify(template.aiDefinition);})
    )).catch(error=>console.error('[cloud] DEFINE Rules 回填失败',error)),1100);
    return()=>window.clearTimeout(timer);
  },[ready,templates,user,workspaceId]);

  useEffect(()=>{
    if(!ready||!user)return;
    const serialized=JSON.stringify(runs);
    if(runBaseline.current===null||runBaseline.current===serialized)return;
    const timer=window.setTimeout(()=>void cloudRepository.saveSharedDocument(workspaceId,'fit_run','runs-v1',runs).then(()=>{runBaseline.current=serialized;}).catch(error=>console.error('[cloud] FIT 数据保存失败',error)),900);
    return()=>window.clearTimeout(timer);
  },[ready,runs,user,workspaceId]);

  return loadError?<aside role="alert" style={{padding:'12px 24px',color:'#bd3025',background:'#fff0ec'}}>云端模板读取失败：{loadError} <button type="button" onClick={()=>setRetry(value=>value+1)}>重新读取</button></aside>:cloudEnabled&&user&&!ready?<aside role="status" style={{padding:'12px 24px'}}>正在读取团队模板…</aside>:ready&&emptyCatalog&&!templates.length?<aside role="alert" style={{padding:'12px 24px',color:'#bd3025',background:'#fff0ec'}}>{emptyCatalog} <button type="button" onClick={()=>setRetry(value=>value+1)}>重新读取</button>{user?.role==='ux'&&recoveryScan&&<button type="button" disabled={recovering} onClick={()=>void recover()}>{recovering?'正在恢复原始记录…':'恢复已找回的报告和图片'}</button>}</aside>:null;
}
