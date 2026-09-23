import * as React from 'react'
import { Button, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import styles from './JevSettingsSection.module.css'
import { modeForModel } from '../mode.mjs'
import { validateRules } from '../policy.mjs'
import { JevTestPage } from './JevTestPage.tsx'
import { JevRuleEditor } from './JevRuleEditor.tsx'
import type { DraftRule, Rule } from './JevRuleEditor.tsx'

export type Settings = { enabled: boolean; provider: string; model: string; nativeJev: boolean; beforeEnabled: boolean; afterEnabled: boolean; maxContextCharacters: number; maxCorrections: number; rules: Rule[] }
type Injected = { scope: SettingsScope<Settings>; loadCatalog: () => Promise<ModelCatalog> }
export type JevSettingsSectionProps = Partial<Injected> & { close?: () => void }

const toDraft = (rules: Rule[]): DraftRule[] =>
  validateRules(rules).map(({ threshold, ...rule }) => ({ ...rule, thresholdPercent: String(Math.round(threshold * 100)) }))

function validateDraft(rules: DraftRule[]): Rule[] {
  if (rules.length > 64) throw new Error('最多只能保存 64 条规则。')
  return rules.map((rule, index) => {
    const number = index + 1
    if (rule.questionSource === 'configured' && !rule.question.trim()) throw new Error(`第 ${number} 条规则缺少题目标题。`)
    if (rule.questionSource === 'script' && !rule.questionScript.trim()) throw new Error(`第 ${number} 条规则缺少题目生成脚本。`)
    if (rule.input === 'custom-text' && !rule.customInput.trim()) throw new Error(`第 ${number} 条规则缺少自定义待判断内容。`)
    if (rule.options.length < 2 || rule.options.length > 16 || rule.options.some(option => !option.label.trim() || (option.action.type !== 'none' && !option.action.text.trim()))) throw new Error(`第 ${number} 条规则的选项文案或动作参数不完整。`)
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
  const [page, setPage] = React.useState<'rules' | 'test'>('rules')
  const savingRef = React.useRef(false)
  const request = React.useRef(0)
  React.useEffect(() => () => { request.current += 1 }, [])
  const writable = snapshot.writable && snapshot.status === 'ready' && current !== undefined && !saving
  const savedRules = current ? JSON.stringify(current.rules) : null
  const dirty = draftRules !== null && sourceRules !== null && JSON.stringify(draftRules) !== JSON.stringify(toDraft(JSON.parse(sourceRules) as Rule[]))
  const changedElsewhere = dirty && savedRules !== sourceRules
  const modelMode = modeForModel(current?.model ?? '')

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
  if (page === 'test') return <JevTestPage model={current} onBack={() => setPage('rules')} />
  return <section className={styles.section}>
    <header className={styles.pageHeader}>
      <div><h2>Jev 规则配置</h2><p className={styles.intro}>选择判定模型，设置哪些消息需要判断，以及命中后补充什么内容。</p></div>
      <div className={styles.headerActions}>{current && <span className={current.enabled ? styles.statusOn : styles.statusOff}>{current.enabled ? '已启用' : '未启用'}</span>}<Button variant="primary" size="sm" onClick={() => setPage('test')}>打开测试页面</Button></div>
    </header>
    {snapshot.status !== 'ready' || !current ? <p role="status">{snapshot.status === 'loading' ? '正在读取设置…' : '设置不可用，无法读取或保存。'}</p> : <>
      {!snapshot.writable && <p role="status">当前设置只读，无法保存修改。</p>}
      <div className={styles.panel}>
        <div className={styles.sectionHeading}><h3>运行设置</h3><p>总开关控制所有已启用规则；判定模型独立于主会话模型。</p></div>
        <div className={styles.row}><span>启用 Jev</span><Switch checked={current.enabled} disabled={!writable} label="启用 Jev" onChange={enabled => patch({ enabled })} /></div>
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
        <div className={styles.testModel}><span>当前模型：{current.provider && current.model ? `${current.provider} · ${current.model}` : '未选择'}</span><span className={styles.modeBadge}>{modelMode === 'jev-native' ? 'Jev 原生' : modelMode === 'llm-json' ? 'LLM JSON 模拟' : '待配置'}</span></div>
        <p className={styles.note}>普通模型使用 LLM JSON 判定；Jev 型号需模型提供商接入原生结构化调用。</p>
      </div>

      <div className={styles.panel}>
        <div className={styles.sectionHeading}><h3>规则</h3><p>每条规则依次配置事件、待判断内容、题目和选项。行为设置在对应选项里。</p></div>
        <div className={styles.ruleList}>{(draftRules ?? toDraft(current.rules)).map((rule, index) =>
          <JevRuleEditor key={rule.id} rule={rule} index={index} expanded={expandedIds.has(rule.id)} writable={writable}
            update={next => updateRule(rule.id, next)}
            remove={() => setDraftRules(rules => rules?.filter(item => item.id !== rule.id) ?? null)}
            toggle={() => setExpandedIds(ids => { const next = new Set(ids); if (next.has(rule.id)) next.delete(rule.id); else next.add(rule.id); return next })} />
        )}</div>
        {draftRules?.length === 0 && <p className={styles.empty}>还没有规则。添加一条规则，选择事件并配置题目、选项与行为。</p>}
        <div className={styles.ruleActions}>
          <Button variant="outline" size="sm" disabled={!writable || (draftRules?.length ?? 0) >= 64} onClick={() => {
            const id = `rule-${crypto.randomUUID().replaceAll('-', '')}`
            setDraftRules(rules => [...(rules ?? []), { id, enabled: true, phase: 'before', input: 'latest-user-message', customInput: '',
              questionSource: 'configured', questionScript: '', question: '', thresholdPercent: '80',
              options: [{ id: 'yes', label: '是', action: { type: 'inject-context', text: '' } }, { id: 'no', label: '否', action: { type: 'none', text: '' } }] }])
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
