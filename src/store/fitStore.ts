import { create } from 'zustand';
import { savedFitRecords, type FitRecord } from '@/data/fitData';
import { getDefinitionReport } from '@/data/templateDefinitions';

type NewInput={url:string;assetPath?:string};
export const useFitStore=create<{runs:FitRecord[];replaceRuns:(runs:FitRecord[])=>void;start:(templateId:string,inputs?:Array<string|NewInput>,model?:string,promptVersion?:string,prompt?:string)=>FitRecord;addInputs:(id:string,inputs:NewInput[])=>void}>((set,get)=>({
  runs:[],
  replaceRuns:(runs)=>set({runs}),
  start:(templateId,inputs=[],model='尚未指定',promptVersion,prompt)=>{
    const count=Math.max(0,...[...savedFitRecords(templateId),...get().runs.filter(r=>r.templateId===templateId)].map(r=>Number(r.name.replace(/\D/g,''))||0))+1;
    const run:FitRecord={id:`fit-${crypto.randomUUID()}`,name:`run${String(count).padStart(3,'0')}`,templateId,status:'PENDING',version:promptVersion||getDefinitionReport(templateId)?.promptVersion||'未配置',prompt,model,inputs:inputs.map((input,i)=>({id:`INPUT-${String(i+1).padStart(2,'0')}`,...(typeof input==='string'?{url:input}:input),scores:[]}))};
    set(s=>({runs:[run,...s.runs]}));return run;
  },
  addInputs:(id,inputs)=>set(s=>({runs:s.runs.map(r=>r.id===id?{...r,inputs:[...r.inputs,...inputs.map((input,i)=>({id:`INPUT-${String(r.inputs.length+i+1).padStart(2,'0')}`,...input,scores:[]}))]}:r)})),
}));
