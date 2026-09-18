import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { can } from '@/data/permissions';
import { canViewTemplate } from '@/data/templateVisibility';
import AppHeader from '@/components/AppHeader';
import { mockData } from '@/data/mockData';
import { getUXTemplateTodo } from '@/data/templateTodo';
import type { MemberRole, StageType, TemplateCase } from '@/types';
import '@/styles/figma-screens.css';

type DisplayStatus = '进行中'|'暂停'|'中止';
const stageNames:Record<StageType,string>={DEFINE:'DEFINE',FIT:'FIT',UX_RULE_REVIEW:'规则审查',TUNE:'TUNE',RELEASE:'发布'};
const templateState=(template:TemplateCase,role:MemberRole)=>{
  const run=mockData.runs.filter(item=>item.templateCaseId===template.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const stages=run?mockData.stages.filter(stage=>stage.runId===run.id):[];
  const define=stages.find(stage=>stage.type==='DEFINE');
  const terminated=template.status==='FAILED'||template.status==='ARCHIVED'||(template.status==='BLOCKED'&&define?.status==='BLOCKED');
  let todo='';
  if(role==='ux'){
    todo=getUXTemplateTodo(template,run,stages);
  }else if(run){
    const current=stages.find(stage=>stage.type===run.currentStage);
    if(current?.status==='IN_PROGRESS'&&role==='tester'&&['FIT','TUNE'].includes(current.type))todo=`待处理 · ${stageNames[current.type]}`;
  }
  return {terminated,todo};
};

const displayStatus=(status:TemplateCase['status'],terminated=false):DisplayStatus=>{
  if(terminated)return '中止';
  if(status==='ACTIVE')return '进行中';
  if(status==='PAUSED')return '暂停';
  return '中止';
};

export default function TemplateList(){
  const user=useAppStore(s=>s.currentUser);
  const templates=useAppStore(s=>s.templates);
  const [query,setQuery]=useState('');
  const [filterOpen,setFilterOpen]=useState(false);
  const [statuses,setStatuses]=useState<Set<DisplayStatus>>(new Set());
  if(!user)return null;

  const shown=templates.filter(template=>{
    const {terminated}=templateState(template,user.role);
    const matchesRole=canViewTemplate(template,user.role,user.id);
    const matchesQuery=(template.name+template.usageScenario).toLowerCase().includes(query.toLowerCase());
    const matchesStatus=statuses.size===0||statuses.has(displayStatus(template.status,terminated));
    return matchesRole&&matchesQuery&&matchesStatus;
  }).sort((a,b)=>Number(templateState(a,user.role).terminated)-Number(templateState(b,user.role).terminated));

  const toggleStatus=(status:DisplayStatus)=>{
    setStatuses(current=>{
      const next=new Set(current);
      next.has(status)?next.delete(status):next.add(status);
      return next;
    });
  };

  return <div className="figma-template-page">
    <AppHeader/>
    <main className="page template-index">
      <div className="toolbar">
        <input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索模板"/>
        <div className="toolbar-actions">
          <span className="template-filter">
            <button className="btn" onClick={()=>setFilterOpen(!filterOpen)}>
              筛选{statuses.size>0?` · ${statuses.size}`:''}
            </button>
            {filterOpen&&<div className="template-filter-menu" onMouseLeave={()=>setFilterOpen(false)}>
              {(['进行中','暂停','中止'] as DisplayStatus[]).map(status=>
                <label key={status}>
                  <input type="checkbox" checked={statuses.has(status)} onChange={()=>toggleStatus(status)}/>
                  <span>{status}</span>
                </label>
              )}
              {statuses.size>0&&<button className="clear-filter" onClick={()=>setStatuses(new Set())}>清除筛选</button>}
            </div>}
          </span>
          {can('CREATE_TEMPLATE',user.role)&&<Link className="btn primary" to="/templates/new">＋ 新建模板</Link>}
        </div>
      </div>
      <section className="catalog">
        {shown.map((template,index)=>{
          const state=templateState(template,user.role);const status=displayStatus(template.status,state.terminated);
          const defineBadge=template.defineStatus==='ANALYZING'?'DEFINE 分析中':template.defineStatus==='FAILED'?'DEFINE 失败':template.defineStatus==='CANCELLED'?'DEFINE 已中止':'';
          return <article className={`catalog-card ${state.terminated?'terminated':''} ${state.todo?'has-todo':''}`} key={template.id}>
            <Link to={`/templates/${template.id}`} aria-label={`打开${template.name}`}>
            <div className="catalog-image"><img className={template.name==='童趣插画'?'cover-focus-lower':''} src={template.coverImageUrl} alt={template.name}/></div>
            <div className="catalog-meta">
              <div>
                <div className="eyebrow">{String(index+1).padStart(2,'0')} / {template.alias||'Template'}</div>
                <h2 className="catalog-title">{template.name}</h2>
                <p className="catalog-desc">{template.usageScenario}</p>
              </div>
              {defineBadge?<span className={`pill define-status-${template.defineStatus?.toLowerCase()}`} title={template.defineError||defineBadge}><span className="dot"/>{defineBadge}</span>:state.todo?<span className="template-todo" title={state.todo}>待处理</span>:<span className={`pill status-${status}`}><span className="dot"/>{status}</span>}
            </div>
            </Link>
          </article>;
        })}
      </section>
      {shown.length===0&&<div className="empty-state">没有符合当前条件的模板</div>}
    </main>
  </div>;
}
