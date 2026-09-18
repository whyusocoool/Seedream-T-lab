import type { Run, Stage, TemplateCase } from '@/types';

export function getUXStageAction(run:Run|undefined,stages:Stage[]){
  if(!run)return undefined;
  const fit=stages.find(stage=>stage.type==='FIT');
  const tune=stages.find(stage=>stage.type==='TUNE');
  const review=stages.find(stage=>stage.type==='UX_RULE_REVIEW');
  if(run.status==='STOPPED')return {key:`stopped:${run.id}:${run.updatedAt}`,label:'待处理 · 测试中止报告'};
  if(run.currentStage==='UX_RULE_REVIEW'&&review?.status==='IN_PROGRESS'&&fit&&['COMPLETED','PASSED','CONDITIONAL_PASS','FAILED'].includes(fit.status))return {key:`review:${review.id}:${review.updatedAt}`,label:'待处理 · 新规则审查'};
  if(run.currentStage==='RELEASE'&&tune&&['COMPLETED','PASSED','CONDITIONAL_PASS'].includes(tune.status))return {key:`release:${run.id}:${tune.updatedAt}`,label:'待处理 · 发布确认'};
  if(fit?.status==='FAILED')return {key:`fit:${fit.id}:${fit.updatedAt}`,label:'待处理 · FIT 中止报告'};
  return undefined;
}

export function getUXTemplateTodo(template:TemplateCase,run:Run|undefined,stages:Stage[]){
  if(template.defineStatus==='ANALYZING')return '';
  if(template.defineStatus==='SUCCEEDED'&&template.defineCompletedAt&&template.defineCompletedAt!==template.defineSeenAt)return '待处理 · 新 DEFINE 报告';
  const action=getUXStageAction(run,stages);
  return action&&template.uxSeenStageKey!==action.key&&!template.uxSeenActionKeys?.includes(action.key)?action.label:'';
}
