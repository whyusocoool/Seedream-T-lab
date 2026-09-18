import { useEffect } from 'react';
import { fetchDefinitionJobs } from '@/data/aiProvider';
import { useAppStore } from '@/store/appStore';
import { cloudRepository } from '@/data/cloudRepository';
import { cloudEnabled } from '@/data/supabase';

/** Results survive route changes and browser refreshes; the local service owns execution. */
export default function DefinitionJobSync(){
  const user=useAppStore(s=>s.currentUser);
  useEffect(()=>{
    if(!user||user.role!=='ux')return;
    let active=true,inFlight=false;
    const sync=async()=>{
      if(inFlight)return;inFlight=true;
      try{for(const job of (await fetchDefinitionJobs()).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))){
        if(!active)return;
        const store=useAppStore.getState();
        const template=store.templates.find(t=>t.id===job.templateId);
        if(!template)continue;
        if(template.defineJobId!==job.id){
          // Also recover a job accepted just before browser close, before its ID was synced to cloud.
          if((template.defineRequestedAt&&job.startedAt<template.defineRequestedAt)||(template.defineProgress&&job.startedAt<=template.defineProgress.startedAt)||(template.defineCompletedAt&&job.startedAt<=template.defineCompletedAt))continue;
          store.updateTemplate(template.id,{defineJobId:job.id});
        }
        if(template.defineProgress?.updatedAt===job.updatedAt&&template.defineStatus!=='ANALYZING')continue;
        const progress={phase:job.phase,failedPhase:job.failedPhase,startedAt:job.startedAt,updatedAt:job.updatedAt,history:job.history};
        if(job.status==='RUNNING'){
          if(template.defineProgress?.updatedAt!==job.updatedAt)store.updateTemplate(template.id,{defineProgress:progress});
        }else if(job.status==='FAILED')store.updateTemplate(template.id,{defineStatus:'FAILED',defineError:job.error,defineDiagnostics:job.outputs,defineProgress:progress,defineCompletedAt:job.updatedAt});
        else if(job.result){
          const {definition,summary}=job.result;
          // Persist the report first; a cloud write failure is retried rather than losing completion.
          if(cloudEnabled)await cloudRepository.saveSharedDocument(template.workspaceId,'rules',`definition-${template.id}`,definition);
          if(!active||useAppStore.getState().templates.find(t=>t.id===template.id)?.defineJobId!==job.id)continue;
          const index=Math.max(0,Number(definition.heroReference.replace('REF',''))-1);
          store.updateTemplate(template.id,{defineStatus:'SUCCEEDED',defineError:undefined,defineCompletedAt:job.updatedAt,defineProgress:progress,
            aiDefinition:definition,aiStyleSummary:summary,aiPrompt:summary.prompt,coverReferenceIndex:index,
            coverImageUrl:template.referenceImages?.[index],coverImagePath:template.referenceImagePaths?.[index]});
        }
      }}catch(error){console.warn('[DEFINE] 任务同步暂不可用',error);}finally{inFlight=false;}
    };
    void sync();const interval=window.setInterval(()=>void sync(),2500);
    return()=>{active=false;window.clearInterval(interval);};
  },[user?.id,user?.role]);
  return null;
}
