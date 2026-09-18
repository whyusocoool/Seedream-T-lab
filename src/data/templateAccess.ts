import type { TemplateCase, MemberRole } from '@/types';

export const canEditTemplate=(template:TemplateCase|undefined,userId:string|undefined,role:MemberRole|undefined)=>Boolean(template&&userId&&(role==='ux'||(role==='tester'&&(template.collaborators.includes(userId)||template.invitations?.some(item=>item.profileId===userId)))));
export const canDeleteTemplate=(template:TemplateCase|undefined,userId:string|undefined)=>Boolean(template&&userId&&template.ownerId===userId);
