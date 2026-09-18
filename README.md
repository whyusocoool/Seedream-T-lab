# Seedream 模板协作实验室

一个为 Seedream 图像生成模板团队设计的协作实验室，支持 UX 同学和测试同学在模板验证流程中的完整协作。

## 功能特性

### 核心流程

- **身份选择**：UX 同学 / 测试同学分角色进入
- **模板方向管理**：查看和管理所有模板方向
- **验证轮次（Run）**：为每个模板创建独立的验证轮次
- **阶段时间线**：可视化展示从 DEFINE 到 RELEASE 的完整流程

### UX 同学工作流

1. **REFERENCE**：收集 3-6 张参考图
2. **DEFINE**：编写模板描述、使用场景、输入类型，制定 T/V 规则
3. **UX_RULE_REVIEW**：审查测试同学提交的失败诊断，决定是否接受候选规则
4. **CALIBRATE**：根据 TUNE 结果决定规则的保留、放宽、收窄或停止
5. **RELEASE**：确认最终 Define 规格和适用优先级，完成发布

### 测试同学工作流

1. **FIT**：对 Baseline Define 进行验证，为每个测试输出打分（0/1/2），诊断失败原因并提出候选规则
2. **TUNE**：对修订后的 Prompt 进行回归测试，确保规则无退化

### 数据模型

- **Workspace**：团队工作区
- **Member**：成员（admin / owner / ux / tester / viewer）
- **TemplateCase**：模板方向
- **Run**：验证轮次
- **Stage**：阶段（7 个阶段）
- **DefineSpec**：Define 规格（Baseline / Final）
- **Rule**：规则（T 类型 / V 类型，MUST / PREFERRED）
- **FitBatch**：FIT 批次
- **TestOutput**：测试输出
- **TestEvaluation**：测试评分
- **FailureDiagnosis**：失败诊断
- **Handoff**：交付记录

## 技术栈

- **React 18** + **TypeScript**
- **Vite** 构建工具
- **React Router** 路由管理
- **Zustand** 状态管理
- **Immer** 不可变数据

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

### 类型检查

```bash
npm run type-check
```

### 代码检查

```bash
npm run lint
```

## 项目结构

```
src/
├── types/           # TypeScript 类型定义
├── data/            # 模拟数据和权限配置
├── store/           # Zustand 状态管理
├── pages/           # 页面组件
│   ├── RoleSelection.tsx      # 身份选择
│   ├── TemplateList.tsx       # 模板列表
│   ├── TemplateDetail.tsx     # 模板详情
│   ├── RunTimeline.tsx        # Run 时间线
│   ├── DefineWorkflow.tsx     # DEFINE 和 Rule Review
│   └── FitWorkflow.tsx        # FIT 验证
├── App.tsx          # 应用主入口
├── main.tsx         # React 入口
└── index.css        # 全局样式
```

## 设计系统

- **配色**：深色主题，基于 #0B0E14 深海军蓝背景
- **强调色**：
  - 主要：#38BDF8（天蓝）
  - 次要：#22D3EE（青色）
  - 警告：#F97316（橙色）
  - 错误：#EF4444（红色）
- **字体**：系统默认无衬线字体栈
- **圆角**：8-12px
- **边框**：1px 实线，#334155

## 权限模型

| 角色 | 权限 |
|------|------|
| **admin** | 所有权限 |
| **owner** | 创建模板、管理 Run、UX 工作流、发布 |
| **ux** | DEFINE、Rule Review、CALIBRATE、RELEASE |
| **tester** | FIT、TUNE、接受交付 |
| **viewer** | 只读访问 |

## 门禁规则

### DEFINE → FIT

- ✓ 对齐分数 ≥ 80
- ✓ 意图对齐分数 ≥ 80
- ✓ 至少 2 条 MUST 规则

### FIT → UX_RULE_REVIEW

- ✓ 所有测试输出已评分
- ✓ 失败案例已诊断

### UX_RULE_REVIEW → TUNE

- ✓ 所有候选规则已决策（接受/合并/拒绝）
- ✓ Final Define 已生成

### TUNE → CALIBRATE

- ✓ 无规则退化或退化已确认

### CALIBRATE → RELEASE

- ✓ 所有规则校准决策已完成

### RELEASE

- ✓ P0 门禁通过
- ✓ P1/P2 门禁状态已确认

## 本机 AI 能力

本项目有两个独立的 AI 能力，**不会内置或共享任何 API Key**：

- **多模态分析模型**：读参考图 → 写 Prompt；读测试结果 → 打分
- **Seedream 生图**：统一生成模板验证图

第一次使用前，点击顶部的「配置 AI」，分别填写两类 Key。

### 多模态分析模型（Agnes / 自定义）

- **Agnes（免费）**：`https://apihub.agnes-ai.com/v1`，模型 `agnes-2.5-flash`。
- **自定义**：OpenAI、Kimi、通义千问、智谱、硅基流动、Gemini、OpenRouter 或手动填写 Base URL 和模型。多模态模型必须支持图片输入。
- Claude 原生 API 不走 OpenAI 兼容格式；如使用 Claude，请填写支持视觉模型的 OpenAI 兼容中转地址。
- Cursor 暂不接入（它是 Agent 任务接口，不是直接图片分析接口）。
- DeepSeek 的 `deepseek-chat` 是纯文本模型，不适合读图分析。

### Seedream 生图

- **统一生图服务**：所有模板验证图统一用 Seedream 生成，不受多模态服务商限制。
- 默认接口：`https://ark.ap-southeast.bytepluses.com/api/v3`，模型 `seedream-4-5-251128`。
- 支持 OpenAI 兼容 `/images/generations` 接口，也支持 APIYI 等合规中转。

### 如何使用

1. 启动本地开发服务器：`npm run dev`。
2. 点击顶部「配置 AI」。
3. 填写多模态模型 API Key（首次必填），选择 Agnes 或自定义服务商。
4. 填写 Seedream API Key（首次必填）。
5. 点击「保存设置」；可以点击「测试多模态连接」验证。
6. 新建模板并上传 4–6 张参考图，点击「AI 总结风格」。多模态模型输出：稳定特征、允许变化、应避免的偏差和可执行 Prompt。
7. 创建模板时会先执行 Seedream Template Spec v2 DEFINE 固定流程；只有 29 项 Criteria、4–12 条 Rules、逐参考图证据、Prompt 映射和 6/6/4 测试材料全部通过校验后，才会保存模板。
8. 已有模板打开详情后，点击「AI 运行」→「重新运行 DEFINE」，会重新生成并保存 Rules、Prompt，以及由 Skill 选择的居中主参考图；不会再只做普通风格总结。
9. 模板列表、测试入口和 DEFINE 参考图使用完整居中展示，避免用裁切方式截掉主体。

### 每个身份独立存储 Key

切换登录身份时，AI 配置也会切换：

- 浏览器请求时带上当前登录用户 ID（Supabase `getUser().id`）。
- 服务端按用户 ID 分配独立的配置文件和 Keychain 条目（`seedream-workbench-ai:<userId>`）。
- 未登录的本地演示模式使用 `guest` 身份，与已登录用户互不干扰。
- 每个用户用自己的 Key，互不共享计费和额度。

### Key 隐私边界

- 每个用户的 Key 只属于该用户，不会内置、共享或上传到本项目的云端。
- 浏览器只请求本机的 `/api/ai/*`；Key 只短暂经过本机回环请求，不会进入浏览器存储、Git 或我们的云端。
- 本地 Vite/Node 代理在 macOS 上把 Key 保存到 **macOS Keychain**（服务名 `seedream-workbench-ai`，账号为 `${USER}:<userId>`），不会把 Key 返回到浏览器。
- 只有在用户主动测试、总结或生图时，本机代理才通过 HTTPS 将 Key 发给用户选择的服务。
- 用户可以在「配置 AI」中清除 Key；也可以在 macOS「钥匙串访问」中删除相关条目。
- 非 macOS 环境没有 Keychain 时，使用权限为 `600` 的 `.seedream-data/ai-secrets-*.json` 作为本机兜底；该目录已被 `.gitignore` 排除。

### 已知限制

- 各服务商的模型名、图片输入能力和免费额度可能随服务方调整；请在「配置 AI」中确认模型可用。
- 当前生成结果在未启用云端时保存在当前浏览器的本地数据层；启用云端时保存在对应工作区的画布/模板文档中，不再从网页代码初始化或兜底。
- 模板 DEFINE 结果必须由本机 AI 代理实际调用并通过服务端 Skill 校验；代码修复不会自动替用户消耗 AI Key 重跑已有模板。
- 画布内容按工作区和角色独立保存，新增、移动、分组、标签和删除都会更新同一份画布数据；首次打开空画布，刷新不会先闪现已经删除的图片。
- 模板参考图和 FIT 输入/输出应属于模板或 Run 数据；页面只负责读取数据，不把图片写死在页面初始状态中。
- FIT 历史演示数据仍然保留；新增的真实生图结果目前用于模板详情页的即时验证，还没有自动替换历史评分和门禁报告。

## 后续扩展

- [x] 接入真实多模态风格总结
- [x] 接入 Seedream 统一生图
- [x] 支持 Agnes 与自定义多模态 Key
- [x] Seedream 独立 Key 配置
- [x] 每个登录身份独立存储 Key
- [x] 本机 Keychain / 本地安全文件存储
- [ ] 将真实生成结果接入 FIT 批量测试和规则评分
- [ ] 实现规则编辑器
- [ ] 实现评分界面
- [ ] 添加数据导出功能
- [ ] 添加通知系统
- [ ] 支持多工作区
- [ ] 实现权限管理界面

## 开发说明

项目仍保留 `src/data/mockData.ts` 和历史 FIT JSON，用于展示已有协作流程；真实 AI 能力通过本地 Vite 插件提供 `/api/ai/*` 接口，不需要云端后端。生产部署时应继续保持 API Key 在用户自己的本机或自己的后端，不要把 Key 写进前端环境变量或仓库。

## License

MIT
