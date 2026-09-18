import { cloudEnabled, supabase } from '@/data/supabase';
import type { MemberRole } from '@/types';

export type Job = 'ux' | 'tester';
export interface CloudProfile { id: string; name: string; avatarUrl?: string; jobs: Job[] }
export interface CloudAccount { email: string; name: string; avatarUrl?: string; jobs: Job[] }
export interface CloudColleague { id:string; name:string; email:string; avatarUrl?:string; jobs:Job[] }
export interface CanvasDocument<T = unknown> { workspaceId: string; job: Job; payload: T; updatedAt: string }

const requireClient = () => {
  if (!supabase) throw new Error('尚未配置 Supabase');
  return supabase;
};

const isJwtIssuedInFuture = (error: unknown): boolean =>
  error instanceof Error && /jwt issued at future/i.test(error.message);

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const checkpoint=async(workspaceId:string,type:string,key:string,previous:unknown,next:unknown)=>{
  const response=await fetch('/api/recovery/checkpoint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId,type,key,previous,next})});
  if(!response.ok)throw new Error('本地版本备份失败，已停止写入云端，避免无法恢复的覆盖');
};

export const cloudRepository = {
  enabled: cloudEnabled,
  async inspectRecoverySources(workspaceId: string, job: Job, userId: string) {
    const client=requireClient();
    const results=await Promise.all([
      client.from('shared_documents').select('workspace_id,document_type,document_key,payload,updated_at').eq('workspace_id',workspaceId),
      client.from('job_canvases').select('workspace_id,job,payload,updated_at').eq('workspace_id',workspaceId).eq('job',job),
      client.from('workspace_members').select('workspace_id').eq('profile_id',userId),
      client.storage.from('workspace-images').list(`${workspaceId}/${job}`,{limit:1000}),
    ]);
    const snapshot={workspaceId,job,checkedAt:new Date().toISOString(),documents:results[0].data,canvases:results[1].data,memberships:results[2].data,images:results[3].data,errors:results.map(result=>result.error?.message||null)};
    const response=await fetch(`/api/persistence/${encodeURIComponent(`recovery-scan:${workspaceId}:${userId}:${job}`)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
    if(!response.ok)throw new Error('恢复来源检查完成，但本地检查记录无法保存');
    return snapshot;
  },
  async currentProfile(): Promise<CloudProfile | null> {
    const client=requireClient();
    for(let attempt=0;attempt<3;attempt+=1){
      try{
        const {data:auth,error:authError}=await client.auth.getUser();
        if(authError)throw authError;
        if(!auth.user)return null;
        const {data,error}=await client.from('profiles').select('id, display_name, avatar_url, profile_jobs(job)').eq('id',auth.user.id).single();
        if(error)throw error;
        let jobs=(data.profile_jobs as unknown as Array<{job:Job}>|null)?.map(item=>item.job)??[];
        const requestedJob=auth.user.user_metadata?.requested_job;
        if(!jobs.length&&(requestedJob==='ux'||requestedJob==='tester')){
          const {error:joinError}=await client.rpc('join_seedream_workspace',{selected_job:requestedJob});
          if(joinError)throw joinError;
          jobs=[requestedJob];
        }
        return{id:data.id,name:data.display_name,avatarUrl:data.avatar_url??undefined,jobs};
      }catch(error){
        if(!isJwtIssuedInFuture(error)||attempt===2)throw error;
        await wait((attempt+1)*1000);
      }
    }
    return null;
  },
  async signIn(email: string, password: string) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async currentAccount(): Promise<CloudAccount> {
    const client = requireClient();
    const [{ data: auth, error: authError }, profile] = await Promise.all([client.auth.getUser(), this.currentProfile()]);
    if (authError) throw authError;
    if (!auth.user || !profile) throw new Error('未找到当前账号');
    return { email: auth.user.email || '', name: profile.name, avatarUrl: profile.avatarUrl, jobs: profile.jobs };
  },
  async updateAccount(changes: { name?: string; email?: string; password?: string }) {
    const client = requireClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error('登录已失效，请重新登录');
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) throw new Error('姓名不能为空');
      const { error } = await client.from('profiles').update({ display_name: name }).eq('id', auth.user.id);
      if (error) throw error;
      const { error: metadataError } = await client.auth.updateUser({ data: { display_name: name } });
      if (metadataError) throw metadataError;
    }
    const attributes: { email?: string; password?: string } = {};
    if (changes.email && changes.email.trim() !== auth.user.email) attributes.email = changes.email.trim();
    if (changes.password) attributes.password = changes.password;
    if (Object.keys(attributes).length) {
      const { error } = await client.auth.updateUser(attributes);
      if (error) throw error;
    }
    return this.currentAccount();
  },
  async searchColleagues(workspaceId:string,query:string):Promise<CloudColleague[]> {
    const term=query.trim();
    if(term.length<2)return [];
    const {data,error}=await requireClient().rpc('search_workspace_colleagues',{target_workspace:workspaceId,search_term:term});
    if(error)throw error;
    return (data||[]).map((row:{id:string;display_name:string;email:string;avatar_url?:string;jobs?:Job[]})=>({id:row.id,name:row.display_name,email:row.email,avatarUrl:row.avatar_url,jobs:row.jobs||[]}));
  },
  async changeJob(job:Job):Promise<void>{
    const {error}=await requireClient().rpc('change_seedream_job',{selected_job:job});
    if(error)throw error;
  },
  async signUp(email: string, password: string, displayName: string, job: Job) {
    const client = requireClient();
    const emailRedirectTo = `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { display_name: displayName, requested_job: job },
      },
    });
    if (error) throw error;
    if (data.session) {
      const { error: joinError } = await client.rpc('join_seedream_workspace', { selected_job: job });
      if (joinError) throw joinError;
    }
    return data;
  },
  async resendSignUp(email: string) {
    const { data, error } = await requireClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback` },
    });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  },
  async loadCanvas<T>(workspaceId: string, job: Job): Promise<CanvasDocument<T> | null> {
    const { data, error } = await requireClient().from('job_canvases').select('workspace_id, job, payload, updated_at').eq('workspace_id', workspaceId).eq('job', job).maybeSingle();
    if (error) throw error;
    return data ? { workspaceId: data.workspace_id, job: data.job, payload: data.payload as T, updatedAt: data.updated_at } : null;
  },
  async saveCanvas<T>(workspaceId: string, job: Job, payload: T): Promise<void> {
    const client = requireClient();
    const previous=await this.loadCanvas(workspaceId,job);
    await checkpoint(workspaceId,'canvas',job,previous?.payload??null,payload);
    const { data: auth } = await client.auth.getUser();
    const { error } = await client.from('job_canvases').upsert({ workspace_id: workspaceId, job, payload, updated_by: auth.user?.id, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,job' });
    if (error) throw error;
  },
  async uploadImage(workspaceId: string, job: Job, file: File): Promise<{ path: string; url: string }> {
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${workspaceId}/${job}/${crypto.randomUUID()}.${extension}`;
    const client = requireClient();
    const { error } = await client.storage.from('workspace-images').upload(path, file, { cacheControl: '31536000', contentType: file.type || undefined });
    if (error) throw error;
    const { data, error: signedError } = await client.storage.from('workspace-images').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signedError) throw signedError;
    return { path, url: data.signedUrl };
  },
  async imageUrl(path: string): Promise<string> {
    const { data, error } = await requireClient().storage.from('workspace-images').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    return data.signedUrl;
  },
  async loadSharedDocument<T>(workspaceId: string, type: string, key: string): Promise<T | null> {
    const { data, error } = await requireClient().from('shared_documents').select('payload').eq('workspace_id', workspaceId).eq('document_type', type).eq('document_key', key).maybeSingle();
    if (error) throw error;
    return data ? data.payload as T : null;
  },
  async saveSharedDocument<T>(workspaceId: string, type: string, key: string, payload: T): Promise<void> {
    const previous=await this.loadSharedDocument(workspaceId,type,key);
    await checkpoint(workspaceId,type,key,previous,payload);
    const { error } = await requireClient().from('shared_documents').upsert({ workspace_id: workspaceId, document_type: type, document_key: key, payload, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,document_type,document_key' });
    if (error) throw error;
  },
};

export const isWorkspaceRole = (role: MemberRole): role is Job => role === 'ux' || role === 'tester';
