import { mockData } from '@/data/mockData';
import type { MemberRole, TemplateCase } from '@/types';

export function hasEnteredFit(templateId: string): boolean {
  const latestRun = mockData.runs
    .filter((run) => run.templateCaseId === templateId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (!latestRun) return false;

  const stages = mockData.stages.filter((stage) => stage.runId === latestRun.id);
  const defineSucceeded = stages.some(
    (stage) => stage.type === 'DEFINE' && (stage.status === 'COMPLETED' || stage.status === 'PASSED'),
  );
  const fitCreated = stages.some((stage) => stage.type === 'FIT');

  return defineSucceeded && fitCreated;
}

export function canViewTemplate(template: TemplateCase, role: MemberRole, userId: string): boolean {
  return role !== 'tester' || Boolean(template.invitations?.some(item=>item.profileId===userId) || template.collaborators.includes(userId));
}
