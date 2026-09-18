import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import RoleSelection from '@/pages/RoleSelection';
import TemplateList from '@/pages/TemplateList';
import CreateTemplate from '@/pages/CreateTemplate';
import TemplateDetail from '@/pages/TemplateDetail';
import TemplateRules from '@/pages/TemplateRules';
import StageDetail from '@/pages/StageDetail';
import DefineWorkflow from '@/pages/DefineWorkflow';
import FitWorkflow from '@/pages/FitWorkflow';
import FitEvidence from '@/pages/FitEvidence';
import Canvas from '@/pages/Canvas';
import WorkspaceRecovery from '@/pages/WorkspaceRecovery';
import CreateTestRun from '@/pages/CreateTestRun';
import AuthCallback from '@/pages/AuthCallback';
import { useAppStore } from '@/store/appStore';
import { canViewTemplate } from '@/data/templateVisibility';
import { cloudEnabled, supabase } from '@/data/supabase';
import { cloudRepository } from '@/data/cloudRepository';
import type { MemberRole } from '@/types';
import CloudWorkspaceSync from '@/components/CloudWorkspaceSync';
import DefinitionJobSync from '@/components/DefinitionJobSync';

function TemplateAccess({ children }: { children: ReactNode }) {
  const { templateId } = useParams();
  const currentUser = useAppStore((state) => state.currentUser);
  const template = useAppStore((state) => state.templates.find(item=>item.id===templateId));

  if (!currentUser || !templateId || (template && !canViewTemplate(template, currentUser.role,currentUser.id))) {
    return <Navigate to="/templates" replace />;
  }
  if(!template)return <main className="auth-loading">正在读取模板与访问权限…</main>;

  return children;
}

function App() {
  const currentUser = useAppStore((state) => state.currentUser);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const setAccountRoles = useAppStore((state) => state.setAccountRoles);
  const [authReady,setAuthReady]=useState(!cloudEnabled);

  useEffect(()=>{
    if(!cloudEnabled||!supabase)return;
    let active=true;
    const sync=async()=>{
      try{
        const profile=await cloudRepository.currentProfile();
        if(!active)return;
        if(!profile){setCurrentUser(null);setAccountRoles([]);return;}
        const roles:MemberRole[]=profile.jobs.length?profile.jobs:['viewer'];
        setAccountRoles(roles);
        setCurrentUser({id:profile.id,name:profile.name,avatarUrl:profile.avatarUrl,role:roles[0]});
      }catch{
        if(active){setCurrentUser(null);setAccountRoles([])}
      }finally{if(active)setAuthReady(true)}
    };
    void sync();
    const {data}=supabase.auth.onAuthStateChange(()=>{
      // Let Supabase finish updating its session before reading the profile.
      window.setTimeout(() => void sync(), 0);
    });
    return()=>{active=false;data.subscription.unsubscribe()};
  },[setAccountRoles,setCurrentUser]);

  if(!authReady)return <main className="auth-loading">正在连接团队空间…</main>;

  return (
    <>
    {currentUser&&<CloudWorkspaceSync/>}
    {currentUser&&<DefinitionJobSync/>}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Navigate to={currentUser ? '/templates' : '/role'} replace />} />
        <Route path="/role" element={currentUser?<Navigate to="/templates" replace/>:<RoleSelection />} />
        {currentUser ? (
          <>
            <Route path="/templates" element={<TemplateList />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/recovery" element={<WorkspaceRecovery />} />
            <Route path="/tests/new" element={<CreateTestRun />} />
            <Route path="/templates/new" element={<CreateTemplate />} />
            <Route path="/templates/:templateId" element={<TemplateAccess><TemplateDetail /></TemplateAccess>} />
            <Route path="/templates/:templateId/rules" element={<TemplateAccess><TemplateRules /></TemplateAccess>} />
            <Route path="/templates/:templateId/stages/:stageType" element={<TemplateAccess><StageDetail /></TemplateAccess>} />
            <Route path="/templates/:templateId/define" element={<TemplateAccess><DefineWorkflow /></TemplateAccess>} />
            <Route path="/templates/:templateId/fit" element={<TemplateAccess><FitWorkflow /></TemplateAccess>} />
            <Route path="/templates/:templateId/fit/:runId/evidence" element={<TemplateAccess><FitEvidence /></TemplateAccess>} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/role" replace />} />
        )}
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;
