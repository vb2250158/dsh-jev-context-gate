import * as React from 'react'
import { Button, Input, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import styles from './JevSettingsSection.module.css'
import { modeForModel } from '../mode.mjs'

type Rule = { id: string; enabled: boolean; phase: 'before' | 'after'; question: string; context: string; threshold: number }
type DraftRule = Omit<Rule, 'threshold'> & { thresholdPercent: string }
type ChoiceResult = { mode: 'llm-json'; model: string; question: string; selected: string; confidence: number; confidenceKind: string; options: { id: string; label: string; probability: number }[]; durationMs: number }
export type Settings = { enabled: boolean; provider: string; model: string; nativeJev: boolean; beforeEnabled: boolean; afterEnabled: boolean; maxContextCharacters: number; maxCorrections: number; rules: Rule[] }
type Injected = { scope: SettingsScope<Settings>; loadCatalog: () => Promise<ModelCatalog> }
export type JevSettingsSectionProps = Partial<Injected> & { close?: () => void }

const toDraft = (rules: Rule[]): DraftRule[] =>
  rules.map(({ threshold, ...rule }) => ({ ...rule, thresholdPercent: String(Math.round(threshold * 100)) }))

function validateDraft(rules: DraftRule[]): Rule[] {
  if (rules.length > 64) throw new Error('最多只能保存 64 条规则。')
  return rules.map((rule, index) => {
    const number = index + 1
    if (!rule.question.trim()) throw new Error(`第 ${number} 条规则缺少判定问题。`)
    if (!rule.context.trim()) throw new Error(`第 ${number} 条规则缺少注入内容。`)
    if (rule.question.length > 8000 || rule.context.length > 8000) throw new Error(`第 ${number} 条规则的文本不能超过 8000 字。`)
    const threshold = Number(rule.thresholdPercent)
    if (!rule.thresholdPercent.trim() || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error(`第 ${number} 条规则的阈值应为 0 至 100%。`)
    const { thresholdPercent: _thresholdPercent, ...fields } = rule
    return { ...fields, threshold: threshold / 100 }
  })
}

export function JevSettingsSection(props: JevSettingsSectionProps): React.ReactNode {
  if (!props.scope || !props.loadCatalog) return <p role="alert">Jev 设置服务未注入。</p>
  return <Loaded scope={props.scope} loadCatalog={props.loadCatalog} />
}

function Loaded({ scope, loadCatalog }: Injected): React.ReactNode {
  const snapshot = React.useSyncExternalStore(listener => scope.subscribe(listener), () => scope.getSnapshot())
  const current = snapshot.value
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  const [catalog, setCatalog] = React.useState<ModelCatalog>()
  const [catalogError, setCatalogError] = React.useState<string>()
  const [loadingCatalog, setLoadingCatalog] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()
  const [rulesError, setRulesError] = React.useState<string>()
  const [draftRules, setDraftRules] = React.useState<DraftRule[] | null>(null)
  const [sourceRules, setSourceRules] = React.useState<string | null>(null)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [testState, setTestState] = React.useState('')
  const [testQuestion, setTestQuestion] = React.useState('')
  const [testOptions, setTestOptions] = React.useState(['是', '否'])
  const [testResult, setTestResult] = React.useState<ChoiceResult>()
  const [testError, setTestError] = React.useState<string>()
  const [testing, setTesting] = React.useState(false)
  const testGeneration = React.useRef(0)
  const savingRef = React.useRef(false)
  const request = React.useRef(0)
  React.useEffect(() => () => { request.current += 1 }, [])
  const writable = snapshot.writable && snapshot.status === 'ready' && current !== undefined && !saving
  const savedRules = current ? JSON.stringify(current.rules) : null
  const dirty = draftRules !== null && sourceRules !== null && JSON.stringify(draftRules) !== JSON.stringify(toDraft(JSON.parse(sourceRules) as Rule[]))
  const changedElsewhere = dirty && savedRules !== sourceRules
  const modelMode = modeForModel(current?.model ?? '')
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

  React.useEffect(() => {
    if (!current || (draftRules !== null && dirty)) return
    setDraftRules(toDraft(current.rules))
    setSourceRules(JSON.stringify(current.rules))
    if (draftRules === null) setExpandedIds(new Set(current.rules.slice(0, 1).map(rule => rule.id)))
  }, [savedRules])

  const updateRule = (id: string, changes: Partial<DraftRule>): void => {
    setDraftRules(rules => rules?.map(rule => rule.id === id ? { ...rule, ...changes } : rule) ?? null)
    setRulesError(undefined)
  }
  const discardRules = (): void => {
    if (!current) return
    setDraftRules(toDraft(current.rules))
    setSourceRules(JSON.stringify(current.rules))
    setRulesError(undefined)
  }
  const saveRules = (): void => {
    if (!writable || !draftRules || !dirty || changedElsewhere || savingRef.current) return
    let rules: Rule[]
    try { rules = validateDraft(draftRules) }
    catch (error) { setRulesError(error instanceof Error ? error.message : String(error)); return }
    savingRef.current = true
    setSaving(true)
    setSaveError(undefined)
    setRulesError(undefined)
    void scope.mutate([{ op: 'set', path: ['rules'], value: rules }])
      .then(() => { setDraftRules(toDraft(rules)); setSourceRules(JSON.stringify(rules)) })
      .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
      .finally(() => { savingRef.current = false; setSaving(false) })
  }
  const refreshCatalog = (): void => {
    const generation = ++request.current
    setLoadingCatalog(true)
    setCatalog(undefined)
    setCatalogError(undefined)
    void loadCatalog().then(value => {
      if (generation === request.current) setCatalog(value)
    }).catch((error: unknown) => {
      if (generation === request.current) setCatalogError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (generation === request.current) setLoadingCatalog(false)
    })
  }
  const models = catalog?.groups.flatMap(group => group.models.map(model => ({
    id: JSON.stringify([group.id, model.id]), provider: group.id, model: model.id,
    label: `${group.name} · ${model.name}`,
  }))) ?? []
  const patch = (value: Partial<Settings>): void => {
    if (!writable || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError(undefined)
    // Provider and model are one revision-fenced mutation, never two writes.
    void scope.mutate(Object.entries(value).map(([field, next]) => ({ op: 'set' as const, path: [field], value: next })))
      .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
      .finally(() => { savingRef.current = false; setSaving(false) })
  }
  const clearTest = (): void => {
    testGeneration.current += 1
    setTestResult(undefined)
    setTestError(undefined)
  }
  const runTest = (): void => {
    if (testing || !current?.provider || !current.model) return
    const generation = ++testGeneration.current
    setTesting(true)
    setTestResult(undefined)
    setTestError(undefined)
    void fetch('/api/dsh-jev-context-gate/test', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: testState, question: testQuestion, options: testOptions }),
    }).then(async response => {
      if (!response.ok) throw new Error(`测试接口返回 ${response.status}。`)
      const payload = await response.json() as { ok: boolean; value?: ChoiceResult; error?: string }
      if (!payload.ok || !payload.value) throw new Error(payload.error ?? '测试没有返回结果。')
      if (generation === testGeneration.current) setTestResult(payload.value)
    }).catch((error: unknown) => { if (generation === testGeneration.current) setTestError(error instanceof Error ? error.message : String(error)) })
      .finally(() => setTesting(false))
  }

  return <section className={styles.section}>
    <header className={styles.pageHeader}>
      <div><h2>Jev 决策测试</h2><p className={styles.intro}>给定内容、题目和选项，查看模型选择与置信度；下方可配置会话门禁。</p></div>
      {current && <span className={current.enabled ? styles.statusOn : styles.statusOff}>{current.enabled ? '已启用' : '未启用'}</span>}
    </header>
    {snapshot.status !== 'ready' || !current ? <p role="status">{snapshot.status === 'loading' ? '正在读取设置…' : '设置不可用，无法读取或保存。'}</p> : <>
      {!snapshot.writable && <p role="status">当前设置只读，无法保存修改。</p>}
      <div className={styles.panel}>
        <div className={styles.sectionHeading}><h3>测试一道选择题</h3><p>只发送到所选判定模型，不写入会话，也不触发门禁规则。</p></div>
        <div className={styles.modelField}><span>判定模型</span>
          <Menu autoFocus portal open={modelMenuOpen && writable} onClose={() => setModelMenuOpen(false)}
            selectedId={current.provider || current.model ? JSON.stringify([current.provider, current.model]) : 'unconfigured'}
            onSelect={id => {
              if (id === 'unconfigured') patch({ provider: '', model: '' })
              else {
                const selected = models.find(model => model.id === id)
                if (!selected) return
                patch({ provider: selected.provider, model: selected.model })
              }
              clearTest()
              setModelMenuOpen(false)
            }}
            items={[{ id: 'unconfigured', label: '清除独立模型配置' }, ...models]}
            anchor={<Button variant="outline" size="sm" disabled={!writable} aria-haspopup="menu" aria-expanded={modelMenuOpen && writable} onClick={() => { setModelMenuOpen(true); refreshCatalog() }}>{current.provider || current.model ? `${current.provider} · ${current.model}` : '选择判定模型'}</Button>} />
        </div>
        {loadingCatalog && <p role="status">正在读取模型目录…</p>}
        {catalogError && <p className={styles.error} role="alert">模型目录加载失败：{catalogError}</p>}
        {catalog?.failures.map(failure => <p className={styles.error} key={failure.id}>模型目录部分加载失败：{failure.name}：{failure.message}</p>)}
        {catalog && models.length === 0 && <p className={styles.note}>目录暂无可选模型；已有配置不会被自动清除。</p>}
        <div className={styles.testModel}><span>当前模型：{current.provider && current.model ? `${current.provider} · ${current.model}` : '未选择'}</span><span className={styles.modeBadge}>{modelMode === 'jev-native' ? 'Jev 原生' : modelMode === 'llm-json' ? 'LLM JSON 模拟' : '待配置'}</span></div>
        <label className={styles.field}>待判断的内容<textarea className={styles.textarea} rows={3} value={testState} maxLength={24000} placeholder="粘贴一段消息、工单或其他文本" onChange={event => { setTestState(event.currentTarget.value); clearTest() }} /></label>
        <label className={styles.field}>题目<Input value={testQuestion} maxLength={2000} placeholder="例如：这条消息最需要哪类处理？" onChange={event => { setTestQuestion(event.currentTarget.value); clearTest() }} /></label>
        <div className={styles.field}><span>选项</span><div className={styles.optionEditor}>{testOptions.map((option, index) =>
          <div className={styles.optionEditRow} key={index}><span className={styles.optionIndex}>{String.fromCharCode(65 + index)}</span><Input aria-label={`选项 ${index + 1}`} value={option} maxLength={800} onChange={event => { const value = event.currentTarget.value; setTestOptions(values => values.map((item, i) => i === index ? value : item)); clearTest() }} /><Button variant="ghost" size="sm" disabled={testOptions.length <= 2} onClick={() => { setTestOptions(values => values.filter((_, i) => i !== index)); clearTest() }}>移除</Button></div>
        )}</div><Button variant="outline" size="sm" disabled={testOptions.length >= 16} onClick={() => { setTestOptions(values => [...values, '']); clearTest() }}>添加选项</Button></div>
        <div className={styles.testActions}><Button variant="primary" size="sm" disabled={testing || modelMode === 'jev-native' || !current.provider || !current.model || !testState.trim() || !testQuestion.trim() || testOptions.some(option => !option.trim())} onClick={runTest}>{testing ? '正在测试…' : '运行测试'}</Button><span className={styles.note}>{modelMode === 'jev-native' ? 'Jev 型号需提供商支持原生结构化接口；接入后可进行原生测试。' : '普通模型的概率是模拟估计，未经校准。'}</span></div>
        {testError && <p className={styles.error} role="alert">测试失败：{testError}</p>}
        {testResult && <div className={styles.testResult} aria-label="测试结果">
          <div className={styles.resultHeading}><div><span className={styles.resultEyebrow}>模型选择</span><strong>{testResult.options.find(option => option.id === testResult.selected)?.label ?? '无结果'}</strong></div><div><span className={styles.resultEyebrow}>模拟置信度</span><strong>{percent(testResult.confidence)}</strong></div></div>
          <p className={styles.note}>题目：{testResult.question}</p>
          <div className={styles.resultOptions}>{testResult.options.map(option => <div className={styles.resultOption} key={option.id}><div><span>{option.label}</span><strong>{percent(option.probability)}</strong></div><div className={styles.barTrack}><div className={styles.barFill} style={{ width: percent(option.probability) }} /></div></div>)}</div>
          <p className={styles.resultFootnote}>置信度是根据选项概率分布计算的集中度，不能当作 Jev 的校准置信度。模型：{testResult.model} · 耗时 {testResult.durationMs} 毫秒</p>
        </div>}
      </div>
      <div className={styles.panel}>
        <div className={styles.sectionHeading}><h3>会话门禁</h3><p>选中的判定模型也可用于门禁，不会改变主会话模型。</p></div>
        <div className={styles.row}><span>启用门禁</span><Switch checked={current.enabled} disabled={!writable} label="启用门禁" onChange={enabled => patch({ enabled })} /></div>
        <div className={styles.row}><span>判定用户消息</span><Switch checked={current.beforeEnabled} disabled={!writable} label="判定用户消息" onChange={beforeEnabled => patch({ beforeEnabled })} /></div>
        <p className={styles.note}>判定方式根据模型型号自动识别。普通模型使用 LLM JSON 模拟；Jev 型号使用原生模式。</p>
      </div>

      <div className={styles.panel}>
        <div className={styles.sectionHeading}><h3>判定规则</h3><p>前置规则可用于当前门禁；后置判定仍在开发。这里展示配置内容，不代表实际命中。</p></div>
        <div className={styles.ruleList}>{(draftRules ?? toDraft(current.rules)).map((rule, index) => {
          const expanded = expandedIds.has(rule.id)
          return <article className={styles.ruleCard} key={rule.id}>
            <div className={styles.ruleHeader}>
              <div className={styles.ruleSummary}>
                <div className={styles.ruleMeta}><span className={styles.ruleNumber}>规则 {index + 1}</span><span className={rule.phase === 'before' ? styles.phaseBefore : styles.phaseAfter}>{rule.phase === 'before' ? '前置判定' : '后置 · 暂未生效'}</span><span className={styles.threshold}>阈值 {rule.thresholdPercent || '—'}%</span></div>
                <strong>{rule.question.trim() || '未填写判定问题'}</strong>
              </div>
              <div className={styles.ruleControls}><Switch checked={rule.enabled} disabled={!writable} label={`启用规则 ${index + 1}`} onChange={enabled => updateRule(rule.id, { enabled })} /><Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={`jev-rule-${rule.id}`} onClick={() => setExpandedIds(ids => { const next = new Set(ids); if (next.has(rule.id)) next.delete(rule.id); else next.add(rule.id); return next })}>{expanded ? '收起' : '编辑'}</Button></div>
            </div>
            {expanded && <div className={styles.ruleBody} id={`jev-rule-${rule.id}`}>
              <label className={styles.field}>判定问题<Input value={rule.question} maxLength={8000} disabled={!writable} placeholder="例如：是否需要先核对运行证据？" onChange={event => updateRule(rule.id, { question: event.currentTarget.value })} /></label>
              <label className={styles.field}>命中后补充给主会话的内容<textarea className={styles.textarea} value={rule.context} maxLength={8000} disabled={!writable} rows={4} placeholder="写明需要调查的内容和证据要求" onChange={event => updateRule(rule.id, { context: event.currentTarget.value })} /></label>
              <div className={styles.ruleDetails}>
                <div className={styles.field}><span>判定阶段</span><div className={styles.phaseChoices}><Button variant={rule.phase === 'before' ? 'primary' : 'outline'} size="sm" disabled={!writable} aria-pressed={rule.phase === 'before'} onClick={() => updateRule(rule.id, { phase: 'before' })}>前置</Button><Button variant={rule.phase === 'after' ? 'primary' : 'outline'} size="sm" disabled={!writable} aria-pressed={rule.phase === 'after'} onClick={() => updateRule(rule.id, { phase: 'after' })}>后置（暂未生效）</Button></div></div>
                <label className={styles.field}>触发阈值（%）<Input type="number" min="0" max="100" step="1" value={rule.thresholdPercent} disabled={!writable} onChange={event => updateRule(rule.id, { thresholdPercent: event.currentTarget.value })} /></label>
              </div>
              <div className={styles.ruleFooter}><span>只有保存后，修改才会用于判定。</span><Button variant="ghost" size="sm" disabled={!writable} onClick={() => setDraftRules(rules => rules?.filter(item => item.id !== rule.id) ?? null)}>删除规则</Button></div>
            </div>}
          </article>
        })}</div>
        {draftRules?.length === 0 && <p className={styles.empty}>还没有规则。添加一条前置规则，写明何时需要调查。</p>}
        <div className={styles.ruleActions}>
          <Button variant="outline" size="sm" disabled={!writable || (draftRules?.length ?? 0) >= 64} onClick={() => {
            const id = `rule-${crypto.randomUUID().replaceAll('-', '')}`
            setDraftRules(rules => [...(rules ?? []), { id, enabled: true, phase: 'before', question: '', context: '', thresholdPercent: '80' }])
            setExpandedIds(ids => new Set([...ids, id]))
          }}>添加规则</Button>
          <span className={dirty ? styles.unsaved : styles.saved}>{dirty ? '有未保存的修改' : '规则已保存'}</span>
          <Button variant="ghost" size="sm" disabled={!writable || !dirty} onClick={discardRules}>放弃修改</Button>
          <Button variant="primary" size="sm" disabled={!writable || !dirty || changedElsewhere} onClick={saveRules}>保存规则</Button>
        </div>
        {changedElsewhere && <p className={styles.error} role="alert">规则已在别处更新。请放弃本地修改并查看最新内容。</p>}
        {rulesError && <p className={styles.error} role="alert">{rulesError}</p>}
      </div>
      {saving && <p role="status">正在保存…</p>}
      {saveError && <p className={styles.error} role="alert">保存失败：{saveError}。请核对当前设置后重试。</p>}
    </>}
  </section>
}
