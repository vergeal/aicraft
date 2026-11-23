---
name: 问题反馈
description: "当用户想报告 AI Craft 的问题或缺陷时使用。收集标准诊断信息，补充用户的具体复现上下文，并用 GitHub CLI 发布问题。"
icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#f2873c"/><path d="M8.5 11.6 5.9 10.3M8.3 14.4H5.4M8.7 17.1l-2.4 1.4M15.5 11.6l2.6-1.3M15.7 14.4h2.9M15.3 17.1l2.4 1.4" stroke="#7a3a12" stroke-width="1.5" stroke-linecap="round"/><path d="M10.7 7.4 9.6 5.8M13.3 7.4l1.1-1.6" stroke="#7a3a12" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="12" cy="13.3" rx="3.7" ry="4.6" fill="#fff5e8" stroke="#7a3a12" stroke-width="1.4"/><circle cx="12" cy="8.4" r="2.1" fill="#fff5e8" stroke="#7a3a12" stroke-width="1.4"/><circle cx="11.2" cy="8.2" r=".55" fill="#7a3a12"/><circle cx="12.8" cy="8.2" r=".55" fill="#7a3a12"/><path d="M12 10.6v7" stroke="#eab391" stroke-width="1" stroke-linecap="round"/></svg>'
---

<!--
  内置技能包。名称、描述与图标都声明在上面的 frontmatter 里，注册时由 SkillPackage 解析；
  下面的正文成为技能内容，运行时诊断快照会追加到末尾。
-->

# 报告 AI Craft 问题

当用户想报告 AI Craft 的问题或缺陷时使用本技能。你的工作是把用户的问题转化为一个有价值的 GitHub issue，包含标准诊断信息以及复现和解决所需的上下文。

## 工作流

1. 收集下面的标准诊断信息。
2. 只询问复现或理解影响所必需的缺失细节。
3. 用下面的标准格式起草 issue。
4. 在用户确认标题和正文后，用 GitHub CLI 发布它。

未经用户确认不要发布 issue。如果 GitHub CLI 未安装或未认证，说明阻塞原因，并把确切的 issue 标题/正文交给用户。

## 标准诊断信息

尽可能收集这些值：

- AI Craft 版本：运行 `opencode --version`。
- 操作系统：在类 Unix 系统上运行 `uname -a`，在 Windows 上运行 `ver`。
- 终端：检查 `$TERM`、`$TERM_PROGRAM`、`$COLORTERM`，以及用户提供的任何明显的终端应用上下文。
- Shell：在相关时，检查类 Unix 系统上的 `$SHELL`，或 Windows 上的 `%COMSPEC%`/`$ComSpec`。
- 安装/渠道上下文：如果版本输出或环境能显示，说明它看起来是本地、dev、beta 还是 release。
- 活动插件：尽可能检查 AI Craft 配置中已配置的插件。检查可能的配置位置，例如 `aicraft.json`、`aicraft.jsonc`、`.aicraft/aicraft.json` 和 `~/.config/opencode/aicraft.json`。记录已配置的插件条目、`.aicraft/plugin/` 或 `.aicraft/plugins/` 下的本地插件文件，并注明是否无法确定插件状态。

如果某个诊断命令失败，写明 `Unavailable` 并附上原因，而不是猜测。

## 用户特定上下文

记录让问题可被处理的关键信息：

- 用户当时想做什么。
- 发生了什么。
- 用户期望发生什么。
- 复现步骤，最好是最小化且编号的。
- 相关的日志、堆栈跟踪、截图、终端输出或配置片段。
- 问题是稳定复现、偶发还是只出现一次。
- 可能相关的近期改动，例如更新 AI Craft、更改配置、安装插件、更改终端或切换工作区。
- 尝试过的变通方案以及是否有效。

避免粘贴密钥。除非用户明确说可以，否则涂掉 token、API key、私有 URL、用户名和项目特定的机密数据。

## Issue 格式

除非仓库的 issue 模板另有要求，使用这个确切的结构：

```markdown
## 摘要

<!-- 用一两句话描述缺陷和影响。 -->

## 环境

- AI Craft version: <!-- 值或 Unavailable: 原因 -->
- OS: <!-- 值或 Unavailable: 原因 -->
- Terminal: <!-- 值或 Unavailable: 原因 -->
- Shell: <!-- 值或 Unavailable: 原因 -->
- Install/channel: <!-- 值或 Unavailable: 原因 -->
- Active plugins: <!-- 列表、未发现，或 Unavailable: 原因 -->

## 复现步骤

1. <!-- 步骤 -->
2. <!-- 步骤 -->
3. <!-- 步骤 -->

## 预期行为

<!-- 本应发生什么。 -->

## 实际行为

<!-- 实际发生了什么。有确切错误时附上。 -->

## 附加上下文

<!-- 日志、配置片段、截图、频率、变通方案、相关备注。 -->
```

保持标题简短且可搜索。优先使用这种形式：

```text
<区域>: <具体故障或症状>
```

示例：`tui: 在 location provider 之外打开技能对话框时崩溃`、
`cli: 本地服务配置写入了 release 文件名`。

## 用 GitHub CLI 发布

可用时，在仓库检出目录中使用 GitHub CLI：

```sh
gh issue create --title "<title>" --body-file <file>
```

先把正文写入一个临时 Markdown 文件，以保留引用、换行、日志和代码围栏。如果 issue 属于特定仓库，使用 `--repo owner/name`。如果标签很明显且仓库接受，添加 `--label bug`；否则宁可省略标签，也不要猜测。

发布后，把创建的 issue URL 报告给用户，并说明任何不可用的诊断信息。
