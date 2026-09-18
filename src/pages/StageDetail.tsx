import { Link, useParams } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { mockData } from '@/data/mockData';
import { useAppStore } from '@/store/appStore';
import { stageStatusLabels } from './TemplateDetail';
import FitWorkflow from './FitWorkflow';

export default function StageDetail(){
  const {templateId,stageType}=useParams();
  const template=useAppStore(s=>s.templates.find(t=>t.id===templateId));
  const run=mockData.runs.filter(r=>r.templateCaseId===templateId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const stage=mockData.stages.find(s=>s.runId===run?.id&&s.type===stageType?.toUpperCase());
  const handoffs=mockData.handoffs.filter(h=>h.runId===run?.id&&(h.fromStage===stage?.type||h.toStage===stage?.type));
  if(stageType?.toUpperCase()==='TUNE')return <FitWorkflow stage="TUNE"/>;
  return <><AppHeader showNavigation={false}/><main className="page">
    <Link className="btn" to={`/templates/${templateId}`}>← 返回模板详情</Link>
    <h1 style={{margin:'28px 0'}}>{template?.name} · {stageType?.toUpperCase()}</h1>
    {!stage||stage.status==='NOT_STARTED'?<p>此步骤尚未开始，暂无执行记录。</p>:<>
      <div className="spec-list">
        <div className="spec-row"><span>状态</span><b>{stageStatusLabels[stage.status]||stage.status}</b></div>
        <div className="spec-row"><span>运行批次</span><span>{run?.runNumber}</span></div>
        <div className="spec-row"><span>负责角色</span><span>{stage.responsibleRole==='ux'?'UX 设计师':'测试人员'}</span></div>
        <div className="spec-row"><span>更新时间</span><span>{new Date(stage.updatedAt).toLocaleString('zh-CN')}</span></div>
        {stage.completedAt&&<div className="spec-row"><span>完成时间</span><span>{new Date(stage.completedAt).toLocaleString('zh-CN')}</span></div>}
        {stage.blockedReason&&<div className="spec-row"><span>中止原因</span><span>{stage.blockedReason}</span></div>}
      </div>
      <h2 style={{margin:'28px 0 16px'}}>交接记录</h2>
      {handoffs.length?handoffs.map(h=><div className="spec-row" key={h.id}><span>{h.fromStage} → {h.toStage}</span><span>{new Date(h.updatedAt).toLocaleString('zh-CN')}</span></div>):<p>暂无交接记录。</p>}
    </>}
  </main></>;
}
