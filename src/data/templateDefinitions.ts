import handJournal from './fit/shouzhang-spec.json';
import perler from './fit/perler-spec.json';
import { mockData } from './mockData';
import type { DefineSpec } from '@/types';
import { useAppStore } from '@/store/appStore';

const magazineRules=[
  {id:'T01',name:'封面成品形式',text:'输出应是一张完整、可独立使用的杂志封面，而不是排版草稿或素材拼贴。',priority:'MUST',score2:'完整杂志封面成立。',score1:'封面成立，但仍有轻微草稿感。',score0:'未形成可用的杂志封面。'},
  {id:'V01',name:'标题可读性',text:'主标题与必要副标题应清晰可读，字形稳定，不出现乱码、重影或断裂。',priority:'MUST',score2:'主要文字准确清晰。',score1:'少量次要文字有瑕疵。',score0:'主标题错误或不可读。'},
  {id:'V02',name:'信息层级',text:'标题、主体图像与辅助信息应形成明确的阅读顺序和杂志封面层级。',priority:'MUST',score2:'层级明确且阅读顺畅。',score1:'层级成立但局部拥挤。',score0:'层级混乱或信息冲突。'},
  {id:'V03',name:'文字准确度',text:'用户提供的关键文字应准确保留，大小写、数字与标点不应被擅自改写。',priority:'PREFERRED',score2:'关键文字完全准确。',score1:'存在轻微拼写或标点偏差。',score0:'关键文字明显错误。'},
  {id:'V04',name:'图文平衡',text:'人物或产品主体与标题之间应保持清楚边界，避免遮挡面部和核心识别区域。',priority:'PREFERRED',score2:'图文关系平衡且无遮挡。',score1:'局部距离偏紧或轻微遮挡。',score0:'核心主体被明显遮挡。'},
  {id:'V05',name:'风格一致性',text:'字体、色彩、装饰线与版面网格应共同形成统一的当代编辑设计语言。',priority:'PREFERRED',score2:'视觉语言完整统一。',score1:'少量元素风格游离。',score0:'风格明显混杂。'},
  {id:'V06',name:'版面完成度',text:'边距、对齐、留白和细节应达到可发布封面的完成度。',priority:'PREFERRED',score2:'版面精致，可直接发布。',score1:'整体可用但细节仍需整理。',score0:'存在明显排版缺陷。'},
] as const;

const magazine={...handJournal,templateName:'杂志风格',usageScenario:'将人物、产品或主题图片转换为具有明确标题层级的现代杂志封面。',targetVisual:'生成一张图文层级清楚、版面完整且具有当代编辑设计感的杂志封面。',heroReference:'R01',
  templateRules:magazineRules.filter(rule=>rule.id.startsWith('T')),
  visualQualityRules:magazineRules.filter(rule=>rule.id.startsWith('V')),
  promptRuleMap:[
    {sentence:'基于用户输入图片，生成一张可独立发布的竖版现代杂志封面。',ruleIds:['T01']},
    {sentence:'准确呈现标题与必要副标题，保持文字清晰、字形稳定，并保留用户提供的关键拼写、数字和标点。',ruleIds:['V01','V03']},
    {sentence:'使用明确的编辑网格组织标题、主体图像和辅助信息，建立清楚的阅读顺序。',ruleIds:['V02']},
    {sentence:'避免文字遮挡人物面部或产品核心区域，保持图文边界和呼吸留白。',ruleIds:['V04']},
    {sentence:'统一字体、有限配色、装饰线和边距对齐，使整体达到精致且可发布的杂志版面完成度。',ruleIds:['V05','V06']},
  ],
  fitTestPlan:{...handJournal.fitTestPlan,summary:'覆盖单主体、多人、产品、复杂背景与长标题输入，重点验证文字准确度和版面稳定性。',rows:handJournal.fitTestPlan.rows.map((row,index)=>({...row,inputDescription:['单主体人物与短标题','产品主体与品牌短句','多人场景与双层标题','复杂背景与较长标题'][index]||row.inputDescription,challengeVariable:['标题可读性','产品与文字边界','多人遮挡与层级','复杂文字的准确保留'][index]||row.challengeVariable}))},
};

// Explicit template ownership: a missing definition must never inherit another style.
export function getDefinitionReport(templateId?:string){
  const generated=useAppStore.getState().templates.find(template=>template.id===templateId)?.aiDefinition;
  if(generated)return generated;
  return templateId==='template-001'?handJournal:templateId==='template-perler'?perler:templateId==='template-003'?magazine:undefined;
}

export function getDefineSpec(templateId?:string):DefineSpec|undefined{
  const run=mockData.runs.filter(r=>r.templateCaseId===templateId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const baseline=mockData.defineSpecs.find(s=>s.runId===run?.id)||(templateId==='template-perler'&&run?{id:'perler-define-004',runId:run.id,version:'v0.0',usageScenario:'',runtimeInputType:'单张图片',references:[],templateDescription:'',rules:[],promptVersion:'0.0',promptHash:'',specHash:'',status:'BASELINE' as const,createdAt:run.createdAt,updatedAt:run.updatedAt}:undefined);
  const report=getDefinitionReport(templateId);
  if(!report||!baseline)return baseline;
  return {...baseline,usageScenario:report.usageScenario,runtimeInputType:'单张图片',templateDescription:report.targetVisual,promptVersion:report.promptVersion,version:`v${report.promptVersion}`,
    references:templateId==='template-perler'?[1,2,3,4,5,6].map(i=>({id:`R0${i}`,url:`/images/perler-references/R0${i}.png`,filename:`R0${i}`,uploadedAt:baseline.createdAt})):[4,1,2,3].map((asset,i)=>({id:`R0${i+1}`,url:`/images/figma-detail-${asset}.png`,filename:`R0${i+1}`,uploadedAt:baseline.createdAt})),heroReference:report.heroReference,
    rules:[...report.templateRules,...report.visualQualityRules].map(rule=>({id:rule.id,code:rule.id,type:(('category' in rule&&rule.category==='C1')||rule.id.startsWith('T'))?'T':'V',severity:rule.priority==='MUST'?'MUST':'PREFERRED',content:rule.text,priority:'P0',applicability:['P0','P1','P2'],createdAt:baseline.createdAt,updatedAt:baseline.updatedAt})),
  };
}
