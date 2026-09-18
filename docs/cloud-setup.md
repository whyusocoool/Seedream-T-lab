# Supabase 亚太区账号与共享存储

项目使用 Supabase Auth、Postgres 与 Storage。浏览器只保留登录会话和未提交缓存；云端是正式数据源。

- `job_canvases`：岗位内共享画布与标签。
- `workspace-images`：岗位内共享图片。
- `shared_documents`：UX 与测试共同使用的模板、Prompt、Rules、Fit/Tune 结果与审阅。
- `profiles`、`workspace_members`、`profile_jobs`：多人账号与岗位权限。

在 Supabase SQL Editor 执行 `supabase/schema.sql`，再将项目 URL 与 publishable/anon key 写入 `.env.local`。不要把 service_role key 或数据库密码放入前端。

