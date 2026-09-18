export type MemberRole = 'admin' | 'owner' | 'ux' | 'tester' | 'viewer';

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  email?: string;
  avatarUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  members: Member[];
  createdAt: string;
  updatedAt: string;
}

export type StageType = 
  | 'DEFINE' 
  | 'FIT' 
  | 'UX_RULE_REVIEW' 
  | 'TUNE' 
  | 'RELEASE';

export type StageStatus = 
  | 'NOT_STARTED' 
  | 'IN_PROGRESS' 
  | 'READY_FOR_HANDOFF' 
  | 'BLOCKED' 
  | 'COMPLETED'
  | 'PASSED'
  | 'FAILED';

export type HandoffStatus = 
  | 'DRAFT' 
  | 'READY_FOR_HANDOFF' 
  | 'DELIVERED' 
  | 'ACCEPTED' 
  | 'RETURNED' 
  | 'SUPERSEDED';

export type Priority = 'P0' | 'P1' | 'P2';

export type RuleType = 'T' | 'V';

export type RuleSeverity = 'MUST' | 'PREFERRED';

export interface ReferenceImage {
  id: string;
  url: string;
  filename: string;
  uploadedAt: string;
  source?: string;
}

export interface DefinitionRule {
  id: string;
  name: string;
  text: string;
  priority: 'MUST' | 'PREFERRED';
  category: 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  criteriaIds: string[];
  score2: string;
  score1: string;
  score0: string;
}

export interface TemplateDefinitionReport {
  sourceSpec?:Record<string,unknown>;
  effectiveRuleCount?:number;
  specVersion: '0.4';
  templateName: string;
  runtimeInput: string;
  usageScenario: string;
  targetVisual: string;
  heroReference: string;
  definitionStatus: '可定义' | '待补充';
  criteriaConvergence: number;
  traversal: Array<{criteriaId:string;criteriaName:string;disposition:'RULE'|'EVIDENCE'|'OMIT'|'NOT_APPLICABLE'|'UNOBSERVABLE'|'PENDING_UX';rationale:string;ruleIds:string[]}>;
  ruleEvidence: Array<{ruleId:string;references:Array<{referenceId:string;observable:boolean;support:0|1;rationale:string}>}>;
  templateRules: DefinitionRule[];
  visualQualityRules: DefinitionRule[];
  promptVersion: string;
  seedreamPrompt: string;
  promptRuleMap: Array<{sentence:string;ruleIds:string[]}>;
  initialApplicability: {p0Advantage:string[];p1Supported:string[];p2BoundaryNotRecommended:string[]};
  fitTestPlan: {summary:string;rows:Array<{testId:string;tier:'P0'|'P1'|'P2';inputDescription:string;challengeVariable:string;inputCount:number;runsPerInput:number;totalOutputs:number}>};
  promptGuideReview: {knowledgeVersion:string;modules:string[];techniques:string[];reviewNote:string};
}

export interface TemplateCase {
  recoveryNote?: string;
  responsibilityVersion?: number;
  referenceImages?: string[];
  referenceImagePaths?: string[];
  id: string;
  workspaceId: string;
  name: string;
  alias?: string;
  usageScenario: string;
  runtimeInputType: string;
  status: 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'FAILED' | 'ARCHIVED';
  /** 后台 DEFINE 的独立状态；模板草稿在分析开始时即创建。 */
  defineStatus?: 'ANALYZING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  defineError?: string;
  defineDiagnostics?:Array<{stage:string;text:string}>;
  uxSeenStageKey?:string;
  uxSeenActionKeys?:string[];
  defineJobId?: string;
  defineRequestedAt?:string;
  defineProgress?: {phase:string;failedPhase?:string;startedAt:string;updatedAt:string;history:Array<{phase:string;at:string}>};
  defineCompletedAt?: string;
  defineSeenAt?: string;
  coverImageUrl?: string;
  coverImagePath?: string;
  /** DEFINE skill 选中的主参考图序号，用于列表与测试入口的封面。 */
  coverReferenceIndex?: number;
  ownerId: string;
  collaborators: string[];
  team?: Array<{profileId:string;name:string;role:'ux'|'tester';avatarUrl?:string}>;
  invitations?: Array<{profileId:string;name:string;email:string;status:'PENDING'|'ACCEPTED';invitedBy:string;invitedAt:string}>;
  /** 由 AI 总结得到的风格结果，随模板在团队空间共享。 */
  aiStyleSummary?: {
    title: string;
    visualSummary: string;
    stableFeatures: Array<{ name: string; description: string }>;
    allowedVariations: string[];
    negativeConstraints: string[];
    prompt: string;
  };
  /** 按 seedream-template-spec-v2 生成的 DEFINE v0.4 草案。 */
  aiDefinition?: TemplateDefinitionReport;
  /** 创建模板时生成的 Prompt，供后续 AI 生图使用。 */
  aiPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  templateCaseId: string;
  runNumber: string;
  uxAssigneeId?: string;
  testerAssigneeId?: string;
  currentStage: StageType;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'STOPPED';
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: string;
  runId: string;
  type: StageType;
  status: StageStatus;
  responsibleRole: MemberRole;
  blockedReason?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Rule {
  id: string;
  code: string;
  type: RuleType;
  severity: RuleSeverity;
  content: string;
  examples?: string[];
  priority: Priority;
  applicability: Priority[];
  createdAt: string;
  updatedAt: string;
}

export interface DefineSpec {
  id: string;
  runId: string;
  version: string;
  usageScenario: string;
  runtimeInputType: string;
  references: ReferenceImage[];
  templateDescription: string;
  heroReference?: string;
  rules: Rule[];
  alignmentScore?: number;
  intentAlignmentScore?: number;
  promptVersion: string;
  promptHash: string;
  specHash: string;
  status: 'DRAFT' | 'BASELINE' | 'FINAL';
  createdAt: string;
  updatedAt: string;
}

export interface TestOutput {
  id: string;
  batchId: string;
  testId: string;
  inputUrl?: string;
  outputUrl: string;
  seedreamPrompt: string;
  generatedAt: string;
}

export interface RuleScore {
  ruleId: string;
  score: 0 | 1 | 2 | null;
  notApplicable: boolean;
  evidence?: string;
}

export interface TestEvaluation {
  id: string;
  testOutputId: string;
  evaluatorId: string;
  ruleScores: RuleScore[];
  overallScore?: number;
  mustPass: boolean;
  preferredScore: number;
  evaluatedAt: string;
}

export interface FailureDiagnosis {
  id: string;
  testOutputId: string;
  failedRuleId: string;
  inputEvidence: string;
  outputEvidence: string;
  ruleEvidence: string;
  candidateRuleCode?: string;
  candidateRuleContent?: string;
  diagnosedAt: string;
}

export interface FitBatch {
  id: string;
  runId: string;
  batchNumber: string;
  defineSpecId: string;
  promptVersion: string;
  fixedSetId: string;
  testOutputs: TestOutput[];
  evaluations: TestEvaluation[];
  diagnoses: FailureDiagnosis[];
  mustPassRate: number;
  preferredAvgScore: number;
  gateResult: 'GO' | 'CONDITIONAL' | 'STOP';
  createdAt: string;
  completedAt?: string;
}

export interface FxxDecision {
  id: string;
  candidateRuleCode: string;
  decision: 'ACCEPT' | 'MERGE' | 'REJECT';
  mergeIntoRuleId?: string;
  rationale: string;
  decidedBy: string;
  decidedAt: string;
}

export interface PromptRevision {
  id: string;
  runId: string;
  version: string;
  content: string;
  changeLog: string;
  parentVersion?: string;
  hash: string;
  createdAt: string;
}

export interface TuneResult {
  id: string;
  runId: string;
  baselinePromptVersion: string;
  revisionPromptVersion: string;
  fixedSetId: string;
  ruleRegressions: Array<{
    ruleId: string;
    baselineScore: number;
    revisionScore: number;
    delta: number;
  }>;
  overallDelta: number;
  createdAt: string;
}

export interface CalibrationDecision {
  id: string;
  runId: string;
  ruleId: string;
  decision: 'KEEP' | 'RELAX' | 'NARROW' | 'STOP';
  adjustedApplicability?: Priority[];
  rationale: string;
  decidedBy: string;
  decidedAt: string;
}

export interface Release {
  id: string;
  runId: string;
  promptVersion: string;
  finalDefineSpecId: string;
  releaseApplicability: {
    P0: boolean;
    P1: boolean;
    P2: boolean;
  };
  gatesPassed: boolean;
  releasedBy: string;
  releasedAt: string;
}

export interface Handoff {
  id: string;
  runId: string;
  fromStage: StageType;
  toStage: StageType;
  fromRole: MemberRole;
  toRole: MemberRole;
  status: HandoffStatus;
  deliverables: Record<string, any>;
  version: string;
  materialHash: string;
  gates: Record<string, boolean>;
  submittedBy: string;
  submittedAt?: string;
  acceptedBy?: string;
  acceptedAt?: string;
  returnedReason?: string;
  createdAt: string;
  updatedAt: string;
}
