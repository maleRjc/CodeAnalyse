# 软著助手借鉴开源项目（Ramile & chinese-copyright-skill）调研与分析报告

通过对开源项目 **Ramile** (github.com/luxel/ramile) 和 **chinese-copyright-application-skill** (github.com/na57/chinese-copyright-application-skill) 的源码与设计分析，并对照我们当前项目的实现（包括 [code-extractor.ts](file:///d:/AutoCode/CodeAnalyse/packages/core/src/code-extractor.ts)、[document-generator.ts](file:///d:/AutoCode/CodeAnalyse/packages/core/src/document-generator.ts) 及 [index.ts (主进程)](file:///d:/AutoCode/CodeAnalyse/apps/desktop/src/main/index.ts)），我们总结出以下可借鉴或引入的功能亮点，并规划了相应的设计方案。

---

## 1. 核心特性对比与借鉴点

| 对比维度 | Ramile | chinese-copyright-skill | 本项目 (RuanZhu) | 可借鉴/改进点 (Action Items) |
| :--- | :--- | :--- | :--- | :--- |
| **元数据自动提取** | - | 自动扫描 `app.json` (小程序)、`package.json` (Node)、`pom.xml` (Java)、`Cargo.toml` (Rust)、`pyproject.toml` (Python) 等 | 仅猜测 `package.json` 中的 `name` 和 `version` | **[建议引入] 多生态元数据扫描**：扩展 [guessProjectMeta](file:///d:/AutoCode/CodeAnalyse/apps/desktop/src/main/index.ts#L107-L119)，支持多种主流技术栈的配置自动解析，实现“零手动输入”。 |
| **自定义过滤与配置** | 支持项目根目录下放置 `.ramileconfig.json` 来配置源目录、排除项、扩展名和提取行数 | 依靠 Trae IDE 的本地配置或 Python 脚本规则 | 所有的过滤逻辑、忽略目录/后缀名全部硬编码在 core 包中 | **[建议引入] 项目级配置文件支持**：支持检测并解析项目根目录下的 `.ruanzhuconfig.json`（或兼容 `.ramileconfig.json`），允许用户对提取参数进行定制。 |
| **代码文件筛选与排序** | 基于扩展名过滤 + 通用提取 | 基于规则的文件优先级定义（如优先 `app.js` / `main.js`，其次是 pages/components 等） | 通过 AI 智能挑选并排序核心文件，辅助以正则匹配 | **[保留并优化]**：保留我们的 AI 智能挑选优势，同时可以引入更完善的本地扫描兜底排序规则（在无 API Key 或本地扫描模式下起作用）。 |
| **文档生成模板** | 仅生成代码 docx | 依托 `references/` 下 of Markdown 模板生成申请表、说明书、用户手册 | 依托 [document-generator.ts](file:///d:/AutoCode/CodeAnalyse/packages/core/src/document-generator.ts) 与 AI Pipeline 生成 | **[考虑引入] 开放式 Markdown 模板**：允许用户在项目目录中自定义说明书或申请表的 MD 骨架，替代我们硬编码的 System Prompt。 |

---

## 2. 具体借鉴功能设计与实现方案

### 借鉴点 1：多技术栈项目元数据自动提取 (Multi-ecosystem Meta Scanning)

目前我们在 [index.ts: guessProjectMeta](file:///d:/AutoCode/CodeAnalyse/apps/desktop/src/main/index.ts#L107-L119) 中只分析了 `package.json`。
可以借鉴 `chinese-copyright-application-skill` 的做法，依次对常见生态配置文件进行智能解析：

1. **微信小程序**：若存在 `app.json`，提取 `window.navigationBarTitleText` 作为软件名称。若存在 `project.config.json`，提取 `appid`。
2. **Java (Maven)**：解析 `pom.xml` 中的 `<artifactId>` 和 `<version>`。
3. **Rust**：解析 `Cargo.toml` 中的 `[package]` 块下的 `name` 和 `version`。
4. **Python**：解析 `pyproject.toml` 或 `setup.py`。
5. **Go**：解析 `go.mod` 第一行 `module <name>`。

**预期效果**：用户拖入一个 Java 或小程序项目时，软件名称和版本能完美自动填充，无需手动录入。

---

### 借鉴点 2：项目本地配置文件 `.ruanzhuconfig.json` 支持

借鉴 `Ramile` 的 `.ramileconfig.json` 设计。当项目规模较大或包含很多自动生成的第三方代码时，硬编码的 [EXCLUDE_DIRS](file:///d:/AutoCode/CodeAnalyse/packages/core/src/code-extractor.ts#L10-L24) 往往不够用。

我们可以设计一个配置读取机制，支持以下字段：
```json
{
  "source_root": "src/",        // 仅扫描此子目录
  "ignore": [
    "legacy/", 
    "temp_generated/"
  ],                            // 额外忽略的文件夹
  "filters": [".ts", ".tsx"],   // 限制只抽取的文件扩展名
  "lines_to_extract": 3000      // 软著抽取的总行数限制
}
```
**实现思路**：
在 [CodeExtractor.scanFiles](file:///d:/AutoCode/CodeAnalyse/packages/core/src/code-extractor.ts#L74) 执行前，尝试在 `workspaceRoot` 查找 `.ruanzhuconfig.json`（或 `ruanzhu.json`）。如果有，则动态合并到 `EXCLUDE_DIRS` 和 `EXCLUDE_EXTENSIONS` 中，或者重设扫描起点。

---

### 借鉴点 3：优化文件选择的本地优先级策略 (Rule-based File Priority)

在没有配置 API Key 或 AI 调用限额失败的“本地降级/预览模式”中，良好的排序规则十分关键。
`chinese-copyright-application-skill` 使用了非常直接的按层级赋权的数组排序：
```python
def _file_priority(self, file_path: str) -> int:
    # 入口脚本最优先，其次是业务逻辑，最后是配置和工具类
```
我们当前的 [sortByPriority](file:///d:/AutoCode/CodeAnalyse/packages/core/src/code-extractor.ts#L148-L171) 仅使用了正则测试，我们可以对其进行增强：
- 将小程序的核心逻辑（如 `app.js`, `app.json`）、前端框架主要入口、后端控制器（`controller`）、服务层（`service`）赋予更高权重。
- 保证在 AI 未介入的纯本地提取场景下，前 30 页和后 30 页仍能精准包含项目的主干运行逻辑，而非混入大量的琐碎辅助脚本（如 `webpack.config.js` 等）。

---

### 借鉴点 4：软件著作权申请表字段核准与合规提示

`chinese-copyright-application-skill` 的申请表模板提供了许多具体的系统环境和硬件规范字段。
我们可以对照其 [application-form-template.md](references/application-form-template.md) 模板，对我们的 [DocumentGenerator.generateApplicationForm](file:///d:/AutoCode/CodeAnalyse/packages/core/src/document-generator.ts#L162-L228) 进行核对：
- **增加精确字段**：比如“权利范围”（全部权利/部分权利）、“软件分类号”、“首次发表城市”等。
- **强化版权局新规提示**：正如我们已经引入的“⚠️ 2026年版权中心新规重要提示”，继续优化并提供直接从申请表草稿复制至中国版权保护中心官网对应栏目的便捷体验。
