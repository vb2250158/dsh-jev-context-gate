import * as React from 'react'
import { Button, Input, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import styles from './JevSettingsSection.module.css'

type Rule = { id: string; enabled: boolean; phase: 'before' | 'after'; question: string; context: string; threshold: number }
type DraftRule = Omit<Rule, 'threshold'> & { thresholdPercent: string }
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
  const savingRef = React.useRef(false)
  const request = React.useRef(0)
  React.useEffect(() => () => { request.current += 1 }, [])
  const writable = snapshot.writable && snapshot.status === 'ready' && current !== undefined && !saving
  const savedRules = current ? JSON.stringify(current.rules) : null
  const dirty = draftRules !== null && sourceRules !== null && JSON.stringify(draftRules) !== JSON.stringify(toDraft(JSON.parse(sourceRules) as Rule[]))
  const changedElsewhere = dirty && savedRules !== sourceRules

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

  return <section className={styles.section}>
    <header className={styles.pageHeader}>
      <div><h2>Jev 上下文门禁</h2><p className={styles.intro}>按规则判断何时需要先调查，再给主会话补充上下文。</p></div>
      {current && <span className={current.enabled ? styles.statusOn : styles.statusOff}>{current.enabled ? '已启用' : '未启用'}</span>}
    </header>
    {snapshot.status !== 'ready' || !current ? <p role="status">{snapshot.status === 'loading' ? '正在读取设置…' : '设置不可用，无法读取或保存。'}</p> : <>
      {!snapshot.writable && <p role="status">当前设置只读，无法保存修改。</p>}
      <div className={styles.panel}>
        <div className={styles.sectionHeading}><h3>运行设置</h3><p>模型仅用于规则判定，不会改变主会话模型。</p></div>
        <div className={styles.row}><span>启用门禁</span><Switch checked={current.enabled} disabled={!writable} label="启用门禁" onChange={enabled => patch({ enabled })} /></div>
        <div className={styles.row}><span>判定用户消息</span><Switch checked={current.beforeEnabled} disabled={!writable} label="判定用户消息" onChange={beforeEnabled => patch({ beforeEnabled })} /></div>
        <div className={styles.row}><span>使用普通模型判定</span><Switch checked={!current.nativeJev} disabled={!writable} label="使用普通模型判定" onChange={enabled => patch({ nativeJev: !enabled })} /></div>
        <p className={styles.note}>{current.nativeJev ? 'Jev 原生判定暂不可用。要使用当前判定器，请打开“使用普通模型判定”。' : '普通模型给出的分数未经校准，仅用于和规则阈值比较。'}</p>
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
              setModelMenuOpen(false)
            }}
            items={[{ id: 'unconfigured', label: '清除独立模型配置' }, ...models]}
            anchor={<Button variant="outline" size="sm" disabled={!writable} aria-haspopup="menu" aria-expanded={modelMenuOpen && writable} onClick={() => { setModelMenuOpen(true); refreshCatalog() }}>{current.provider || current.model ? `${current.provider} · ${current.model}` : '选择判定模型'}</Button>} />
        </div>
        {loadingCatalog && <p role="status">正在读取模型目录…</p>}
        {catalogError && <p className={styles.error} role="alert">模型目录加载失败：{catalogError}</p>}
        {catalog?.failures.map(failure => <p className={styles.error} key={failure.id}>模型目录部分加载失败：{failure.name}：{failure.message}</p>)}
        {catalog && models.length === 0 && <p className={styles.note}>目录暂无可选模型；已有配置不会被自动清除。</p>}
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
