import type {
  Workspace,
  TemplateCase,
  Run,
  Stage,
  DefineSpec,
  Rule,
  ReferenceImage,
  FitBatch,
  TestOutput,
  TestEvaluation,
  RuleScore,
  FailureDiagnosis,
  Handoff,
} from '@/types';

export const mockWorkspace: Workspace = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Seedream 团队',
  members: [
    {
      id: 'member-hanyi-wang',
      name: 'Hanyi Wang',
      role: 'ux',
      email: 'hanyi.wang@seedream.local',
      avatarUrl: '/images/avatar-ux-cat.png',
    },
    {
      id: 'member-lico',
      name: 'Lico',
      role: 'tester',
      email: 'lico@seedream.local',
      avatarUrl: '/images/avatar-tester.png',
    },
  ],
  createdAt: '2026-08-15T10:00:00Z',
  updatedAt: '2026-09-01T14:30:00Z',
};

export const mockReferenceImages: ReferenceImage[] = [
  {
    id: 'ref-001',
    url: '/images/R01-07a10511-3741-44af-a0f8-4212ccf53b08.jpg',
    filename: 'R01.jpg',
    uploadedAt: '2026-08-15T10:30:00Z',
  },
  {
    id: 'ref-002',
    url: '/images/R02-b860acb3-8992-4a70-92b7-f9c1c5c9742e.jpg',
    filename: 'R02.jpg',
    uploadedAt: '2026-08-15T10:30:00Z',
  },
  {
    id: 'ref-003',
    url: '/images/R03-2101a757-4d28-4c6d-a47a-5d652e0686b3.jpg',
    filename: 'R03.jpg',
    uploadedAt: '2026-08-15T10:30:00Z',
  },
  {
    id: 'ref-004',
    url: '/images/R04-cf36cd04-2c09-4c0a-9712-d003f10801bd.jpg',
    filename: 'R04.jpg',
    uploadedAt: '2026-08-15T10:30:00Z',
  },
];

export const mockRules: Rule[] = [
  {
    id: 'rule-t01',
    code: 'T01',
    type: 'T',
    severity: 'MUST',
    content: '贴纸必须具有清晰的白色或浅色边框',
    priority: 'P0',
    applicability: ['P0', 'P1', 'P2'],
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-08-15T11:00:00Z',
  },
  {
    id: 'rule-t02',
    code: 'T02',
    type: 'T',
    severity: 'MUST',
    content: '贴纸主体元素必须居中且占据画面主导位置',
    priority: 'P0',
    applicability: ['P0', 'P1', 'P2'],
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-08-15T11:00:00Z',
  },
  {
    id: 'rule-v01',
    code: 'V01',
    type: 'V',
    severity: 'PREFERRED',
    content: '贴纸风格应为扁平插画或卡通风格',
    priority: 'P0',
    applicability: ['P0', 'P1'],
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-08-15T11:00:00Z',
  },
  {
    id: 'rule-v02',
    code: 'V02',
    type: 'V',
    severity: 'PREFERRED',
    content: '色彩应温暖明快，避免暗沉或过度饱和',
    priority: 'P1',
    applicability: ['P0', 'P1', 'P2'],
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-08-15T11:00:00Z',
  },
];

export const mockDefineSpec: DefineSpec = {
  id: 'define-001',
  runId: 'run-001',
  version: 'v0.0',
  usageScenario: '为手帐爱好者生成可爱的装饰贴纸',
  runtimeInputType: '文字描述（如"一只戴帽子的小猫"）',
  references: mockReferenceImages,
  templateDescription: '生成适合手帐装饰的扁平风格贴纸，具有清晰边框和居中构图',
  heroReference: 'ref-001',
  rules: mockRules,
  alignmentScore: 85,
  intentAlignmentScore: 88,
  promptVersion: 'v0.0',
  promptHash: 'hash-prompt-v0.0-abc123',
  specHash: 'hash-define-baseline-def456',
  status: 'BASELINE',
  createdAt: '2026-08-15T11:30:00Z',
  updatedAt: '2026-08-16T09:00:00Z',
};

// 中国风模板的 DefineSpec - 参考图对齐失败
export const mockDefineSpecChineseStyle: DefineSpec = {
  id: 'define-002',
  runId: 'run-002',
  version: 'v0.0',
  usageScenario: '生成具有中国传统元素的装饰图案',
  runtimeInputType: '文字描述',
  references: [],
  templateDescription: '生成具有中国风特色的装饰图案，包含传统元素如云纹、祥云、龙凤等',
  heroReference: '',
  rules: [],
  alignmentScore: 0,
  intentAlignmentScore: 0,
  promptVersion: 'v0.0',
  promptHash: '',
  specHash: '',
  status: 'DRAFT',
  createdAt: '2026-09-01T09:00:00Z',
  updatedAt: '2026-09-02T14:00:00Z',
};

// 杂志风格模板的 DefineSpec
export const mockDefineSpecMagazineStyle: DefineSpec = {
  id: 'define-003',
  runId: 'run-003',
  version: 'v0.0',
  usageScenario: '生成杂志风格的封面和排版设计',
  runtimeInputType: '文字描述和标题文字',
  references: [],
  templateDescription: '生成现代杂志风格的视觉设计，包含标题、正文和装饰元素',
  heroReference: '',
  rules: [],
  alignmentScore: 92,
  intentAlignmentScore: 90,
  promptVersion: 'v0.0',
  promptHash: 'hash-prompt-magazine-xyz',
  specHash: 'hash-define-magazine-abc',
  status: 'BASELINE',
  createdAt: '2026-08-20T10:00:00Z',
  updatedAt: '2026-08-22T11:00:00Z',
};

const mockTestOutputs: TestOutput[] = [
  {
    id: 'output-001',
    batchId: 'batch-001',
    testId: 'test-001',
    inputUrl: '/images/P0-01-bf9010df-e1be-44bd-b572-5e870ec807fc.jpg',
    outputUrl: '/images/P0-01-O01-5b68ca96-6306-492d-bc21-e7ce2209bd09.jpg',
    seedreamPrompt: '一只可爱的小猫咪贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-002',
    batchId: 'batch-001',
    testId: 'test-002',
    inputUrl: '/images/P0-02-f74d67db-38ba-4b7f-b98f-d9b5bf3c1828.jpg',
    outputUrl: '/images/P0-02-O01-d0de674a-da71-4ddd-bc0a-391083dd01b3.jpg',
    seedreamPrompt: '一朵微笑的小花贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-003',
    batchId: 'batch-001',
    testId: 'test-003',
    inputUrl: '/images/P0-03-c3166d9e-40f6-4525-9897-d7288507a55d.jpg',
    outputUrl: '/images/P0-03-O01-f6033368-ac87-4852-b01e-22c73dbd01b9.jpg',
    seedreamPrompt: '一个可爱的小熊贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-004',
    batchId: 'batch-001',
    testId: 'test-004',
    inputUrl: '/images/P0-04-f41e82c9-38e0-47f5-ae30-5b8cabb1face.png',
    outputUrl: '/images/P0-04-O01-40813fff-904e-429b-934c-06cc807e3dcf.jpg',
    seedreamPrompt: '一颗星星贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-005',
    batchId: 'batch-001',
    testId: 'test-005',
    inputUrl: '/images/P1-01-6eb61e46-a36b-4f23-bea6-74127fe73cf8.png',
    outputUrl: '/images/P1-01-O01-9fda6475-b712-4edc-bbf5-f702f1cdaa26.jpg',
    seedreamPrompt: '一杯咖啡贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-006',
    batchId: 'batch-001',
    testId: 'test-006',
    inputUrl: '/images/P1-02-ce6d3380-20cf-487a-a110-b2514d6c48a6.jpg',
    outputUrl: '/images/P1-02-O01-9e33b085-f211-4834-b24b-ebee8a518eb8.jpg',
    seedreamPrompt: '一个小蛋糕贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-007',
    batchId: 'batch-001',
    testId: 'test-007',
    inputUrl: '/images/P2-01-f3eeb840-68f1-4dba-a7cb-613345dc1cc1.jpg',
    outputUrl: '/images/P2-01-O01-57bb0bf5-e09e-4a87-b9cf-2dfd31f14550.jpg',
    seedreamPrompt: '一朵云贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
  {
    id: 'output-008',
    batchId: 'batch-001',
    testId: 'test-008',
    inputUrl: '/images/P2-02-ebfabfaa-8884-4422-b90b-44d1621dc99e.png',
    outputUrl: '/images/P2-02-O01-ddcb0665-1e7a-4003-81b1-0ce0f208f822.jpg',
    seedreamPrompt: '一个爱心贴纸',
    generatedAt: '2026-08-17T10:00:00Z',
  },
];

const mockRuleScores: RuleScore[] = mockRules.map((rule, idx) => ({
  ruleId: rule.id,
  score: idx % 3 === 0 ? 2 : idx % 3 === 1 ? 1 : 0,
  notApplicable: false,
  evidence: `规则 ${rule.code} 的评分证据`,
}));

const mockEvaluations: TestEvaluation[] = mockTestOutputs.map((output, idx) => ({
  id: `eval-${String(idx + 1).padStart(3, '0')}`,
  testOutputId: output.id,
  evaluatorId: 'member-tester-001',
  ruleScores: mockRuleScores,
  overallScore: 1.5,
  mustPass: idx % 4 !== 0,
  preferredScore: 1.5,
  evaluatedAt: '2026-08-17T14:00:00Z',
}));

const mockDiagnoses: FailureDiagnosis[] = [
  {
    id: 'diag-001',
    testOutputId: 'output-001',
    failedRuleId: 'rule-t01',
    inputEvidence: '用户输入：一只小猫',
    outputEvidence: '生成的贴纸边框不清晰',
    ruleEvidence: 'T01 要求清晰白色边框',
    candidateRuleCode: 'F01',
    candidateRuleContent: '贴纸边框宽度应至少 8px 且与背景对比度 > 4.5:1',
    diagnosedAt: '2026-08-17T15:00:00Z',
  },
];

export const mockFitBatch: FitBatch = {
  id: 'batch-001',
  runId: 'run-001',
  batchNumber: 'batch-001',
  defineSpecId: 'define-001',
  promptVersion: 'v0.0',
  fixedSetId: 'fixedset-001',
  testOutputs: mockTestOutputs,
  evaluations: mockEvaluations,
  diagnoses: mockDiagnoses,
  mustPassRate: 0.75,
  preferredAvgScore: 1.5,
  gateResult: 'CONDITIONAL',
  createdAt: '2026-08-17T10:00:00Z',
  completedAt: '2026-08-17T16:00:00Z',
};

// 杂志风格模板的 FitBatch - FIT 失败
export const mockFitBatchMagazineStyle: FitBatch = {
  id: 'batch-003',
  runId: 'run-003',
  batchNumber: 'batch-003',
  defineSpecId: 'define-003',
  promptVersion: 'v0.0',
  fixedSetId: 'fixedset-003',
  testOutputs: [],
  evaluations: [],
  diagnoses: [],
  mustPassRate: 0.75,
  preferredAvgScore: 0,
  gateResult: 'STOP',
  createdAt: '2026-08-22T11:00:00Z',
  completedAt: '2026-09-01T16:00:00Z',
};

export const mockTemplateCase: TemplateCase = {
  id: 'template-001',
  workspaceId: 'ws-001',
  name: '手帐贴纸',
  alias: 'notebook-sticker',
  usageScenario: '为手帐爱好者生成可爱的装饰贴纸',
  runtimeInputType: '文字描述',
  status: 'ACTIVE',
  coverImageUrl: '/images/R01-07a10511-3741-44af-a0f8-4212ccf53b08.jpg',
  ownerId: 'member-hanyi-wang',
  collaborators: ['member-lico'],
  team: [
    { profileId: 'member-hanyi-wang', name: 'Hanyi Wang', role: 'ux', avatarUrl: '/images/avatar-ux-cat.png' },
    { profileId: 'member-lico', name: 'Lico', role: 'tester', avatarUrl: '/images/avatar-tester.png' },
  ],
  createdAt: '2026-08-15T10:00:00Z',
  updatedAt: '2026-08-20T16:00:00Z',
};

// 中国风模板 - 卡在 DEFINE 阶段，图片 align 失败
export const mockTemplateChineseStyle: TemplateCase = {
  id: 'template-002',
  workspaceId: 'ws-001',
  name: '中国风',
  alias: 'chinese-style',
  usageScenario: '生成具有中国传统元素的装饰图案',
  runtimeInputType: '文字描述',
  status: 'BLOCKED',
  coverImageUrl: '/images/china-style.jpg',
  ownerId: 'member-hanyi-wang',
  collaborators: ['member-lico'],
  team: [
    { profileId: 'member-hanyi-wang', name: 'Hanyi Wang', role: 'ux', avatarUrl: '/images/avatar-ux-cat.png' },
    { profileId: 'member-lico', name: 'Lico', role: 'tester', avatarUrl: '/images/avatar-tester.png' },
  ],
  createdAt: '2026-09-01T09:00:00Z',
  updatedAt: '2026-09-02T14:00:00Z',
};

// 杂志风格模板 - FIT 失败，模型无法稳定生成复杂文字
export const mockTemplateMagazineStyle: TemplateCase = {
  id: 'template-003',
  workspaceId: 'ws-001',
  name: '杂志风格',
  alias: 'magazine-style',
  usageScenario: '生成杂志封面风格的图片',
  runtimeInputType: '文字描述',
  status: 'PAUSED',
  coverImageUrl: '/images/magazine-cover.jpg',
  ownerId: 'member-hanyi-wang',
  collaborators: ['member-lico'],
  team: [
    { profileId: 'member-hanyi-wang', name: 'Hanyi Wang', role: 'ux', avatarUrl: '/images/avatar-ux-cat.png' },
    { profileId: 'member-lico', name: 'Lico', role: 'tester', avatarUrl: '/images/avatar-tester.png' },
  ],
  createdAt: '2026-08-20T10:00:00Z',
  updatedAt: '2026-09-01T16:00:00Z',
};

export const mockRun: Run = {
  id: 'run-001',
  templateCaseId: 'template-001',
  runNumber: 'run-001',
  uxAssigneeId: 'member-ux-001',
  testerAssigneeId: 'member-tester-001',
  currentStage: 'UX_RULE_REVIEW',
  status: 'IN_PROGRESS',
  createdAt: '2026-08-15T10:00:00Z',
  updatedAt: '2026-08-20T16:00:00Z',
};

export const mockStages: Stage[] = [
  {
    id: 'stage-001-define',
    runId: 'run-001',
    type: 'DEFINE',
    status: 'COMPLETED',
    responsibleRole: 'ux',
    completedAt: '2026-08-16T09:00:00Z',
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-16T09:00:00Z',
  },
  {
    id: 'stage-002-fit',
    runId: 'run-001',
    type: 'FIT',
    status: 'PASSED',
    responsibleRole: 'tester',
    completedAt: '2026-08-17T16:00:00Z',
    createdAt: '2026-08-16T09:00:00Z',
    updatedAt: '2026-08-17T16:00:00Z',
  },
  {
    id: 'stage-003-review',
    runId: 'run-001',
    type: 'UX_RULE_REVIEW',
    status: 'IN_PROGRESS',
    responsibleRole: 'ux',
    createdAt: '2026-08-17T16:00:00Z',
    updatedAt: '2026-08-20T16:00:00Z',
  },
  {
    id: 'stage-004-tune',
    runId: 'run-001',
    type: 'TUNE',
    status: 'NOT_STARTED',
    responsibleRole: 'tester',
    blockedReason: '等待 UX Rule Review 完成',
    createdAt: '2026-08-17T16:00:00Z',
    updatedAt: '2026-08-20T16:00:00Z',
  },
  {
    id: 'stage-005-release',
    runId: 'run-001',
    type: 'RELEASE',
    status: 'NOT_STARTED',
    responsibleRole: 'ux',
    blockedReason: '等待 TUNE 完成',
    createdAt: '2026-08-17T16:00:00Z',
    updatedAt: '2026-08-20T16:00:00Z',
  },
];

// 中国风模板的 Run - 卡在 DEFINE 阶段
export const mockRunChineseStyle: Run = {
  id: 'run-002',
  templateCaseId: 'template-002',
  runNumber: 'run-001',
  uxAssigneeId: 'member-ux-001',
  testerAssigneeId: 'member-tester-001',
  currentStage: 'DEFINE',
  status: 'IN_PROGRESS',
  createdAt: '2026-09-01T09:00:00Z',
  updatedAt: '2026-09-02T14:00:00Z',
};

export const mockStagesChineseStyle: Stage[] = [
  {
    id: 'stage-002-define',
    runId: 'run-002',
    type: 'DEFINE',
    status: 'BLOCKED',
    responsibleRole: 'ux',
    blockedReason: '参考图 Alignment 失败，需要重新上传或调整输入图片',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-02T14:00:00Z',
  },
];

// 杂志风格模板的 Run - FIT 失败
export const mockRunMagazineStyle: Run = {
  id: 'run-003',
  templateCaseId: 'template-003',
  runNumber: 'run-001',
  uxAssigneeId: 'member-ux-001',
  testerAssigneeId: 'member-tester-001',
  currentStage: 'FIT',
  status: 'STOPPED',
  createdAt: '2026-08-20T10:00:00Z',
  updatedAt: '2026-09-01T16:00:00Z',
};

export const mockStagesMagazineStyle: Stage[] = [
  {
    id: 'stage-003-define',
    runId: 'run-003',
    type: 'DEFINE',
    status: 'COMPLETED',
    responsibleRole: 'ux',
    completedAt: '2026-08-22T11:00:00Z',
    createdAt: '2026-08-20T10:00:00Z',
    updatedAt: '2026-08-22T11:00:00Z',
  },
  {
    id: 'stage-003-fit',
    runId: 'run-003',
    type: 'FIT',
    status: 'FAILED',
    responsibleRole: 'tester',
    blockedReason: '模型无法稳定生成复杂文字信息，需重新评估方案',
    createdAt: '2026-08-22T11:00:00Z',
    updatedAt: '2026-09-01T16:00:00Z',
  },
];

export const mockHandoffs: Handoff[] = [
  {
    id: 'handoff-001',
    runId: 'run-001',
    fromStage: 'DEFINE',
    toStage: 'FIT',
    fromRole: 'ux',
    toRole: 'tester',
    status: 'ACCEPTED',
    deliverables: {
      defineSpecId: 'define-001',
      promptVersion: 'v0.0',
      rulesCount: 4,
    },
    version: '1.0',
    materialHash: 'hash-define-baseline-def456',
    gates: {
      alignmentScore: true,
      intentAlignment: true,
      ruleQuality: true,
    },
    submittedBy: 'member-ux-001',
    submittedAt: '2026-08-16T09:00:00Z',
    acceptedBy: 'member-tester-001',
    acceptedAt: '2026-08-16T10:00:00Z',
    createdAt: '2026-08-16T09:00:00Z',
    updatedAt: '2026-08-16T10:00:00Z',
  },
  {
    id: 'handoff-002',
    runId: 'run-001',
    fromStage: 'FIT',
    toStage: 'UX_RULE_REVIEW',
    fromRole: 'tester',
    toRole: 'ux',
    status: 'ACCEPTED',
    deliverables: {
      batchId: 'batch-001',
      testCount: 8,
      mustPassRate: 0.75,
      diagnosisCount: 1,
    },
    version: '1.0',
    materialHash: 'hash-fit-batch-001-xyz789',
    gates: {
      allTestsEvaluated: true,
      failureDiagnosed: true,
    },
    submittedBy: 'member-tester-001',
    submittedAt: '2026-08-17T16:00:00Z',
    acceptedBy: 'member-ux-001',
    acceptedAt: '2026-08-17T16:30:00Z',
    createdAt: '2026-08-17T16:00:00Z',
    updatedAt: '2026-08-17T16:30:00Z',
  },
];

const perlerTemplate:TemplateCase={id:'template-perler',workspaceId:'ws-001',name:'拼豆风格',alias:'perler-style',usageScenario:'生成真实拼豆质感的图片',runtimeInputType:'IMAGE_ONLY',status:'ACTIVE',coverImageUrl:'/images/figma-perler-cover.png',ownerId:'member-hanyi-wang',collaborators:['member-lico'],team:[{profileId:'member-hanyi-wang',name:'Hanyi Wang',role:'ux',avatarUrl:'/images/avatar-ux-cat.png'},{profileId:'member-lico',name:'Lico',role:'tester',avatarUrl:'/images/avatar-tester.png'}],createdAt:'2026-09-03T00:00:00Z',updatedAt:'2026-09-03T00:00:00Z'};
const perlerRun:Run={id:'perler-run-004',templateCaseId:'template-perler',runNumber:'run-004',currentStage:'FIT',status:'IN_PROGRESS',createdAt:perlerTemplate.createdAt,updatedAt:perlerTemplate.updatedAt};
const perlerStages:Stage[]=(['DEFINE','FIT'] as const).map(type=>({id:`perler-${type}`,runId:perlerRun.id,type,status:type==='DEFINE'?'COMPLETED':'PASSED',responsibleRole:type==='DEFINE'?'ux':'tester',createdAt:perlerTemplate.createdAt,updatedAt:perlerTemplate.updatedAt}));
export const mockData = {
  workspace: mockWorkspace,
  templates: [mockTemplateCase, perlerTemplate, mockTemplateChineseStyle, mockTemplateMagazineStyle],
  runs: [mockRun, perlerRun, mockRunChineseStyle, mockRunMagazineStyle],
  stages: [...mockStages, ...perlerStages, ...mockStagesChineseStyle, ...mockStagesMagazineStyle],
  defineSpecs: [mockDefineSpec, mockDefineSpecChineseStyle, mockDefineSpecMagazineStyle],
  fitBatches: [mockFitBatch, mockFitBatchMagazineStyle],
  handoffs: mockHandoffs,
};
