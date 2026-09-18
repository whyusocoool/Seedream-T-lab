import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { chmod, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const execFileAsync = promisify(execFile);

type StateFile = Record<string, unknown>;

type ProviderPresetId = 'agnes' | 'custom';

type AIProviderConfig = {
  imageProvider?: 'seedream' | 'agnes';
  agnesImageModel?: string;
  presetId: ProviderPresetId;
  baseUrl: string;
  multimodalModel: string;
  seedreamBaseUrl: string;
  seedreamModel: string;
};

type AISecrets = {
  apiKey: string;
  seedreamApiKey: string;
};

type AIRequestBody = Record<string, unknown>;

const AGNES_CONFIG: AIProviderConfig = {
  presetId: 'agnes',
  baseUrl: 'https://apihub.agnes-ai.com/v1',
  multimodalModel: 'agnes-2.5-flash',
  seedreamBaseUrl: '',
  seedreamModel: '',
};

const SEEDREAM_DEFAULT: Pick<AIProviderConfig, 'seedreamBaseUrl' | 'seedreamModel'> = {
  seedreamBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  seedreamModel: 'seedream-4-5-251128',
};

const send = (response: ServerResponse, status: number, body: unknown): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const readBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > 80 * 1024 * 1024) { reject(new Error('Payload too large')); request.destroy(); return; }
    chunks.push(chunk);
  });
  request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  request.on('error', reject);
});

const parseJsonBody = async (request: IncomingMessage): Promise<AIRequestBody> => {
  const raw = await readBody(request);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON body');
  return parsed as AIRequestBody;
};

const isProviderPresetId = (value: unknown): value is ProviderPresetId => value === 'agnes' || value === 'custom';

const presetConfig = (presetId: ProviderPresetId): AIProviderConfig => {
  if (presetId === 'agnes') return { ...AGNES_CONFIG };
  return { presetId: 'custom', baseUrl: '', multimodalModel: '', seedreamBaseUrl: '', seedreamModel: '' };
};

const cleanString = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const normalizeBaseUrl = (value: unknown): string => {
  const baseUrl = cleanString(value, 500).replace(/\/+$/, '');
  if (!baseUrl) return '';
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error('Base URL 不是有效地址'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Base URL 只支持 http 或 https');
  if (parsed.username || parsed.password) throw new Error('Base URL 不能包含账号或密码');
  return parsed.toString().replace(/\/+$/, '');
};

const normalizeConfig = (value: Partial<AIProviderConfig>): AIProviderConfig => {
  const requestedPresetId = isProviderPresetId(value.presetId) ? value.presetId : 'agnes';
  const defaults = presetConfig(requestedPresetId);
  return {
    presetId: requestedPresetId,
    imageProvider: value.imageProvider === 'agnes' ? 'agnes' : 'seedream',
    agnesImageModel: cleanString(value.agnesImageModel, 200),
    baseUrl: normalizeBaseUrl(value.baseUrl || defaults.baseUrl),
    multimodalModel: cleanString(value.multimodalModel || (value as Partial<AIProviderConfig> & { chatModel?: unknown }).chatModel || defaults.multimodalModel, 200),
    seedreamBaseUrl: normalizeBaseUrl(value.seedreamBaseUrl || defaults.seedreamBaseUrl || SEEDREAM_DEFAULT.seedreamBaseUrl),
    seedreamModel: cleanString(value.seedreamModel || defaults.seedreamModel || SEEDREAM_DEFAULT.seedreamModel, 200),
  };
};

const maskApiKey = (apiKey: string): string => {
  const key = apiKey.trim();
  if (!key) return '';
  if (key.length <= 8) return `${key[0] ?? '•'}${'•'.repeat(Math.max(4, key.length - 1))}`;
  return `${key.slice(0, 4)}${'•'.repeat(6)}${key.slice(-4)}`;
};

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await readFile(filePath, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
};

const secureWriteJson = async <T>(filePath: string, value: T, directory: string): Promise<void> => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await chmod(directory, 0o700); } catch { /* chmod not supported on some filesystems */ }
  const temporary = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, filePath);
  await chmod(filePath, 0o600);
};

const joinApiUrl = (baseUrl: string, endpoint: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

const isLocalOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1');
  } catch { return false; }
};

const errorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return 'AI 请求失败';
  if (error.message !== 'fetch failed') return error.message;
  const cause = error.cause as { code?: unknown; message?: unknown } | undefined;
  const detail = typeof cause?.code === 'string'
    ? cause.code
    : typeof cause?.message === 'string'
      ? cause.message.slice(0, 160)
      : '';
  return `无法连接 AI 服务${detail ? `（${detail}）` : ''}。请检查 Base URL 和网络/VPN；如使用 VPN，需确保本机 Node 进程也能访问该地址。`;
};

const upstreamError = async (response: Response): Promise<Error> => {
  let message = `AI 服务返回 HTTP ${response.status}`;
  try {
    const payload = await response.json() as { error?: { message?: string } | string; message?: string };
    const nested = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    const detail = nested || payload.message;
    if (detail) message = `${message}: ${String(detail).slice(0, 500)}`;
  } catch { /* swallow upstream body */ }
  return new Error(message);
};

const callUpstream = async (
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  body: unknown,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(joinApiUrl(baseUrl, endpoint), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw await upstreamError(response);
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI 请求超时，请稍后重试');
    throw error;
  } finally { clearTimeout(timeout); }
};

const extractMessageText = (payload: unknown): string => {
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> })?.choices;
  const content = choices?.[0]?.message?.content ?? choices?.[0]?.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text ?? '');
      return '';
    }).join('');
  }
  return '';
};

const modelOutputDiagnostic = (payload: unknown, text: string): string => {
  const choice = (payload as { choices?: Array<{ finish_reason?: unknown }> })?.choices?.[0];
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '未提供';
  const normalized = text.replace(/\s+/g, ' ').trim();
  const preview = normalized ? normalized.slice(0, 700) : '（空响应）';
  return `finish_reason=${finishReason}；内容长度=${text.length}；返回片段：${preview}`;
};

const parseModelJson = (text: string): Record<string, unknown> => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  throw new Error(text.trim() ? '模型返回的内容不是完整、可解析的 JSON 对象' : '模型返回内容为空');
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 12) : [];

const styleSummaryFromModel = (payload: Record<string, unknown>, model: string, imageCount: number) => {
  const features = Array.isArray(payload.stableFeatures) ? payload.stableFeatures : [];
  const stableFeatures = features.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const feature = item as { name?: unknown; description?: unknown };
    if (typeof feature.name !== 'string' || typeof feature.description !== 'string') return [];
    return [{ name: feature.name.slice(0, 100), description: feature.description.slice(0, 500) }];
  }).slice(0, 12);
  return {
    summary: {
      title: typeof payload.title === 'string' ? payload.title.slice(0, 120) : '未命名视觉方向',
      visualSummary: typeof payload.visualSummary === 'string' ? payload.visualSummary.slice(0, 1500) : '',
      stableFeatures,
      allowedVariations: stringList(payload.allowedVariations),
      negativeConstraints: stringList(payload.negativeConstraints),
      prompt: typeof payload.prompt === 'string' ? payload.prompt.slice(0, 4000) : '',
    },
    model,
    imageCount,
  };
};

const styleSystemPrompt = `你是一名严格的视觉设计分析师。用户会提供 1-6 张同一视觉方向的参考图。
请只返回 JSON，不要 Markdown，不要解释文字，格式必须是：
{
  "title": "不超过 30 字的风格名称",
  "visualSummary": "用中文总结主体、构图、材质、色彩、光线、文字和写实程度",
  "stableFeatures": [{"name":"稳定特征名称","description":"为什么它在参考图中稳定"}],
  "allowedVariations": ["参考图之间允许变化的维度"],
  "negativeConstraints": ["生成时应避免的明显偏差"],
  "prompt": "一段可以直接给图片模型使用的中文生成提示词"
}
规则：stableFeatures 至少 4 条；必须区分稳定特征和允许变化；不要臆造参考图中看不到的品牌、文字或事实；prompt 不能写成泛泛的风格标签。`;

const definitionCriteriaIds=[
  'C1.01','C1.02','C1.03','C1.04','C1.05','C2.01','C2.02','C2.03','C2.04','C2.05','C2.06','C2.07',
  'C3.01','C3.02','C3.03','C3.04','C3.05','C3.06','C3.07','C4.01','C4.02','C4.03','C4.04','C4.05',
  'C5.01','C5.02','C5.03','C5.04','C5.05',
];

const loadTemplateSkillPrompt=async()=>{
  const codexRoot=process.env.CODEX_HOME||'/Users/a14110/.codex';
  const root=process.env.SEEDREAM_TEMPLATE_SKILL_DIR||path.join(codexRoot,'skills','seedream-template-spec-v2-1');
  const files=['SKILL.md','references/seedream-prompt-guide.md','references/define-rules-v2.md','references/review-output-v2.md','references/traversal-v2.json','schemas/template-spec-v04.schema.json'];
  try{
    const contents=await Promise.all(files.map(async file=>`\n\n===== ${file} =====\n${await readFile(path.join(root,file),'utf8')}`));
    return `你正在执行本机已安装的 Seedream Template Spec v2.1。以下全部文件是强制规范，不得用普通风格总结代替。${contents.join('')}`;
  }catch{
    throw new Error('未找到 Template Spec v2.1 技能文件，请配置 SEEDREAM_TEMPLATE_SKILL_DIR；不会降级使用旧版规范。');
  }
};

// Quantitative gates are owned by v2.1, not a separate frontend approximation.
const assessDefinition=async(payload:Record<string,unknown>,imageCount:number)=>{
  if(Array.isArray(payload.rules)&&payload.reviewReport){
    const rows=payload.traversal as Array<{checkId:string}>;
    const rules=payload.rules as Array<{id:string}>;
    const review=payload.reviewReport as {ruleEvidence:Array<{ruleIds:string[];checkIds:string[];evidence:Array<{refId:string;score:number;observable?:boolean}>}>};
    const referenceIds=Array.from({length:imageCount},(_,i)=>`REF${String(i+1).padStart(2,'0')}`);
    if(!Array.isArray(rows)||rows.length!==29||new Set(rows.map(row=>row.checkId)).size!==29||definitionCriteriaIds.some(id=>!rows.some(row=>row.checkId===id)))throw new Error('v2.1 预检查缺少完整的29项 Criteria');
    if(rules.length>12||new Set(rules.map(rule=>rule.id)).size!==rules.length)throw new Error('预检查 Rules 不得超过12条且编号不能重复');
    const references=payload.references as Array<{id:string}>;
    if(!Array.isArray(references)||references.length!==imageCount||new Set(references.map(ref=>ref.id)).size!==imageCount||references.some(ref=>!referenceIds.includes(ref.id)))throw new Error('预检查参考图编号不完整');
    if(!Array.isArray(review.ruleEvidence)||rules.some(rule=>!review.ruleEvidence.some(row=>row.ruleIds.includes(rule.id))))throw new Error('预检查缺少 Rule 逐图证据');
    for(const row of review.ruleEvidence){
      if(row.ruleIds.some(id=>!rules.some(rule=>rule.id===id))||row.checkIds.some(id=>!definitionCriteriaIds.includes(id))||row.evidence.length!==imageCount||new Set(row.evidence.map(ref=>ref.refId)).size!==imageCount||row.evidence.some(ref=>!referenceIds.includes(ref.refId)||![0,1,2].includes(ref.score)))throw new Error('预检查逐图证据引用错误或不完整');
    }
    const root=process.env.SEEDREAM_TEMPLATE_SKILL_DIR||path.join(process.env.CODEX_HOME||'/Users/a14110/.codex','skills','seedream-template-spec-v2-1');
    const {stdout}=await execFileAsync(process.env.SEEDREAM_PYTHON||'python3',['-B','-c','import sys,json; sys.path.insert(0,sys.argv[1]); from define_v04 import definition_assessment; print(json.dumps(definition_assessment(json.loads(sys.argv[2]))))',path.join(root,'scripts'),JSON.stringify(payload)],{maxBuffer:1024*1024});
    return JSON.parse(stdout) as {definable:boolean;convergence:number;qualifiedRuleIds:string[];ruleSetPassed:boolean};
  }
  throw new Error('预检查未遵循 v2.1 的 rules / reviewReport 结构');
};

const validateDefinition=async(payload:Record<string,unknown>,imageCount:number)=>{
  if(Array.isArray(payload.rules)&&payload.reviewReport){
    const root=process.env.SEEDREAM_TEMPLATE_SKILL_DIR||path.join(process.env.CODEX_HOME||'/Users/a14110/.codex','skills','seedream-template-spec-v2-1');
    try{await execFileAsync(process.env.SEEDREAM_PYTHON||'python3',['-B','-c','import sys,json; sys.path.insert(0,sys.argv[1]); from define_v04 import validate; validate(json.loads(sys.argv[2]))',path.join(root,'scripts'),JSON.stringify(payload)],{maxBuffer:1024*1024});}
    catch(error){throw new Error(`v2.1 事实源校验失败：${(error as {stderr?:string}).stderr||errorMessage(error)}`);}
    const assessment=await assessDefinition(payload,imageCount);
    const rules=payload.rules as Array<Record<string,unknown>>;
    const traversal=payload.traversal as Array<{checkId:string;findings:Array<{decision:string;observation:string;reason:string;ruleIds:string[]}>}>;
    const review=payload.reviewReport as {version:string;ruleStatus:string;uxConfirmation:string;ruleEvidence:Array<{ruleIds:string[];evidence:Array<{refId:string;score:number;observable?:boolean;observation:string}>}>;testMaterials:Array<{tier:string;definition:string;items:string[]}>};
    if(review.version!=='2'||review.ruleStatus!=='DRAFT'||review.uxConfirmation)throw new Error('初版必须是 reviewReport v2 的待 UX 确认草案');
    if(rules.length>12||rules.length<4||rules.some(rule=>rule.evidence))throw new Error('新 v2.1 Rules 需为4–12条，不重复存储 evidence');
    const displayRules:Array<Record<string,unknown>>=rules.map(rule=>({...rule,score2:rule.priority==='MUST'?rule.score1:rule.score2,criteriaIds:traversal.filter(row=>row.findings.some(f=>f.ruleIds.includes(String(rule.id)))).map(row=>row.checkId)}));
    const material=(tier:string)=>review.testMaterials.find(row=>row.tier===tier)?.items||[];
    // sourceSpec remains the authoritative v2.1 JSON; the other fields are a legacy UI projection.
    return {sourceSpec:payload,templateName:payload.templateName,usageScenario:payload.usageScenario,targetVisual:payload.targetVisual,heroReference:payload.heroReference,promptVersion:payload.promptVersion,seedreamPrompt:payload.seedreamPrompt,promptRuleMap:payload.promptRuleMap,promptGuideReview:{...(payload.promptGuideReview as Record<string,unknown>),knowledgeVersion:'2026-09-10.1',modules:[],techniques:[]},
      fitTestPlan:{summary:'A 核心场景 / B 拓展场景 / C 边缘场景：以下为素材建议，供测试人员参考。',rows:review.testMaterials.flatMap(row=>row.items.map((item,index)=>({testId:`${row.tier}-${String(index+1).padStart(2,'0')}`,tier:row.tier,inputDescription:item,challengeVariable:row.definition,inputCount:1,runsPerInput:1,totalOutputs:1})))},specVersion:'0.4',definitionStatus:assessment.definable?'可定义':'待补充',criteriaConvergence:Math.round(assessment.convergence*100),effectiveRuleCount:assessment.qualifiedRuleIds.length,
      runtimeInput:payload.inputSummary||payload.runtimeInput,
      traversal:traversal.map(row=>({criteriaId:row.checkId,criteriaName:row.findings.map(f=>f.observation).join('；'),disposition:row.findings[0]?.decision||'UNOBSERVABLE',rationale:row.findings.map(f=>f.reason).join('；'),ruleIds:[...new Set(row.findings.flatMap(f=>f.ruleIds))]})),
      templateRules:displayRules.filter(rule=>!['C2','C3'].includes(String(rule.category))),visualQualityRules:displayRules.filter(rule=>['C2','C3'].includes(String(rule.category))),
      ruleEvidence:rules.map(rule=>({ruleId:rule.id,references:review.ruleEvidence.filter(row=>row.ruleIds.includes(String(rule.id))).flatMap(row=>row.evidence.map(ref=>({referenceId:ref.refId,observable:ref.observable!==false,support:ref.score===2?1:0,rationale:ref.observation})))})),
      initialApplicability:{p0Advantage:material('P0'),p1Supported:material('P1'),p2BoundaryNotRecommended:material('P2')},
    };
  }
  throw new Error('完整报告未遵循 v2.1 JSON 事实源结构');
};

const definitionOutputContract=`只返回符合随包 schemas/template-spec-v04.schema.json 的完整 JSON，不要 Markdown。
必须使用 specVersion="0.4"，reviewReport.version="2"、ruleStatus="DRAFT"、uxConfirmation=""。
唯一事实源为 traversal[].findings、rules、reviewReport.ruleEvidence；禁止写 rules[].evidence、referenceConsistency、templateRules、visualQualityRules 或派生百分比。
29项 Criteria 全覆盖；Rules 4–12条，通常7–10条，合并同一底层属性的重复计分项。MUST 的 score1 为通过，score0 为不通过，score2 保留兼容且三项文本不同。
reviewReport.testMaterials 为6/6/4的A/B/C素材建议；旧 fitTestPlan/tuneTestPlan 只填写 schema 必需兼容字段，不当作新任务。
依据预检查事实完成 Prompt、评分卡与映射，不重复分析图片，不凭空确认 UX 意图，初始 Prompt 未实测。`;

const describeImage = async (
  baseUrl: string,
  apiKey: string,
  model: string,
  imageDataUrl: string,
  userPrompt: string,
): Promise<string> => {
  const payload = await callUpstream(baseUrl, apiKey, 'chat/completions', {
    model,
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: '你是图片生成前的视觉描述助手。只描述可观察到的主体、构图、色彩、材质和重要空间关系，不要编造文字。' },
      { role: 'user', content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ] },
    ],
  });
  return extractMessageText(payload).slice(0, 6000);
};

const imageResults = (payload: unknown): Array<{ url?: string; dataUrl?: string; revisedPrompt?: string }> => {
  const data = (payload as { data?: Array<{ url?: unknown; b64_json?: unknown; revised_prompt?: unknown }> })?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const result: { url?: string; dataUrl?: string; revisedPrompt?: string } = {};
    if (typeof item.url === 'string') result.url = item.url;
    if (typeof item.b64_json === 'string') result.dataUrl = `data:image/png;base64,${item.b64_json}`;
    if (typeof item.revised_prompt === 'string') result.revisedPrompt = item.revised_prompt;
    return result.url || result.dataUrl ? [result] : [];
  });
};

// ── Per-user keychain & file paths ─────────────────────────────────────────────

const aiMiddleware = (options: { dataDirectory: string }) => {
  const activeDefinitions=new Set<string>();
  const definitionByTemplate=new Map<string,string>();
  type DefinitionJob={id:string;templateId:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';phase:string;failedPhase?:string;startedAt:string;updatedAt:string;history:Array<{phase:string;at:string}>;result?:unknown;error?:string;outputs?:Array<{stage:string;text:string}>};
  const jobPath=(user:string,id:string)=>path.join(options.dataDirectory,`define-job-${user}-${id}.json`);
  const saveJob=(user:string,job:DefinitionJob)=>secureWriteJson(jobPath(user,job.id),job,options.dataDirectory);
  const sessionToken = randomBytes(32).toString('hex');
  const keychainService = 'seedream-workbench-ai';
  const keychainAccountPrefix = process.env.USER || 'local-user';
  let aiWriteQueue = Promise.resolve();

  const normalizeUserId = (value: string | undefined): string => {
    const normalized = (value || 'guest').trim();
    return /^[a-zA-Z0-9_-]{1,128}$/.test(normalized) ? normalized : 'guest';
  };

  const pathsFor = (userId: string) => ({
    configPath: path.join(options.dataDirectory, `ai-provider-${userId}.json`),
    verificationPath: path.join(options.dataDirectory, `ai-verification-${userId}.json`),
    secretsPath: path.join(options.dataDirectory, `ai-secrets-${userId}.json`),
    keychainAccount: `${keychainAccountPrefix}:${userId}`,
    seedreamConfigPath: path.join(options.dataDirectory, `seedream-${userId}.json`),
    seedreamSecretsPath: path.join(options.dataDirectory, `seedream-secrets-${userId}.json`),
    seedreamKeychainAccount: `${keychainAccountPrefix}:seedream:${userId}`,
    agnesImageSecretsPath: path.join(options.dataDirectory, `agnes-image-secrets-${userId}.json`),
    agnesImageKeychainAccount: `${keychainAccountPrefix}:agnes-image:${userId}`,
  });

  const loadConfig = (userId: string) =>
    readJsonFile<AIProviderConfig>(pathsFor(userId).configPath, AGNES_CONFIG).then(normalizeConfig);

  const isMacOS = process.platform === 'darwin';

  const readKeychain = async (account: string): Promise<string> => {
    if (!isMacOS) return '';
    try {
      const result = await execFileAsync('/usr/bin/security', ['find-generic-password', '-a', account, '-s', keychainService, '-w']);
      return result.stdout.trim();
    } catch { return ''; }
  };

  const loadSecrets = async (userId: string): Promise<AISecrets> => {
    const { secretsPath, keychainAccount } = pathsFor(userId);
    const keychainKey = await readKeychain(keychainAccount);
    if (keychainKey) return { apiKey: keychainKey, seedreamApiKey: '' };
    if (isMacOS) return { apiKey: '', seedreamApiKey: '' };
    return readJsonFile<AISecrets>(secretsPath, { apiKey: '', seedreamApiKey: '' });
  };

  const writeKeychain = async (account: string, apiKey: string): Promise<void> => {
    if (!isMacOS) return;
    try { await execFileAsync('/usr/bin/security', ['delete-generic-password', '-a', account, '-s', keychainService]); } catch { /* ok if not exists */ }
    if (apiKey) await execFileAsync('/usr/bin/security', ['add-generic-password', '-U', '-a', account, '-s', keychainService, '-w', apiKey]);
  };

  const saveConfig = (userId: string, config: AIProviderConfig) => {
    const { configPath } = pathsFor(userId);
    aiWriteQueue = aiWriteQueue.then(() => secureWriteJson(configPath, config, options.dataDirectory));
    return aiWriteQueue;
  };

  const saveSecrets = (userId: string, secrets: AISecrets) => {
    aiWriteQueue = aiWriteQueue.then(async () => {
      const { keychainAccount, secretsPath } = pathsFor(userId);
      if (isMacOS) {
        await writeKeychain(keychainAccount, secrets.apiKey);
        return;
      }
      await secureWriteJson(secretsPath, secrets, options.dataDirectory);
    });
    return aiWriteQueue;
  };

  // Seedream: model config (in plaintext json, no keychain)
  const loadSeedreamConfig = (userId: string) =>
    readJsonFile<Pick<AIProviderConfig, 'seedreamBaseUrl' | 'seedreamModel'>>(
      pathsFor(userId).seedreamConfigPath, { ...SEEDREAM_DEFAULT },
    );

  const saveSeedreamConfig = (userId: string, config: Pick<AIProviderConfig, 'seedreamBaseUrl' | 'seedreamModel'>) => {
    const { seedreamConfigPath } = pathsFor(userId);
    aiWriteQueue = aiWriteQueue.then(() => secureWriteJson(seedreamConfigPath, config, options.dataDirectory));
    return aiWriteQueue;
  };

  const loadSeedreamSecrets = async (userId: string): Promise<{ seedreamApiKey: string }> => {
    const { seedreamSecretsPath, seedreamKeychainAccount } = pathsFor(userId);
    const keychainKey = await readKeychain(seedreamKeychainAccount);
    if (keychainKey) return { seedreamApiKey: keychainKey };
    if (isMacOS) return { seedreamApiKey: '' };
    return readJsonFile<{ seedreamApiKey: string }>(seedreamSecretsPath, { seedreamApiKey: '' });
  };

  const saveSeedreamSecrets = (userId: string, secrets: { seedreamApiKey: string }) => {
    aiWriteQueue = aiWriteQueue.then(async () => {
      const { seedreamSecretsPath, seedreamKeychainAccount } = pathsFor(userId);
      if (isMacOS) {
        await writeKeychain(seedreamKeychainAccount, secrets.seedreamApiKey);
        return;
      }
      await secureWriteJson(seedreamSecretsPath, secrets, options.dataDirectory);
    });
    return aiWriteQueue;
  };

  const loadAgnesImageKey = async (userId: string): Promise<string> => {
    const paths = pathsFor(userId);
    if (isMacOS) return readKeychain(paths.agnesImageKeychainAccount);
    return (await readJsonFile<{ apiKey: string }>(paths.agnesImageSecretsPath, { apiKey: '' })).apiKey;
  };
  const saveAgnesImageKey = (userId: string, apiKey: string) => {
    aiWriteQueue = aiWriteQueue.then(async () => {
      const paths = pathsFor(userId);
      if (isMacOS) await writeKeychain(paths.agnesImageKeychainAccount, apiKey);
      else await secureWriteJson(paths.agnesImageSecretsPath, { apiKey }, options.dataDirectory);
    });
    return aiWriteQueue;
  };
  const publicSettings = async (userId: string) => {
    const agnesImageKey = await loadAgnesImageKey(userId);
    const [config, secrets, seedreamConfig, seedreamSecrets] = await Promise.all([
      loadConfig(userId), loadSecrets(userId), loadSeedreamConfig(userId), loadSeedreamSecrets(userId),
    ]);
    const verification = await readJsonFile<Record<string, string>>(pathsFor(userId).verificationPath, {});
    const fingerprint = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
    const analysisFingerprint = fingerprint([config.presetId, config.baseUrl, config.multimodalModel, secrets.apiKey]);
    const seedreamFingerprint = fingerprint([seedreamConfig.seedreamBaseUrl, seedreamConfig.seedreamModel, seedreamSecrets.seedreamApiKey]);
    const agnesFingerprint = fingerprint([AGNES_CONFIG.baseUrl, config.agnesImageModel || '', agnesImageKey]);
    return {
      ...config,
      seedreamBaseUrl: seedreamConfig.seedreamBaseUrl,
      seedreamModel: seedreamConfig.seedreamModel,
      configured: Boolean(secrets.apiKey),
      analysisVerified: Boolean(secrets.apiKey) && verification.analysis === analysisFingerprint,
      seedreamVerified: Boolean(seedreamSecrets.seedreamApiKey) && verification.seedream === seedreamFingerprint,
      agnesImageVerified: Boolean(agnesImageKey) && verification.agnes === agnesFingerprint,
      agnesImageConfigured: Boolean(agnesImageKey),
      agnesImageApiKeyMask: maskApiKey(agnesImageKey),
      seedreamConfigured: Boolean(seedreamSecrets.seedreamApiKey),
      apiKeyMask: maskApiKey(secrets.apiKey),
      seedreamApiKeyMask: maskApiKey(seedreamSecrets.seedreamApiKey),
      updatedAt: new Date().toISOString(),
    };
  };

  const rejectIfNotLocal = (request: IncomingMessage, response: ServerResponse): boolean => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && !isLocalOrigin(origin)) {
      send(response, 403, { error: 'AI 本地接口只接受本机页面请求' }); return true;
    }
    return false;
  };

  const requireSession = (request: IncomingMessage, response: ServerResponse): boolean => {
    if (request.headers['x-seedream-session'] !== sessionToken) {
      send(response, 403, { error: '本地 AI 会话已失效，请刷新页面' }); return false;
    }
    return true;
  };

  const withProvider = async <T>(
    userId: string,
    callback: (config: AIProviderConfig, apiKey: string, seedreamConfig: Pick<AIProviderConfig, 'seedreamBaseUrl' | 'seedreamModel'>, seedreamApiKey: string) => Promise<T>,
  ): Promise<T> => {
    const [config, secrets, sConfig, sSecrets] = await Promise.all([
      loadConfig(userId), loadSecrets(userId), loadSeedreamConfig(userId), loadSeedreamSecrets(userId),
    ]);
    return callback(config, secrets.apiKey, sConfig, sSecrets.seedreamApiKey);
  };

  return async (request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> => {
    const url = new URL(request.url || '', 'http://localhost');
    if (!url.pathname.startsWith('/api/ai/')) { next(); return; }
    if (rejectIfNotLocal(request, response)) return;
    if (url.pathname === '/api/ai/session' && request.method === 'GET') {
      send(response, 200, { token: sessionToken }); return;
    }
    if (!requireSession(request, response)) return;

    const userId = normalizeUserId(request.headers['x-seedream-user']);

    try {
      if(url.pathname==='/api/ai/definition-jobs'&&request.method==='GET'){
        const files=await readdir(options.dataDirectory).catch(()=>[]);
        const jobs=await Promise.all(files.filter(file=>file.startsWith(`define-job-${userId}-`)&&file.endsWith('.json')).map(async file=>{
          const job=await readJsonFile(path.join(options.dataDirectory,file),null as DefinitionJob|null);
          if(job?.status==='RUNNING'&&!activeDefinitions.has(job.id)){
            job.status='FAILED';job.error='本地分析服务已重启，上一轮任务中断。请重新运行 DEFINE。';job.updatedAt=new Date().toISOString();await saveJob(userId,job);
          }
          return job;
        }));
        send(response,200,jobs.filter(Boolean));return;
      }
      // GET /api/ai/settings
      if (url.pathname === '/api/ai/settings' && request.method === 'GET') {
        send(response, 200, await publicSettings(userId)); return;
      }

      // PUT /api/ai/settings
      if (url.pathname === '/api/ai/settings' && request.method === 'PUT') {
        const body = await parseJsonBody(request);
        const current = await loadConfig(userId);
        const nextConfig = normalizeConfig({
          presetId: body.presetId ?? current.presetId,
          imageProvider: body.imageProvider === 'agnes' ? 'agnes' : body.imageProvider === 'seedream' ? 'seedream' : current.imageProvider,
          baseUrl: body.baseUrl ?? current.baseUrl,
          multimodalModel: body.multimodalModel ?? current.multimodalModel,
          seedreamBaseUrl: body.seedreamBaseUrl ?? current.seedreamBaseUrl ?? SEEDREAM_DEFAULT.seedreamBaseUrl,
          seedreamModel: body.seedreamModel ?? current.seedreamModel ?? SEEDREAM_DEFAULT.seedreamModel,
        });
        if (nextConfig.presetId === 'custom' && !nextConfig.baseUrl) throw new Error('自定义服务需要填写 Base URL');
        if (nextConfig.presetId === 'custom' && !nextConfig.multimodalModel) throw new Error('自定义服务需要填写多模态分析模型名');
        await saveConfig(userId, nextConfig);
        if (typeof body.apiKey === 'string') await saveSecrets(userId, { apiKey: body.apiKey.trim(), seedreamApiKey: '' });
        if (typeof body.seedreamApiKey === 'string') await saveSeedreamSecrets(userId, { seedreamApiKey: body.seedreamApiKey.trim() });
        if (body.reuseAgnesImageKey === true) {
          const source = await loadSecrets(userId);
          if (nextConfig.presetId !== 'agnes' || !source.apiKey) throw new Error('请先在分析模型中配置 Agnes Key，再点击复用');
          await saveAgnesImageKey(userId, source.apiKey);
        } else if (typeof body.agnesImageApiKey === 'string') await saveAgnesImageKey(userId, body.agnesImageApiKey.trim());
        send(response, 200, await publicSettings(userId)); return;
      }

      // DELETE /api/ai/settings/key
      if (url.pathname === '/api/ai/settings/key' && request.method === 'DELETE') {
        await saveSecrets(userId, { apiKey: '', seedreamApiKey: '' });
        await saveSeedreamSecrets(userId, { seedreamApiKey: '' });
        await saveAgnesImageKey(userId, '');
        send(response, 200, await publicSettings(userId)); return;
      }

      // POST /api/ai/models
      if (url.pathname === '/api/ai/models' && request.method === 'POST') {
        const body = await parseJsonBody(request);
        const baseUrl = normalizeBaseUrl(body.baseUrl);
        const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
        if (!baseUrl) throw new Error('需要填写 Base URL');
        if (!apiKey) throw new Error('需要填写 API Key');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        let res: Response;
        try {
          res = await fetch(joinApiUrl(baseUrl, 'models'), { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal });
        } finally { clearTimeout(timeout); }
        if (!res.ok) throw await upstreamError(res);
        const payload = await res.json() as { data?: Array<{ id?: unknown }> };
        const models = Array.isArray(payload.data)
          ? payload.data.filter((m): m is { id: string } => typeof m?.id === 'string').map((m) => m.id)
          : [];
        send(response, 200, { models }); return;
      }

      // POST /api/ai/connection-test
      if (url.pathname === '/api/ai/connection-test' && request.method === 'POST') {
        const body = await parseJsonBody(request);
        const current = await loadConfig(userId);
        const secrets = await loadSecrets(userId);
        const imageTab = body.target === 'image';
        const draft = (body.settings || {}) as Partial<AIProviderConfig>;
        const config = normalizeConfig(imageTab ? { ...current, imageProvider: draft.imageProvider } : {
          ...current, presetId: draft.presetId ?? current.presetId,
          baseUrl: draft.baseUrl ?? current.baseUrl, multimodalModel: draft.multimodalModel ?? current.multimodalModel,
        });
        const sameAnalysisProvider = config.presetId === current.presetId && config.baseUrl === current.baseUrl;
        const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : sameAnalysisProvider ? secrets.apiKey : '';
        let model = config.multimodalModel;
        let provider: string = config.presetId;
        if (!imageTab) {
          if (!apiKey || !config.baseUrl || !model) throw new Error('请填写 Key 并选择分析模型');
          await callUpstream(config.baseUrl, apiKey, 'chat/completions', {
            model,
            temperature: 0, max_tokens: 1,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
          });
          await saveConfig(userId, config);
          if (typeof body.apiKey === 'string') await saveSecrets(userId, { apiKey, seedreamApiKey: '' });
        } else {
          const useAgnes = config.imageProvider === 'agnes';
          provider = useAgnes ? 'agnes' : 'seedream';
          const sConfig = await loadSeedreamConfig(userId);
          const baseUrl = useAgnes ? AGNES_CONFIG.baseUrl : sConfig.seedreamBaseUrl;
          let key = useAgnes ? await loadAgnesImageKey(userId) : (await loadSeedreamSecrets(userId)).seedreamApiKey;
          if (useAgnes && body.reuseAgnesImageKey === true) {
            if (current.presetId !== 'agnes' || !secrets.apiKey) throw new Error('请先连接分析模型中的 Agnes，再复用 Key');
            key = secrets.apiKey;
          } else {
            const entered = useAgnes ? body.agnesImageApiKey : body.seedreamApiKey;
            if (typeof entered === 'string') key = entered.trim();
          }
          if (!key) throw new Error('请填写生图 Key，或复用已连接的 Agnes 分析模型 Key');
          const upstream = await fetch(joinApiUrl(baseUrl, 'models'), {
            headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000),
          });
          if (!upstream.ok) throw await upstreamError(upstream);
          const catalog = await upstream.json() as { data?: Array<{ id?: unknown }> };
          const ids = (catalog.data || []).map(item => item.id).filter((id): id is string => typeof id === 'string');
          model = useAgnes ? ids.filter(id => /^agnes[-_]image(?:[-_]|$)/i.test(id)).sort().at(-1) || '' : sConfig.seedreamModel;
          if (!model || !ids.includes(model)) throw new Error('Key 验证后未找到当前生图模型，请检查模型权限；配置未保存');
          if (useAgnes) config.agnesImageModel = model;
          // Only persist this tab after authentication and model access succeed.
          if (useAgnes) await saveAgnesImageKey(userId, key);
          else await saveSeedreamSecrets(userId, { seedreamApiKey: key });
          await saveConfig(userId, config);
        }
        const savedConfig = await loadConfig(userId);
        const sConfig = await loadSeedreamConfig(userId);
        const verificationPath = pathsFor(userId).verificationPath;
        const verification = await readJsonFile<Record<string, string>>(verificationPath, {});
        const parts = !imageTab ? [savedConfig.presetId, savedConfig.baseUrl, savedConfig.multimodalModel, (await loadSecrets(userId)).apiKey]
          : provider === 'agnes' ? [AGNES_CONFIG.baseUrl, savedConfig.agnesImageModel || '', await loadAgnesImageKey(userId)]
          : [sConfig.seedreamBaseUrl, sConfig.seedreamModel, (await loadSeedreamSecrets(userId)).seedreamApiKey];
        verification[imageTab ? provider : 'analysis'] = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
        await secureWriteJson(verificationPath, verification, options.dataDirectory);
        send(response, 200, { model, provider, settings: await publicSettings(userId) }); return;
      }

      // POST /api/ai/style-summary
      if (url.pathname === '/api/ai/style-summary' && request.method === 'POST') {
        const body = await parseJsonBody(request);
        const images = Array.isArray(body.images) ? body.images.filter((item): item is string => typeof item === 'string') : [];
        if (images.length < 1 || images.length > 6) throw new Error('风格总结需要 1–6 张图片');
        if (images.some((image) => !image.startsWith('data:image/'))) throw new Error('参考图必须先转换为本地图片数据');
        const instruction = cleanString(body.instruction, 2000) || '请分析这些参考图的共同视觉系统，并生成可复用的风格总结。';
        const result = await withProvider(userId, async (config, apiKey) => {
          const payload = await callUpstream(config.baseUrl, apiKey, 'chat/completions', {
            model: config.multimodalModel,
            temperature: 0.2, max_tokens: 2200,
            messages: [
              { role: 'system', content: styleSystemPrompt },
              { role: 'user', content: [
                { type: 'text', text: instruction },
                ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
              ] },
            ],
          });
          return styleSummaryFromModel(parseModelJson(extractMessageText(payload)), config.multimodalModel, images.length);
        });
        send(response, 200, result); return;
      }

      // POST /api/ai/template-definition — executes the installed Template Spec v2 package.
      if (url.pathname === '/api/ai/template-definition' && request.method === 'POST') {
        const body=await parseJsonBody(request);
        const images=Array.isArray(body.images)?body.images.filter((item):item is string=>typeof item==='string'):[];
        if(images.length<3||images.length>6)throw new Error('Template Spec v2 需要 3–6 张黄金参考图');
        if(images.some(image=>!image.startsWith('data:image/')))throw new Error('参考图必须先转换为本地图片数据');
        const templateName=cleanString(body.templateName,120);
        const usageScenario=cleanString(body.usageScenario,1200);
        const runtimeInput=cleanString(body.runtimeInput,120);
        if(!templateName||!usageScenario||!runtimeInput)throw new Error('缺少模板名称、使用场景或运行时输入');
        const templateId=cleanString(body.templateId,128);
        if(!templateId)throw new Error('缺少模板 ID');
        const installedSkill=await loadTemplateSkillPrompt();
        const templateKey=`${userId}:${templateId}`;
        const existing=definitionByTemplate.get(templateKey);
        if(existing&&activeDefinitions.has(existing)){send(response,202,{jobId:existing});return;}
        const now=new Date().toISOString();
        const job:DefinitionJob={id:randomBytes(16).toString('hex'),templateId,status:'RUNNING',phase:'检查参考图一致性',startedAt:now,updatedAt:now,history:[{phase:'检查参考图一致性',at:now}]};
        const phase=async(label:string)=>{job.phase=label;job.updatedAt=new Date().toISOString();job.history.push({phase:label,at:job.updatedAt});await saveJob(userId,job);};
        activeDefinitions.add(job.id);
        definitionByTemplate.set(templateKey,job.id);
        try{await saveJob(userId,job);}catch(error){activeDefinitions.delete(job.id);definitionByTemplate.delete(templateKey);throw error;}
        send(response,202,{jobId:job.id});
        void (async()=>{try{
        const result=await withProvider(userId,async(config,apiKey)=>{
          if(!apiKey)throw new Error('请先在 AI 设置中配置多模态分析 API Key');
          const preflight=await callUpstream(config.baseUrl,apiKey,'chat/completions',{
            model:config.multimodalModel,temperature:0.1,max_tokens:6000,
            messages:[{role:'system',content:`${installedSkill}\n只执行 fast preflight：一次观察全部参考图。仅返回以下紧凑 JSON（不需要完整 schema 的报告字段）：references:[{id,caption}]，29项 traversal:[{checkId,findings:[{decision,ruleIds,observation,reason,sources:[{sourceId,location,kind,claim}]}]}]，合并后4–12条 rules:[{id,category,name,text,priority}]，reviewReport:{pendingRuleIds:[],ruleEvidence:[{checkIds,ruleIds,evidence:[{refId,observable,score:0或1或2}]}]}，heroReference，goal:{questions:[]}。每条 Rule 证据必须包含全部参考图；MUST 至少3图、80%，PREFER至少2图、50%。禁止生成 Prompt、完整评分卡或测试材料。`},
              {role:'user',content:[{type:'text',text:`模板：${templateName}\n使用场景：${usageScenario}\n输入：${runtimeInput}\n参考图按顺序编号 REF01–REF${String(images.length).padStart(2,'0')}`},...images.map(image=>({type:'image_url',image_url:{url:image}}))]}],
          });
          let observations:Record<string,unknown>;
          job.outputs=[{stage:'一致性预检查',text:extractMessageText(preflight)}];
          try{observations=parseModelJson(extractMessageText(preflight));}catch{throw new Error(`一致性预检查未返回有效 JSON：${modelOutputDiagnostic(preflight,extractMessageText(preflight))}`);}
          await phase('核验 Criteria 收敛度与有效 Rules');
          const questions=(observations.goal as {questions?:unknown[]})?.questions;
          if(questions?.length)throw new Error(`需要 UX 补充目标：${questions.map(String).join('；')}`);
          const assessment=await assessDefinition(observations,images.length);
          if(!assessment.definable)throw new Error(`一致性预检查未通过：Criteria 收敛度 ${Math.round(assessment.convergence*100)}%，有效 Rules ${assessment.qualifiedRuleIds.length} 条，Rule Set ${assessment.ruleSetPassed?'成立':'不成立'}。请调整参考图后重新定义；未生成 Prompt。`);
          // Reuse the observations: compilation receives no images, avoiding a second image analysis.
          await phase('编写 Prompt、评分卡与 DEFINE 报告');
          const payload=await callUpstream(config.baseUrl,apiKey,'chat/completions',{
            model:config.multimodalModel,temperature:0.1,max_tokens:12000,
            messages:[
              {role:'system',content:`${installedSkill}\n\n${definitionOutputContract}`},
              {role:'user',content:`基于已完成的预检查生成 v0.4 草案，不重复观察参考图。模板名：${templateName}\n使用场景：${usageScenario}\n运行时输入：${runtimeInput}\n预检查事实：${JSON.stringify(observations)}`},
            ],
          });
          const firstText=extractMessageText(payload);
          job.outputs.push({stage:'完整报告首轮',text:firstText});
          let firstDraft:Record<string,unknown>={};
          let definition:Record<string,unknown>;
          await phase('校验 JSON、29 项遍历与 Rules–Prompt 映射');
          try{
            firstDraft=parseModelJson(firstText);
            definition=await validateDefinition(firstDraft,images.length);
          }catch(firstError){
            await phase('修复报告结构（一次）');
            const repairReason=firstError instanceof Error?firstError.message:'DEFINE 输出结构不完整';
            const repairPayload=await callUpstream(config.baseUrl,apiKey,'chat/completions',{
              model:config.multimodalModel,temperature:0,max_tokens:16000,
              messages:[
              {role:'system',content:`你是 Seedream Template Spec v2.1 的 DEFINE 结构修复器。不得删除已有的可观察结论，不得降低要求来通过校验。仅复用预检查事实，不重复分析参考图。${installedSkill}\n${definitionOutputContract}`},
                {role:'user',content:`上一轮 DEFINE 未通过校验：${repairReason}\n请修复并返回完整 JSON。预检查事实：${JSON.stringify(observations)}\n上一轮输出：${Object.keys(firstDraft).length?JSON.stringify(firstDraft):firstText}`},
              ],
            });
            const repairText=extractMessageText(repairPayload);
            job.outputs.push({stage:'结构修复',text:repairText});
            try{
              definition=await validateDefinition(parseModelJson(repairText),images.length);
            }catch(repairError){
              const detail=repairError instanceof Error?repairError.message:'输出仍不完整';
              throw new Error(`DEFINE 自动修复后仍失败：${detail}\n首轮诊断：${modelOutputDiagnostic(payload,firstText)}\n修复轮诊断：${modelOutputDiagnostic(repairPayload,repairText)}`);
            }
          }
          if(definition.definitionStatus!=='可定义')throw new Error('完整报告与预检查的可定义性不一致，请 UX 检查参考图与规则后重试。');
          const allRules=[...(definition.templateRules as Array<Record<string,unknown>>),...(definition.visualQualityRules as Array<Record<string,unknown>>)];
          const summary={
            title:templateName,
            visualSummary:String(definition.targetVisual||''),
            stableFeatures:allRules.slice(0,12).map(rule=>({name:String(rule.name||''),description:String(rule.text||'')})),
            allowedVariations:(definition.initialApplicability as {p1Supported?:string[]})?.p1Supported||[],
            negativeConstraints:allRules.filter(rule=>rule.priority==='MUST').map(rule=>String(rule.score0||'')),
            prompt:String(definition.seedreamPrompt||''),
          };
          return {summary,definition,model:config.multimodalModel,imageCount:images.length};
        });
        job.result=result;job.status='SUCCEEDED';await phase('报告完成，等待 UX 审阅');
        }catch(error){job.status='FAILED';job.failedPhase=job.phase;job.error=error instanceof Error?error.message:'DEFINE 失败';await phase('分析失败，需要处理');}
        finally{activeDefinitions.delete(job.id);definitionByTemplate.delete(templateKey);}})().catch(error=>console.error('[DEFINE] 无法持久化任务状态',errorMessage(error)));return;
      }

      // POST /api/ai/generate-image (uses Seedream)
      if (url.pathname === '/api/ai/generate-image' && request.method === 'POST') {
        const body = await parseJsonBody(request);
        const prompt = cleanString(body.prompt, 8000);
        const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
        if (!prompt) throw new Error('生图 Prompt 不能为空');
        if (imageDataUrl && !imageDataUrl.startsWith('data:image/')) throw new Error('输入图片格式不受支持');

        const result = await withProvider(userId, async (config, apiKey, sConfig, seedreamApiKey) => {
          const useAgnes = config.imageProvider === 'agnes';
          const agnesImageKey = useAgnes ? await loadAgnesImageKey(userId) : '';
          if (useAgnes && !agnesImageKey) throw new Error('请填写 Agnes 生图 Key，或点击复用分析模型 Key 后保存');
          if (!useAgnes && !seedreamApiKey) throw new Error('请先在 AI 设置中填写 Seedream API Key');
          const sBaseUrl = useAgnes ? AGNES_CONFIG.baseUrl : sConfig.seedreamBaseUrl || SEEDREAM_DEFAULT.seedreamBaseUrl;
          const imageKey = useAgnes ? agnesImageKey : seedreamApiKey;
          let sModel = sConfig.seedreamModel || SEEDREAM_DEFAULT.seedreamModel;
          if (useAgnes) {
            const modelResponse = await fetch(joinApiUrl(sBaseUrl, 'models'), {
              headers: { Authorization: `Bearer ${imageKey}` }, signal: AbortSignal.timeout(30_000),
            });
            if (!modelResponse.ok) throw await upstreamError(modelResponse);
            const available = await modelResponse.json() as { data?: Array<{ id?: unknown }> };
            const imageModels = (available.data || []).map(item => item.id).filter((id): id is string => typeof id === 'string' && /^agnes[-_]image(?:[-_]|$)/i.test(id)).sort();
            if (!imageModels.length) throw new Error('当前 Agnes 账户的模型列表未提供 Agnes 生图模型，请使用 Seedream 实测或检查 Agnes 生图权限');
            sModel = config.agnesImageModel || imageModels[imageModels.length - 1];
            if (!imageModels.includes(sModel)) throw new Error('已保存的 Agnes 生图模型当前不可用，请重新连接以确认模型版本');
          }

          let finalPrompt = prompt;
          if (imageDataUrl) {
            const description = await describeImage(config.baseUrl, apiKey, config.multimodalModel, imageDataUrl,
              '请把这张输入图描述成图片生成模型可执行的视觉锚点，重点说明主体身份、数量、构图、颜色、材质和空间关系。');
            finalPrompt = `${prompt}\n\n输入图片的视觉锚点（必须尽量保留）：${description}`;
          }

          const payload = await callUpstream(sBaseUrl, imageKey, 'images/generations', {
            model: sModel,
            prompt: finalPrompt,
            n: 1,
            ...(!useAgnes ? { watermark: false } : {}),
          });
          const images = imageResults(payload);
          if (!images.length) throw new Error('生图服务没有返回图片');
          return { images, model: sModel };
        });
        send(response, 200, result); return;
      }

      send(response, 404, { error: 'Unknown AI endpoint' });
    } catch (error) {
      console.warn('[seedream-ai] 本地 AI 请求失败:', errorMessage(error));
      send(response, 400, { error: errorMessage(error) });
    }
  };
};

// ── Plugin entry ───────────────────────────────────────────────────────────────

export function persistencePlugin(): Plugin {
  const dataDirectory = path.resolve(process.cwd(), '.seedream-data');
  let writeQueue = Promise.resolve();

  const load = async (): Promise<StateFile> => readJsonFile(path.join(dataDirectory, 'state.json'), {} as StateFile);
  const save = async (state: StateFile): Promise<void> => {
    await mkdir(dataDirectory, { recursive: true });
    const temporary = path.join(dataDirectory, 'state.json.tmp');
    await writeFile(temporary, JSON.stringify(state), 'utf8');
    await rename(temporary, path.join(dataDirectory, 'state.json'));
  };

  const ai = aiMiddleware({ dataDirectory });

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> => {
    const url = new URL(request.url || '', 'http://localhost');
    if(url.pathname==='/api/recovery/origin-caches'&&request.method==='GET'){
      const state=await load();
      const archives=Object.entries(state).filter(([key])=>key.startsWith('origin-cache:')).map(([key,value])=>({key,value}));
      send(response,200,{archives});return;
    }
    if(url.pathname==='/api/recovery/checkpoint'&&request.method==='POST'){
      try{
        const origin=request.headers.origin;
        if(origin&&new URL(origin).host!==request.headers.host){send(response,403,{error:'仅允许同源备份'});return;}
        const body=JSON.parse(await readBody(request));
        const backupDirectory=path.join(dataDirectory,'backups');
        const file=path.join(backupDirectory,`cloud-${Date.now()}-${randomBytes(16).toString('hex')}.json`);
        await secureWriteJson(file,{...body,recordedAt:new Date().toISOString()},backupDirectory);
        send(response,200,{saved:true});
      }catch(error){send(response,500,{error:errorMessage(error)});}
      return;
    }
    if(url.pathname==='/recovery-local-cache'&&request.method==='GET'){
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      response.end(`<!doctype html><meta charset="utf-8"><title>实验室本地缓存恢复检查</title><h1>本地缓存恢复检查</h1><p id="status">正在检查此网址下的实验室缓存，不修改原缓存…</p><script>
        (async()=>{try{
          const entries={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key==='seedream-app-storage'||key.startsWith('seedream-canvas-data/')||key.startsWith('seedream-generated-images/'))entries[key]=localStorage.getItem(key);}
          const snapshot={origin:location.origin,checkedAt:new Date().toISOString(),entries};
          const response=await fetch('/api/persistence/'+encodeURIComponent('origin-cache:'+location.origin+':'+Date.now()),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
          if(!response.ok)throw new Error('本地检查记录保存失败');
          document.getElementById('status').textContent='已保存 '+Object.keys(entries).length+' 项原缓存的恢复检查记录，网址：'+location.origin+'。未修改缓存，未读取登录凭证。';
        }catch(error){document.getElementById('status').textContent='检查失败：'+error.message;}})();
      </script>`);return;
    }
    if (url.pathname.startsWith('/api/ai/')) { await ai(request, response, next); return; }
    if (!url.pathname.startsWith('/api/persistence/')) { next(); return; }
    const key = decodeURIComponent(url.pathname.slice('/api/persistence/'.length));
    if (!key) { send(response, 400, { error: 'Missing persistence key' }); return; }
    try {
      if (request.method === 'GET') {
        const state = await load();
        send(response, 200, { value: state[key] ?? null }); return;
      }
      if (request.method === 'PUT') {
        const value = JSON.parse(await readBody(request)) as unknown;
        writeQueue = writeQueue.then(async () => {
          const state = await load();
          state[key] = value;
          await save(state);
        });
        await writeQueue;
        send(response, 200, { saved: true }); return;
      }
      send(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : 'Persistence failed' });
    }
  };

  return {
    name: 'seedream-persistence',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
