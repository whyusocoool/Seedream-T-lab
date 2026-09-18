import type { MemberRole, StageType } from '@/types';

export type Action = 
  | 'CREATE_TEMPLATE'
  | 'CREATE_RUN'
  | 'EDIT_DEFINE'
  | 'SUBMIT_DEFINE'
  | 'ACCEPT_DEFINE'
  | 'EDIT_FIT'
  | 'SUBMIT_FIT'
  | 'ACCEPT_FIT'
  | 'EDIT_RULE_REVIEW'
  | 'SUBMIT_RULE_REVIEW'
  | 'ACCEPT_RULE_REVIEW'
  | 'EDIT_TUNE'
  | 'SUBMIT_TUNE'
  | 'ACCEPT_TUNE'
  | 'SUBMIT_RELEASE'
  | 'VIEW_TIMELINE'
  | 'VIEW_HANDOFF'
  | 'ARCHIVE_TEMPLATE'
  | 'INVITE_MEMBER';

const rolePermissions: Record<MemberRole, Set<Action>> = {
  admin: new Set([
    'CREATE_TEMPLATE',
    'CREATE_RUN',
    'EDIT_DEFINE',
    'SUBMIT_DEFINE',
    'ACCEPT_DEFINE',
    'EDIT_FIT',
    'SUBMIT_FIT',
    'ACCEPT_FIT',
    'EDIT_RULE_REVIEW',
    'SUBMIT_RULE_REVIEW',
    'ACCEPT_RULE_REVIEW',
    'EDIT_TUNE',
    'SUBMIT_TUNE',
    'ACCEPT_TUNE',
    'SUBMIT_RELEASE',
    'VIEW_TIMELINE',
    'VIEW_HANDOFF',
    'ARCHIVE_TEMPLATE',
    'INVITE_MEMBER',
  ]),
  owner: new Set([
    'CREATE_TEMPLATE',
    'CREATE_RUN',
    'EDIT_DEFINE',
    'SUBMIT_DEFINE',
    'ACCEPT_DEFINE',
    'EDIT_RULE_REVIEW',
    'SUBMIT_RULE_REVIEW',
    'ACCEPT_RULE_REVIEW',
    'SUBMIT_RELEASE',
    'VIEW_TIMELINE',
    'VIEW_HANDOFF',
    'ARCHIVE_TEMPLATE',
    'INVITE_MEMBER',
  ]),
  ux: new Set([
    'CREATE_TEMPLATE',
    'CREATE_RUN',
    'EDIT_DEFINE',
    'SUBMIT_DEFINE',
    'ACCEPT_FIT',
    'EDIT_RULE_REVIEW',
    'SUBMIT_RULE_REVIEW',
    'SUBMIT_RELEASE',
    'VIEW_TIMELINE',
    'VIEW_HANDOFF',
  ]),
  tester: new Set([
    'ACCEPT_DEFINE',
    'EDIT_FIT',
    'SUBMIT_FIT',
    'ACCEPT_RULE_REVIEW',
    'EDIT_TUNE',
    'SUBMIT_TUNE',
    'VIEW_TIMELINE',
    'VIEW_HANDOFF',
  ]),
  viewer: new Set([
    'VIEW_TIMELINE',
    'VIEW_HANDOFF',
  ]),
};

export function can(action: Action, role: MemberRole): boolean {
  return rolePermissions[role]?.has(action) ?? false;
}

export function canEditStage(stage: StageType, role: MemberRole): boolean {
  switch (stage) {
    case 'DEFINE':
      return can('EDIT_DEFINE', role);
    case 'FIT':
      return can('EDIT_FIT', role);
    case 'UX_RULE_REVIEW':
      return can('EDIT_RULE_REVIEW', role);
    case 'TUNE':
      return can('EDIT_TUNE', role);
    case 'RELEASE':
      return can('SUBMIT_RELEASE', role);
    default:
      return false;
  }
}

export function getResponsibleRole(stage: StageType): MemberRole | null {
  switch (stage) {
    case 'DEFINE':
    case 'UX_RULE_REVIEW':
    case 'RELEASE':
      return 'ux';
    case 'FIT':
    case 'TUNE':
      return 'tester';
    default:
      return null;
  }
}
