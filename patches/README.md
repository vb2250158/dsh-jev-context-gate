# 完整请求上下文补丁

`2026-10-10-request-context-policy.patch` 对应 DSH `0.2.1-alpha.1`、上游提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。已验证纯净上游基线及叠加 `2026-10-09-consolidated-on-5badb15.patch` 的本机环境；该既有补丁由受管环境提供，本插件不复制它。应用前保留现有改动，并核对实际基线；`git apply --check` 失败时先处理差异，不能强行覆盖。

在 DSH 源码目录执行，下列 `<plugin>` 为已检出的本插件绝对目录：

```powershell
git apply --check <plugin>/patches/2026-10-10-request-context-policy.patch
git apply <plugin>/patches/2026-10-10-request-context-policy.patch
pnpm exec tsc -b packages/core/agent-loop/tsconfig.json packages/compaction/compaction-basic/tsconfig.json
pnpm exec tsdown --filter @deepseek-ai/dsh-agent-loop --filter @deepseek-ai/dsh-compaction-basic
pnpm run gen-cordis-catalog
pnpm run verify-translation-pairing --write packages/core/agent/README.md packages/core/agent-loop/README.md packages/compaction/compaction/README.md packages/compaction/compaction-basic/README.md docs/architecture.md
```

随后按受管清单安装本插件，重启宿主并恢复原会话。补丁改变自动压缩的触发时机：完整输入与实际路由先写入日志，再运行 `agent/request-context`，压缩结束后运行 `agent/request-context-ready`，最后冻结请求。0.1.36 还要求驱动的 `requestContextFinalizeVersion`；已应用旧补丁的环境须补上该入口后重建。依赖旧 `agent/pre-step` 压缩顺序的扩展须迁移；普通输入改写继续使用 `agent/pre-step`。策略通过 `compaction/pressure-policy` 解析触发线、压缩目标和尾部保留量；不修改模型实际输出上限。

所有模型可见替换通过既有持久事件记录，无新增会话事件类型、存储版本或历史覆盖。卸载插件会撤销工具和监听；已经写入日志的替换仍生效，原始内容保留。要停止后续整理，设置 `contextPolicy.enabled: false`；回退宿主代码前先关闭策略，再按安装快照恢复。上游变更后重新检查补丁，不重复应用。

验证命令：在本插件目录运行 `npm run check`；设置 `DSH_SOURCE_ROOT` 为已打补丁的源码目录后运行 `node tests/host-smoke.mjs`。该测试通过真实 Loader 和生产 AgentLoop 发出 31 次无密钥模型请求，检查最新状态唯一、未变化状态不重注入、授权文本保留和完整原文可读，并对照持久快照。
