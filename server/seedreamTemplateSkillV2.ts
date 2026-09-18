/**
 * Deployable runtime snapshot of seedream-template-spec-v2.
 * Source package: ~/.codex/skills/seedream-template-spec-v2
 * Prompt knowledge: 2026-09-10.1; schema: specVersion 0.4.
 *
 * The complete installed package is loaded during local development when present.
 * This snapshot keeps the same hard gates available on colleagues' computers and
 * deployed environments where a Codex skill installation is not expected.
 */
export const BUNDLED_TEMPLATE_SKILL_V2=`Seedream Template Spec v2 — runtime contract

Goal: DEFINE a rule-driven Seedream template from 3–6 UX-selected golden references. Golden references are analysis evidence, not assumed runtime inputs. The first Prompt is an untested implementation hypothesis.

Mandatory preflight: inspect every reference once; cover all 29 Criteria; assign exactly one disposition RULE, EVIDENCE, OMIT, NOT_APPLICABLE, UNOBSERVABLE, or PENDING_UX. Draft independently scoreable candidate Rules, merge duplicated properties, and record per-reference observability and support. If the effective Rule Set and convergence gates fail, return 待补充 and do not claim a usable definition.

Five groups and Criteria:
C1 内容与保留: C1.01 对象与数量; C1.02 必要部件; C1.03 文字与符号内容; C1.04 身份与特征保留; C1.05 内容增删.
C2 形态与组织: C2.01 比例与轮廓; C2.02 姿态; C2.03 位置与尺度; C2.04 间距与对齐; C2.05 遮挡与层次; C2.06 重复排列; C2.07 裁切与留白.
C3 视觉表现: C3.01 色彩关系; C3.02 明暗与体积线索; C3.03 边界与描线; C3.04 表面痕迹; C3.05 媒介表现线索; C3.06 细节简化方式; C3.07 图形与字形外观.
C4 输入适配: C4.01 多寡适配; C4.02 复杂度处理; C4.03 横竖幅适配; C4.04 文字长度适配; C4.05 背景与输入差异处理.
C5 成品可用性: C5.01 可读性; C5.02 必要内容完整性; C5.03 可辨识度; C5.04 用途相关缺陷; C5.05 尺寸与输出形式.

Rule contract: 4–12 Rules, stable IDs R01…; at least 3 qualified MUST Rules; qualified MUST Rules must cover both C2 and C3. MUST means its failure alone invalidates the template. PREFERRED means failure lowers quality but output remains usable. Pending is not PREFERRED. A Rule must be generalizable, independently observable, valuable, measurable, and not duplicated.

Evidence gates: MUST has at least 3 observable references and ≥80% support; PREFERRED has at least 2 observable references and ≥50% support. Use only observable references as denominator. Effective Rule Set plus Criteria convergence ≥40% means 可定义.

Rubrics: MUST exposes 通过/不通过; PREFERRED exposes 2/1/0. Every level describes directly observable objects, positions, quantities, boundaries, colours, texture, or failure phenomena. Necessary-condition failure cannot be rescued by auxiliary clues. Never use vague “high quality” as a criterion.

Prompt guide 2026-09-10.1: choose the actual task module. Use S01 object/action/environment, S02 output and use, S03 specific style, S04 quoted literal text, S05 edit target and preservation, S06 necessary detail without repetition, S07 accurate content/diagram terms, S08 only real marked regions, S09 reference preserve-vs-change, S10 structure from sketch, S11 explicit role for every input image, S12 explicit multi-output requirements. Map Prompt sentences to Rules. Record guide version, modules, and techniques. The guide expresses requirements but does not invent intent, priority, or prove success.

Test materials: generate A/B/C suggestions backed by an input coverage matrix; fixed 6/6/4 items. Cover input type, subject count/category, simple/complex background, composition, occlusion, resolution, and contour clarity. Material rows only describe what input to find and its observable input traits—never Rule IDs, scoring instructions, Prompt edits, UX decisions, or generation constraints.

One source per fact: traversal owns Criteria findings; Rules own requirement/priority/rubric/scope/implementation; ruleEvidence owns per-reference observable/support matrix. Keep targetVisual, runtimeInput, and usageScenario short and non-overlapping. Do not fabricate invisible text, brand, physical process, camera or UX intent. Output specVersion 0.4.`;
