import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { Member, MemberRole, TemplateCase } from '@/types';
import { mockWorkspace, mockData } from '@/data/mockData';
import { cloudEnabled } from '@/data/supabase';

const templatesForLocalStorage = (templates: TemplateCase[]): TemplateCase[] => {
  // Supabase is authoritative in cloud mode. Persisting the same templates
  // locally duplicates large image data and can prevent auth sessions from
  // being saved in Safari.
  return cloudEnabled ? [] : templates;
};

interface AppState {
  currentUser: Member | null;
  accountRoles: MemberRole[];
  workspace: typeof mockWorkspace;
  templates: TemplateCase[];
  replaceTemplates: (templates: TemplateCase[]) => void;
  updateTemplate: (id: string, changes: Partial<TemplateCase>) => void;
  setCurrentUser: (user: Member | null) => void;
  setAccountRoles: (roles: MemberRole[]) => void;
  switchRole: (role: MemberRole) => void;
  deleteTemplate: (id: string) => void;
  createTemplate: (data: {
    name: string;
    description: string;
    usageScenario: string;
    inputType: string;
    references?: string[];
    referencePaths?: string[];
    coverReferenceIndex?: number;
    aiStyleSummary?: TemplateCase['aiStyleSummary'];
    aiPrompt?: string;
    aiDefinition?: TemplateCase['aiDefinition'];
    defineStatus?: TemplateCase['defineStatus'];
    defineError?: string;
    defineRequestedAt?:string;
  }) => TemplateCase;
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set, get) => ({
      currentUser: null,
      accountRoles: [],
      workspace: mockWorkspace,
      templates: mockData.templates,
      replaceTemplates: (templates) => { set((state) => { state.templates = templates; }); },
      updateTemplate: (id, changes) => { set((state) => { const template=state.templates.find(item=>item.id===id); if(template)Object.assign(template,changes,{updatedAt:new Date().toISOString()}); }); },
      setCurrentUser: (user) => {
        set((state) => {
          state.currentUser = user;
        });
      },
    setAccountRoles: (roles) => {
      set((state) => { state.accountRoles = roles; });
    },
    switchRole: (role) => {
      set((state) => {
        if (state.currentUser && state.accountRoles.includes(role)) {
          state.currentUser.role = role;
        }
      });
    },
    deleteTemplate: (id) => {
      set((state) => {
        state.templates = state.templates.filter((template) => template.id !== id);
      });
    },
    createTemplate: (data) => {
      const newTemplate: TemplateCase = {
        responsibilityVersion: 2,
        id: `tpl-${Date.now()}`,
        workspaceId: mockWorkspace.id,
        name: data.name,
        alias: data.name,
        usageScenario: data.usageScenario,
        referenceImages: data.references,
        referenceImagePaths: data.referencePaths,
        coverImageUrl: data.references?.[data.coverReferenceIndex ?? 0],
        coverImagePath: data.referencePaths?.[data.coverReferenceIndex ?? 0],
        coverReferenceIndex: data.coverReferenceIndex,
        runtimeInputType: data.inputType,
        status: 'ACTIVE',
        defineStatus: data.defineStatus,
        defineError: data.defineError,
        defineRequestedAt:data.defineRequestedAt,
        ownerId: get().currentUser?.id || '',
        collaborators: [],
        team: get().currentUser&&['ux','tester'].includes(get().currentUser!.role)?[{profileId:get().currentUser!.id,name:get().currentUser!.name,role:get().currentUser!.role as 'ux'|'tester',avatarUrl:get().currentUser!.avatarUrl}]:[],
        aiStyleSummary: data.aiStyleSummary,
        aiPrompt: data.aiPrompt,
        aiDefinition: data.aiDefinition,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set((state) => {
        state.templates.push(newTemplate);
      });

      return newTemplate;
    },
  })),
  {
    name: 'seedream-app-storage',
    partialize: (state) => ({ templates: templatesForLocalStorage(state.templates) }),
  }
)
);
