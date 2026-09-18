import type { TemplateCase } from '@/types';
import type { CloudColleague } from '@/data/cloudRepository';

export function migrateTemplateResponsibilities(templates:TemplateCase[],hanyi:CloudColleague,lico:CloudColleague):TemplateCase[]{
  return templates.map(template=>{
    if(template.responsibilityVersion===2)return template;
    const invitations=(template.invitations||[]).map(item=>({...item,status:'ACCEPTED' as const}));
    if(!invitations.some(item=>item.profileId===lico.id))invitations.push({profileId:lico.id,name:lico.name,email:lico.email,status:'ACCEPTED',invitedBy:hanyi.id,invitedAt:new Date().toISOString()});
    return {...template,responsibilityVersion:2,ownerId:hanyi.id,
      collaborators:Array.from(new Set([...template.collaborators,...invitations.map(item=>item.profileId)])).filter(id=>id!==hanyi.id),
      team:[{profileId:hanyi.id,name:hanyi.name,role:'ux' as const,avatarUrl:hanyi.avatarUrl},
        ...(template.team||[]).filter(item=>item.role==='tester'&&item.profileId!==hanyi.id&&item.profileId!==lico.id),
        {profileId:lico.id,name:lico.name,role:'tester' as const,avatarUrl:lico.avatarUrl}],
      invitations,updatedAt:new Date().toISOString()};
  });
}
