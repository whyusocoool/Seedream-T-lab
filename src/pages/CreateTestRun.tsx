import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { useAppStore } from '@/store/appStore';
import { useFitStore } from '@/store/fitStore';
import { canViewTemplate } from '@/data/templateVisibility';
import { getDefinitionReport } from '@/data/templateDefinitions';
import { canEditTemplate } from '@/data/templateAccess';

type LocationState = { assets?: Array<{url:string;assetPath?:string}> };
const seedreamModels=[
  {id:'Seedream 3.0',summary:'稳定高效，适合构图明确的日常通用图像生成。'},
  {id:'Seedream 4.0',summary:'擅长遵循复杂提示词，并兼顾画面质感与细节表现。'},
  {id:'Seedream 4.5',summary:'擅长多主体关系、复杂构图和更精细的视觉风格控制。'},
  {id:'Seedream 5.0 Preview',summary:'面向高品质探索，擅长复杂创意理解与高完成度画面。'},
  {id:'Seedream 5.0 Lite',summary:'侧重速度与效率，适合批量测试和快速迭代。'},
];

export default function CreateTestRun(){
  const nav=useNavigate();
  const location=useLocation();
  const templates=useAppStore(s=>s.templates);
  const user=useAppStore(s=>s.currentUser);
  const start=useFitStore(s=>s.start);
  const inputs=(location.state as LocationState|null)?.assets||[];
  const [templateId,setTemplateId]=useState('');
  const [step,setStep]=useState<1|2>(1);
  const [model,setModel]=useState('');
  const availableTemplates=useMemo(
    ()=>templates.filter(template=>user&&canViewTemplate(template,user.role,user.id)&&canEditTemplate(template,user.id,user.role)),
    [templates,user],
  );
  const selectedTemplate=useMemo(()=>availableTemplates.find(t=>t.id===templateId),[availableTemplates,templateId]);
  const latestPrompt=selectedTemplate?getDefinitionReport(selectedTemplate.id)?.seedreamPrompt:'';

  const createRun=()=>{
    if(!selectedTemplate||!model)return;
    start(selectedTemplate.id,inputs,model);
    nav(`/templates/${selectedTemplate.id}/fit`);
  };

  return <><AppHeader/><main className="test-create-page">
    <section className="test-input-panel">
      <div><div className="eyebrow">NEW TEST RUN / INPUT</div><h1>打包测试</h1><p>画布中选中的图片将作为这一轮测试的 input。</p></div>
      <div className="test-input-grid">{inputs.map((input,i)=><div className="test-input-thumb" key={`${input.url}-${i}`}><img src={input.url} alt={`测试输入 ${i+1}`}/><span>{String(i+1).padStart(2,'0')}</span></div>)}</div>
      <button className="btn back-btn" onClick={()=>nav('/canvas')}>← 返回画布</button>
    </section>
    <section className="test-template-panel">
      {step===1?<><div className="section-head compact"><div><div className="eyebrow">TARGET TEMPLATE</div><h2>选择要测试的模板</h2></div><span className="eyebrow">单选</span></div>
      <div className="test-template-list simple">{availableTemplates.map(template=><button key={template.id} className={`test-template-option ${templateId===template.id?'selected':''}`} onClick={()=>setTemplateId(template.id)}>
        <div className="test-template-cover">{template.coverImageUrl&&<img src={template.coverImageUrl} alt=""/>}</div>
        <h3>{template.name}</h3><span className="template-check">{templateId===template.id?'✓':''}</span>
      </button>)}</div>
      <div className="test-create-actions"><span>{selectedTemplate?`已选择「${selectedTemplate.name}」`:'请先选择一个模板'}</span><button className="btn primary" disabled={!selectedTemplate} onClick={()=>setStep(2)}>下一步 →</button></div></>:selectedTemplate&&<><div className="test-config-summary"><div className="test-config-template"><div className="test-config-cover">{selectedTemplate.coverImageUrl&&<img src={selectedTemplate.coverImageUrl} alt=""/>}</div><div><span className="eyebrow">TARGET TEMPLATE</span><h2>{selectedTemplate.name}</h2><p>{selectedTemplate.usageScenario}</p></div></div><div className="test-config-prompt"><span className="eyebrow">LATEST PROMPT</span><p>{latestPrompt||'该模板尚未记录 Prompt。'}</p></div></div><div className="model-select"><div className="section-head compact"><div><div className="eyebrow">SEEDREAM MODEL</div><h2>选择测试模型</h2></div><span className="eyebrow">单选</span></div><div className="model-options">{seedreamModels.map(option=><button key={option.id} className={model===option.id?'selected':''} onClick={()=>setModel(option.id)}><span><strong>{option.id}</strong><small>{option.summary}</small></span><b>{model===option.id?'✓':''}</b></button>)}</div></div><div className="test-create-actions"><button className="btn" onClick={()=>setStep(1)}>← 上一步</button><button className="btn primary" disabled={!model||!inputs.length} onClick={createRun}>创建测试 Run →</button></div></>}
    </section>
  </main></>;
}
