import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { mockData } from '@/data/mockData';
import { can } from '@/data/permissions';
import AppHeader from '@/components/AppHeader';
import { getDefineSpec, getDefinitionReport } from '@/data/templateDefinitions';
import type { TemplateCase, TemplateDefinitionReport } from '@/types';
import '@/styles/define-workflow.css';
import { cloudEnabled } from '@/data/supabase';
import { cloudRepository } from '@/data/cloudRepository';
import DefinitionProgress from '@/components/DefinitionProgress';

const criteriaGroups=[
  ['C1','内容与保留'],['C2','形态与组织'],['C3','视觉表现'],['C4','输入适配'],['C5','成品可用性'],
] as const;

function SkillDefineReport({template,report}:{template:TemplateCase;report:TemplateDefinitionReport}){
  const references=template.referenceImages||[];
  const rules=[...report.templateRules,...report.visualQualityRules];
  const evidenceByRule=new Map(report.ruleEvidence.map(item=>[item.ruleId,item.references]));
  return <><AppHeader showNavigation={false}/><main className="page define-report-page skill-define-page"><div className="define-report-split">
    <aside className="define-report-sidebar">
      <Link className="define-template-back" to={`/templates/${template.id}`}><span className="eyebrow">DEFINE / TEMPLATE SPEC {report.sourceSpec?'V2.1':'V2'}</span><h1>{template.name}</h1></Link>
      <section><span className="eyebrow">一句话定义</span><p className="define-target">{report.targetVisual}</p></section>
      <dl><div><dt>使用场景</dt><dd>{report.usageScenario}</dd></div><div><dt>输入类型</dt><dd>{report.runtimeInput}</dd></div><div><dt>规则数量</dt><dd>{rules.length} 条</dd></div></dl>
      <Link className="btn primary define-rules-link" to={`/templates/${template.id}/rules`}>查看完整 RULES →</Link>
    </aside>
    <section className="define-report-content">
      <header className="define-report-heading"><div><span className="eyebrow">DEFINE REPORT</span><h2>模板定义</h2></div><div className={`define-verdict ${report.definitionStatus==='可定义'?'pass':'fail'}`}><span>结论</span><strong>{report.definitionStatus}</strong></div></header>
      {template.defineProgress&&<details><summary>查看 DEFINE 执行记录</summary><DefinitionProgress template={template}/></details>}
      <div className="define-score-strip"><div><span>Criteria 收敛度</span><strong>{report.criteriaConvergence}%</strong><small>{report.criteriaConvergence>=60?'明确收敛':report.criteriaConvergence>=40?'基本收敛':'方向分散'}</small></div><div><span>有效规则</span><strong>{report.effectiveRuleCount??rules.length}</strong><small>草案共 {rules.length} 条 · {rules.filter(rule=>rule.priority==='MUST').length} MUST</small></div></div>
      <section className="define-report-section"><h3>意向图 <span className="eyebrow">REFERENCE</span></h3><p className="define-section-summary">这些参考图是 DEFINE 的事实依据；橙色标记为主封面参考。</p><div className="define-reference-row">{references.map((src,index)=>{const id=`REF${String(index+1).padStart(2,'0')}`;return <figure className={id===report.heroReference?'hero':''} key={id}><img src={src} alt={`${id} 参考图`}/><figcaption>{id}{id===report.heroReference?' · HERO':''}</figcaption></figure>})}</div></section>
      <section className="define-report-section"><h3>Criteria 拆解 <span className="eyebrow">29 CHECKS</span></h3><div className="define-criteria-groups">{criteriaGroups.map(([id,name])=>{const findings=report.traversal.filter(item=>item.criteriaId.startsWith(id));const total=id==='C2'||id==='C3'?7:5;return <article key={id}><header><b>{id} {name}</b><span>{findings.length}/{total}</span></header><div>{findings.map(item=><span className={`criteria-${item.disposition.toLowerCase()}`} title={item.rationale} key={item.criteriaId}><b>{item.criteriaId}</b>{item.criteriaName}</span>)}</div></article>})}</div></section>
      <section className="define-report-section"><h3>Rules 依据 <span className="eyebrow">REFERENCE EVIDENCE</span></h3><div className="define-rule-evidence">{rules.map(rule=>{const evidence=evidenceByRule.get(rule.id)||[];const supported=evidence.filter(item=>item.observable&&item.support===1).map(item=>item.referenceId);return <article key={rule.id}><header><span className="eyebrow">{rule.id}</span><b>{rule.name}</b><em className={rule.priority==='MUST'?'must':''}>{rule.priority}</em></header><p>{rule.text}</p><small>图片依据：{supported.join('、')||'待补充'} · Criteria：{rule.criteriaIds.join('、')}</small></article>})}</div></section>
      <section className="define-report-section"><h3>初始 Prompt <span className="eyebrow">v{report.promptVersion}</span></h3><p className="define-prompt-block">{report.seedreamPrompt}</p><small className="define-prompt-note">依据 Seedream Prompt Guide {report.promptGuideReview.knowledgeVersion} 编写，尚未经过 FIT 实测。</small></section>
    </section>
  </div></main></>;
}

function PerlerDefineReport({template,defineSpec,report}:{template:TemplateCase;defineSpec:NonNullable<ReturnType<typeof getDefineSpec>>;report:NonNullable<ReturnType<typeof getDefinitionReport>>}){
  if(!('alignment' in report))return null;
  const visual=report.alignment.visual;const intent=report.alignment.intent;const passed=report.alignment.status==='ALIGNED';
  const creator=mockData.workspace.members.find(member=>member.id===template.ownerId);
  return <><AppHeader showNavigation={false}/><main className="page define-report-page"><div className="define-report-split">
    <aside className="define-report-sidebar">
      <Link className="define-template-back" to={`/templates/${template.id}`} aria-label={`返回${template.name}模板主页`}><span className="eyebrow">DEFINE / ALIGNMENT</span><h1>{template.name}</h1></Link>
      <section><span className="eyebrow">目标视觉</span><p className="define-target">{report.targetVisual}</p></section>
      <dl><div><dt>使用场景</dt><dd>{report.usageScenario}</dd></div><div><dt>输入类型</dt><dd>{defineSpec.runtimeInputType}</dd></div><div><dt>创建时间</dt><dd>{new Date(defineSpec.createdAt).toLocaleDateString('zh-CN')}</dd></div></dl>
      {creator&&<div className="define-owner"><img className="avatar" src={creator.avatarUrl} alt=""/><b>{creator.name}</b></div>}
    </aside>
    <section className="define-report-content">
      <header className="define-report-heading"><div><span className="eyebrow">ALIGNMENT REPORT</span><h2>一致性报告</h2></div><div className={`define-verdict ${passed?'pass':'fail'}`}><span>结论</span><strong>{passed?'PASS':'NOT PASS'}</strong></div></header>
      <div className="define-score-strip"><div><span>视觉一致性</span><strong>{Math.round(visual.score)}</strong><small>{visual.status}</small></div><div><span>意图一致性</span><strong>{Math.round(intent.score)}</strong><small>{intent.status}</small></div></div>
      <section className="define-report-section"><h3>意向图 <span className="eyebrow">MOODBOARD</span></h3><div className="define-reference-row">{defineSpec.references.map(reference=><figure key={reference.id}><img src={reference.url} alt={`${reference.id} ${reference.filename}`}/><figcaption>{reference.id}</figcaption></figure>)}</div></section>
      <section className="define-report-section"><h3>视觉一致性 <span className="eyebrow">VISUAL ALIGNMENT</span></h3><p className="define-section-summary">{visual.reason}</p><div className="define-dimension-grid">{visual.dimensions.map(dimension=><article key={dimension.id}><header><span className="eyebrow">{dimension.id}</span><b>{dimension.name}</b><strong>{dimension.score}</strong></header><p>{dimension.commonPattern}</p>{dimension.variation&&<small>允许变化：{dimension.variation}</small>}</article>)}</div></section>
    </section>
  </div></main></>;
}

export default function DefineWorkflow() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const currentUser = useAppStore((state) => state.currentUser);
  const storedTemplate = useAppStore((state) => state.templates.find((item)=>item.id===templateId));
  const updateTemplate = useAppStore((state) => state.updateTemplate);
  const workspaceId = useAppStore((state) => state.workspace.id);
  
  // 获取该模板最新的 run
  const runs = mockData.runs.filter((r) => r.templateCaseId === templateId);
  const run = runs[0];
  const template = storedTemplate || mockData.templates.find((t) => t.id === templateId);
  
  // 获取该 run 关联的 define spec 和 fit batch
  const defineSpec = getDefineSpec(templateId);
  const definitionReport = getDefinitionReport(templateId);
  const fitBatch = run ? mockData.fitBatches.find((f) => f.runId === run.id) : null;

  const [activeTab, setActiveTab] = useState<'define' | 'review'>('define');
  const [showBlockingReport, setShowBlockingReport] = useState(false);
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);

  useEffect(()=>{
    if(!cloudEnabled||!templateId||definitionReport)return;
    let active=true;
    void cloudRepository.loadSharedDocument<TemplateDefinitionReport>(workspaceId,'rules',`definition-${templateId}`).then(report=>{
      if(active&&report)updateTemplate(templateId,{aiDefinition:report});
    }).catch(error=>console.error('[cloud] DEFINE 页面读取失败',error));
    return()=>{active=false};
  },[definitionReport,templateId,updateTemplate,workspaceId]);

  useEffect(()=>{
    if(currentUser?.role==='ux'&&template?.defineCompletedAt&&template.defineSeenAt!==template.defineCompletedAt){
      updateTemplate(template.id,{defineSeenAt:template.defineCompletedAt});
    }
  },[currentUser?.role,template?.id,template?.defineCompletedAt,template?.defineSeenAt,updateTemplate]);

  if (!template || !currentUser) return null;

  if(template.defineStatus==='ANALYZING'||template.defineStatus==='FAILED')return <><AppHeader showNavigation={false}/><main className="page define-report-page"><Link to={`/templates/${template.id}`}>← 返回模板</Link><h1>{template.name} · DEFINE</h1><DefinitionProgress template={template}/></main></>;

  if(template.aiDefinition&&definitionReport)return <SkillDefineReport template={template} report={definitionReport as TemplateDefinitionReport}/>;
  if(!run)return <><AppHeader showNavigation={false}/><main className="page define-empty"><Link to={`/templates/${template.id}`}>← 返回模板</Link><h1>DEFINE 尚未完成</h1><p>请返回模板页运行 DEFINE。完成后，这里会显示参考图拆解、29 项 Criteria、Rules 依据和 Prompt 映射。</p></main></>;

  const isReviewStage = run.currentStage === 'UX_RULE_REVIEW';
  const canEditReview = can('EDIT_RULE_REVIEW', currentUser.role) && isReviewStage;

  if(templateId==='template-perler'&&defineSpec&&definitionReport)return <PerlerDefineReport template={template} defineSpec={defineSpec} report={definitionReport}/>;

  return (
    <><AppHeader/>
    <div className="workflow-page" style={{
      minHeight: '100vh',
      background: '#0B0E14',
      padding: '2rem',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        <button
          onClick={() => navigate(`/templates/${templateId}`)}
          style={{
            color: '#94A3B8',
            fontSize: '0.9rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          ← 返回模板详情
        </button>

        <div style={{
          background: '#1E293B',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#F8FAFC',
            marginBottom: '0.5rem',
          }}>
            {template.name}
          </h1>
          <div style={{
            fontSize: '0.9rem',
            color: '#94A3B8',
          }}>
            {isReviewStage ? 'UX 规则审查' : 'DEFINE 规格编辑'}
          </div>
        </div>

        {isReviewStage && (
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid #334155',
          }}>
            <button
              onClick={() => setActiveTab('define')}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: activeTab === 'define' ? '#38BDF8' : '#94A3B8',
                borderBottom: activeTab === 'define' ? '2px solid #38BDF8' : 'none',
              }}
            >
              Baseline Define
            </button>
            <button
              onClick={() => setActiveTab('review')}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: activeTab === 'review' ? '#38BDF8' : '#94A3B8',
                borderBottom: activeTab === 'review' ? '2px solid #38BDF8' : 'none',
              }}
            >
              Rule Review
            </button>
          </div>
        )}

        {activeTab === 'define' && defineSpec && (
          <div>
            {/* 简化的 Define 规格展示 - 参考 P2 */}
            <div style={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#F8FAFC',
                marginBottom: '1rem',
              }}>
                模板规格
              </h2>
              
              <div style={{
                display: 'grid',
                gap: '1rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.25rem' }}>使用场景</div>
                  <div style={{ color: '#F8FAFC' }}>{defineSpec.usageScenario}</div>
                </div>
                
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.25rem' }}>输入类型</div>
                  <div style={{ color: '#F8FAFC' }}>{defineSpec.runtimeInputType}</div>
                </div>
                
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.25rem' }}>模板描述</div>
                  <div style={{ color: '#F8FAFC' }}>{defineSpec.templateDescription}</div>
                </div>
              </div>
            </div>

            {/* 参考图 */}
            <div style={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}>
              <h3 style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                color: '#F8FAFC',
                marginBottom: '1rem',
              }}>
                参考图
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
              }}>
                {defineSpec.references.map((ref) => (
                  <div
                    key={ref.id}
                    style={{
                      border: ref.id === defineSpec.heroReference ? '2px solid #F97316' : '1px solid #334155',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={ref.url}
                      alt={ref.filename}
                      style={{
                        width: '100%',
                        height: '140px',
                        objectFit: 'contain',
                        objectPosition: 'center',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 规则列表 - 简化版本 */}
            <div style={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1.5rem',
            }}>
              <h3 style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                color: '#F8FAFC',
                marginBottom: '1rem',
              }}>
                规则列表
              </h3>
              
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}>
                {defineSpec.rules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      background: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      alignItems: 'center',
                    }}>
                      <span style={{
                        background: '#1E293B',
                        color: '#22D3EE',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}>
                        {rule.code}
                      </span>
                      <span style={{
                        background: rule.severity === 'MUST' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: rule.severity === 'MUST' ? '#F97316' : '#94A3B8',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        {rule.severity}
                      </span>
                    </div>
                    <div style={{
                      color: '#F8FAFC',
                      fontSize: '0.9rem',
                      lineHeight: '1.5',
                    }}>
                      {rule.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'review' && fitBatch && defineSpec && (
          <div>
            {/* UX 规则审查界面 - 参考 P7 结构 */}
            
            {/* 测试输出网格 - 参考 P4 改为 P6 样式 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1rem',
              marginBottom: '2rem',
            }}>
              {fitBatch.testOutputs.map((output, idx) => {
                const evaluation = fitBatch.evaluations.find((e) => e.testOutputId === output.id);
                const hasBlockingIssue = idx === 0; // 只有第一个有阻塞报告
                
                return (
                  <div
                    key={output.id}
                    onClick={() => setSelectedOutput(output.id)}
                    style={{
                      background: '#1E293B',
                      border: selectedOutput === output.id ? '2px solid #38BDF8' : '1px solid #334155',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={output.outputUrl}
                      alt={output.testId}
                      style={{
                        width: '100%',
                        height: '180px',
                        objectFit: 'cover',
                      }}
                    />
                    <div style={{ padding: '0.75rem' }}>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#94A3B8',
                        marginBottom: '0.5rem',
                        fontFamily: 'monospace',
                      }}>
                        {output.testId}
                      </div>
                      
                      {/* 显示阻塞标记 - P3 位置加绿色按钮 */}
                      {hasBlockingIssue && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowBlockingReport(!showBlockingReport);
                          }}
                          style={{
                            background: '#22C55E',
                            color: '#FFF',
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            marginBottom: '0.5rem',
                          }}
                        >
                          查看阻塞报告
                        </button>
                      )}
                      
                      {evaluation && (
                        <div style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}>
                          <span style={{
                            background: evaluation.mustPass ? '#0F172A' : '#1E0A0A',
                            color: evaluation.mustPass ? '#22D3EE' : '#EF4444',
                            border: `1px solid ${evaluation.mustPass ? '#22D3EE' : '#EF4444'}`,
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}>
                            {evaluation.mustPass ? 'PASS' : 'FAIL'}
                          </span>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#94A3B8',
                          }}>
                            {evaluation.preferredScore.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 阻塞报告弹窗 - P5 内容 */}
            {showBlockingReport && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '2rem',
              }}
              onClick={() => setShowBlockingReport(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '2rem',
                    maxWidth: '600px',
                    width: '100%',
                    maxHeight: '80vh',
                    overflow: 'auto',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                  }}>
                    <h3 style={{
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      color: '#F8FAFC',
                    }}>
                      阻塞报告
                    </h3>
                    <button
                      onClick={() => setShowBlockingReport(false)}
                      style={{
                        color: '#94A3B8',
                        fontSize: '1.5rem',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {fitBatch.diagnoses.map((diagnosis) => (
                    <div key={diagnosis.id} style={{ marginBottom: '1.5rem' }}>
                      <div style={{
                        background: '#0F172A',
                        border: '1px solid #EF4444',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '1rem',
                      }}>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#EF4444',
                          fontWeight: 600,
                          marginBottom: '0.5rem',
                        }}>
                          失败规则: {diagnosis.failedRuleId}
                        </div>
                        <div style={{
                          fontSize: '0.9rem',
                          color: '#F8FAFC',
                          marginBottom: '0.75rem',
                        }}>
                          {diagnosis.ruleEvidence}
                        </div>
                      </div>

                      <div style={{
                        background: '#0F172A',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '1rem',
                      }}>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#94A3B8',
                          marginBottom: '0.5rem',
                        }}>
                          输入证据
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#F8FAFC' }}>
                          {diagnosis.inputEvidence}
                        </div>
                      </div>

                      <div style={{
                        background: '#0F172A',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '1rem',
                      }}>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#94A3B8',
                          marginBottom: '0.5rem',
                        }}>
                          输出证据
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#F8FAFC' }}>
                          {diagnosis.outputEvidence}
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(34, 211, 238, 0.1)',
                        border: '1px solid #22D3EE',
                        borderRadius: '8px',
                        padding: '1rem',
                      }}>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#22D3EE',
                          fontWeight: 600,
                          marginBottom: '0.5rem',
                        }}>
                          候选新规则: {diagnosis.candidateRuleCode}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#F8FAFC' }}>
                          {diagnosis.candidateRuleContent}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: '1.5rem',
                  }}>
                    <button style={{
                      flex: 1,
                      background: '#22D3EE',
                      color: '#0B0E14',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}>
                      接受新规则
                    </button>
                    <button style={{
                      flex: 1,
                      background: '#334155',
                      color: '#F8FAFC',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}>
                      拒绝
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 右侧规则评分面板 - 参考 P7 右侧 */}
            {selectedOutput && defineSpec && (
              <div style={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '1.5rem',
              }}>
                <h3 style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: '#F8FAFC',
                  marginBottom: '1rem',
                }}>
                  规则评分
                </h3>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}>
                  {defineSpec.rules.map((rule) => {
                    const evaluation = fitBatch.evaluations.find(
                      (e) => e.testOutputId === selectedOutput
                    );
                    const ruleScore = evaluation?.ruleScores.find(
                      (rs) => rs.ruleId === rule.id
                    );
                    
                    return (
                      <div
                        key={rule.id}
                        style={{
                          background: '#0F172A',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '1rem',
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'start',
                          marginBottom: '0.5rem',
                        }}>
                          <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                          }}>
                            <span style={{
                              background: '#1E293B',
                              color: '#22D3EE',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}>
                              {rule.code}
                            </span>
                            <span style={{
                              background: rule.severity === 'MUST' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                              color: rule.severity === 'MUST' ? '#F97316' : '#94A3B8',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}>
                              {rule.severity}
                            </span>
                          </div>
                          
                          {ruleScore && (
                            <span style={{
                              fontSize: '1.25rem',
                              fontWeight: 600,
                              color: ruleScore.score === 2 ? '#22D3EE' : ruleScore.score === 1 ? '#F97316' : '#EF4444',
                            }}>
                              {ruleScore.score}
                            </span>
                          )}
                        </div>
                        
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#F8FAFC',
                          lineHeight: '1.5',
                        }}>
                          {rule.content}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canEditReview && (
                  <button style={{
                    width: '100%',
                    background: '#F97316',
                    color: '#FFF',
                    padding: '0.875rem',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginTop: '1.5rem',
                  }}>
                    完成审查
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div></>
  );
}
