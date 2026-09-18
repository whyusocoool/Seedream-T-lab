import { cloudRepository } from './cloudRepository';
import type { TemplateCase, TemplateDefinitionReport } from '@/types';
type Scan = Awaited<ReturnType<typeof cloudRepository.inspectRecoverySources>>;

export async function recoverWorkspace(scan: Scan, repository = cloudRepository) {
  if(scan.job!=='ux'||scan.errors.some(Boolean))throw new Error('恢复来源必须是读取完整的 UX 团队记录');
  const [hm,lm,self]=await Promise.all([repository.searchColleagues(scan.workspaceId,'Hanyi'),repository.searchColleagues(scan.workspaceId,'Lico'),repository.currentProfile()]);
  // Colleague search intentionally excludes the signed-in account.
  const h=[...hm,...(self?[self]:[])].filter((p,index,all)=>all.findIndex(other=>other.id===p.id)===index&&p.name.replace(/\s/g,'').toLowerCase()==='hanyiwang'&&p.jobs.includes('ux'));
  const l=lm.filter(p=>p.name.trim().toLowerCase()==='lico');
  if(h.length!==1||l.length!==1)throw new Error('无法唯一核对 Hanyi Wang 和 Lico，未更改负责人');
  const now=new Date().toISOString();
  const reports=(scan.documents||[]).filter(d=>d.workspace_id===scan.workspaceId&&d.document_type==='rules'&&d.document_key.startsWith('definition-')&&d.payload?.templateName&&d.payload?.seedreamPrompt);
  const current=await repository.loadSharedDocument<TemplateCase[]>(scan.workspaceId,'template','catalog-v1');
  if(current!==null&&!Array.isArray(current))throw new Error('模板目录格式异常，停止恢复');
  const additions:TemplateCase[]=reports.filter(d=>!current?.some(t=>t.id===d.document_key.slice(11))).map(d=>{
    const definition=d.payload as TemplateDefinitionReport;
    const timestamp=Number(d.document_key.replace('definition-tpl-',''));
    return {id:d.document_key.slice(11),workspaceId:scan.workspaceId,name:definition.templateName,usageScenario:definition.usageScenario,runtimeInputType:'IMAGE_ONLY',status:'ACTIVE',responsibilityVersion:2,
      ownerId:h[0].id,collaborators:[l[0].id],team:[{profileId:h[0].id,name:h[0].name,role:'ux'},{profileId:l[0].id,name:l[0].name,role:'tester'}],
      aiDefinition:definition,aiPrompt:definition.seedreamPrompt,defineStatus:'SUCCEEDED',defineCompletedAt:d.updated_at,
      recoveryNote:'从云端保留的原始 DEFINE 报告恢复。原参考图关联、画布布局及测试历史尚未还原，请重新核对；不是新跑的报告。',
      createdAt:Number.isFinite(timestamp)?new Date(timestamp).toISOString():d.updated_at,updatedAt:now};
  });
  if(additions.length)await repository.saveSharedDocument(scan.workspaceId,'template','catalog-v1',[...(current||[]),...additions]);
  const canvas=await repository.loadCanvas<{items: Array<{id:string;assetPath?:string}>;[key:string]:unknown}>(scan.workspaceId,'ux');
  if(canvas&&(!canvas.payload||!Array.isArray(canvas.payload.items)))throw new Error('画布格式异常，未覆盖原画布');
  const existing=canvas?.payload?.items||[];
  const images=(scan.images||[]).filter(image=>image.id).sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
  const missing=images.filter(image=>!existing.some(item=>item.assetPath===`${scan.workspaceId}/ux/${image.name}`));
  const restored=await Promise.all(missing.map(async(image,index)=>{
    const assetPath=`${scan.workspaceId}/ux/${image.name}`;
    return {id:`recovered-${image.id}`,assetPath,src:await repository.imageUrl(assetPath),x:80+(index%5)*260,y:80+Math.floor(index/5)*290,w:220,h:220,z:existing.length+index,templated:false,tags:['恢复待核对'],label:`恢复图片 ${index+1}（原归属待核对）`};
  }));
  if(restored.length)await repository.saveCanvas(scan.workspaceId,'ux',{...(canvas?.payload||{groups:{},query:'',filter:'all',zoom:1,offset:{x:0,y:0},tagCategories:[],tagFilter:[],schemaVersion:4}),items:[...existing,...restored]});
  return {templates:additions.length,images:restored.length};
}
