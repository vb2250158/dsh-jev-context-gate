import * as React from 'react'
import { Button, Input, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import styles from './JevSettingsSection.module.css'

type Rule = { id: string; enabled: boolean; phase: 'before' | 'after'; question: string; context: string; threshold: number }
export type Settings = { enabled: boolean; provider: string; model: string; nativeJev: boolean; beforeEnabled: boolean; afterEnabled: boolean; maxContextCharacters: number; maxCorrections: number; rules: Rule[] }
type Injected = { scope: SettingsScope<Settings>; loadCatalog: () => Promise<ModelCatalog> }
export type JevSettingsSectionProps = Partial<Injected> & { close?: () => void }

export function JevSettingsSection(props: JevSettingsSectionProps): React.ReactNode {
  if (!props.scope || !props.loadCatalog) return <p role="alert">Jev 设置服务未注入。</p>
  return <Loaded scope={props.scope} loadCatalog={props.loadCatalog} />
}
function Loaded({ scope, loadCatalog }: Injected): React.ReactNode {
  const snapshot = React.useSyncExternalStore(listener => scope.subscribe(listener), () => scope.getSnapshot())
  const current = snapshot.value
  const [input, setInput] = React.useState('')
  const [phase, setPhase] = React.useState<'before' | 'after'>('before')
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  const [catalog, setCatalog] = React.useState<ModelCatalog>()
  const [catalogError, setCatalogError] = React.useState<string>()
  const [loadingCatalog, setLoadingCatalog] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()
  const [rulesText, setRulesText] = React.useState('')
  const [rulesError, setRulesError] = React.useState<string>()
  const savingRef = React.useRef(false)
  const request = React.useRef(0)
  React.useEffect(() => () => { request.current += 1 }, [])
  const writable = snapshot.writable && snapshot.status === 'ready' && current !== undefined && !saving
  React.useEffect(() => { if (current && rulesText === '') setRulesText(JSON.stringify(current.rules, null, 2)) }, [current, rulesText])
  const saveRules = (): void => {
    if (!writable) return
    try {
      const parsed = JSON.parse(rulesText)
      if (!Array.isArray(parsed)) throw new Error('规则必须是数组。')
      setRulesError(undefined)
      patch({ rules: parsed })
    } catch (error) { setRulesError(error instanceof Error ? error.message : String(error)) }
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
    <h2>Jev 上下文门禁</h2>
    <p className={styles.intro}>此页配置前置判定。下方仅展示规则，不调用模型、不计算命中率，也不注入会话。</p>
    {snapshot.status !== 'ready' || !current ? <p role="status">{snapshot.status === 'loading' ? '正在读取设置…' : '设置不可用，无法读取或保存。'}</p> : <>
      {!snapshot.writable && <p role="status">当前设置只读，无法保存修改。</p>}
      <div className={styles.row}><span>启用门禁</span><Switch checked={current.enabled} disabled={!writable} label="启用门禁" onChange={enabled => patch({ enabled })} /></div>
      <div className={styles.row}><span>前置用户消息判定</span><Switch checked={current.beforeEnabled} disabled={!writable} label="前置判定" onChange={beforeEnabled => patch({ beforeEnabled })} /></div>
      <div className={styles.row}><span>普通模型 JSON 判定模式</span><Switch checked={!current.nativeJev} disabled={!writable} label="普通模型 JSON 判定模式" onChange={enabled => patch({ nativeJev: !enabled })} /></div>
      <p className={styles.note}>{current.nativeJev ? 'Jev 原生模式尚不支持；请开启普通模型 JSON 判定模式才能使用现有判定器。' : '普通模型返回的评分不是经校准的 confidence。'}</p>
      <p className={styles.note}>后置证据约束尚未实现，此页不提供启用入口。</p>
      {saving && <p role="status">正在保存…</p>}
      {saveError && <p className={styles.error} role="alert">保存失败：{saveError}。请核对当前设置后重试。</p>}
      <div className={styles.field}>独立判定模型（不改变主会话模型）
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
          anchor={<Button variant="outline" size="sm" disabled={!writable} aria-haspopup="menu" aria-expanded={modelMenuOpen && writable} onClick={() => { setModelMenuOpen(true); refreshCatalog() }}>{current.provider || current.model ? `${current.provider} · ${current.model}` : '未配置判定模型'}</Button>} />
      </div>
      {loadingCatalog && <p role="status">正在读取模型目录…</p>}
      {catalogError && <p className={styles.error} role="alert">模型目录加载失败：{catalogError}</p>}
      {catalog?.failures.map(failure => <p className={styles.error} key={failure.id}>模型目录部分加载失败：{failure.name}：{failure.message}</p>)}
      {catalog && models.length === 0 && <p className={styles.note}>目录暂无可选模型；已有配置不会被自动清除。</p>}
      <p className={styles.note}>目录仅供选择参考；未列出的已保存模型不代表不可用。选择不会发起模型测试。</p>
      <div className={styles.test}>
        <h3>规则编辑</h3><textarea className={styles.editor} aria-label="规则 JSON" value={rulesText} disabled={!writable} onChange={event => setRulesText(event.currentTarget.value)} /><div className={styles.actions}><Button variant="primary" size="sm" disabled={!writable || !rulesText.trim()} onClick={saveRules}>保存规则</Button></div>{rulesError && <p className={styles.error} role="alert">规则 JSON 无效：{rulesError}</p>}</div><div className={styles.test}><h3>规则预览（非模型测试）</h3>
        <Input aria-label="预览备注，不参与判定" value={input} placeholder="可选备注，不参与规则判定" onChange={event => setInput(event.currentTarget.value)} />
        <div className={styles.actions}><Button variant="outline" size="sm" onClick={() => setPhase(phase === 'before' ? 'after' : 'before')}>查看阶段：{phase === 'before' ? '前置' : '后置（未实现）'}</Button></div>
        <p className={styles.note}>以下仅列出本阶段已启用的配置规则，不表示规则命中。{input ? `备注：${input}` : ''}</p>
        <pre className={styles.result}>{JSON.stringify(current.rules.filter(rule => rule.enabled && rule.phase === phase), null, 2)}</pre>
      </div>
    </>}
  </section>
}
