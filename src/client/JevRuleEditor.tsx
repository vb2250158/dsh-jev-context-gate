import * as React from 'react'
import { Button, Input, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './JevSettingsSection.module.css'

export type Action = { type: 'none' | 'inject-context' | 'append-reminder'; text: string }
export type RuleOption = { id: string; label: string; action: Action }
export type Rule = {
  id: string; enabled: boolean; description: string; phase: 'before' | 'after'; input: string; customInput: string
  questionSource: 'configured' | 'script'; questionScript: string; question: string
  options: RuleOption[]; threshold: number
}
export type DraftRule = Omit<Rule, 'threshold'> & { thresholdPercent: string }

const eventNames = { before: '用户发送消息', after: '工具返回结果' }
const inputNames: Record<string, string> = {
  'latest-user-message': '最新一条用户消息的文字',
  'current-context-text': '当前步骤可见的全部文本',
  'tool-results': '本轮工具结果',
  'custom-text': '自定义文字',
}
const actionNames: Record<Action['type'], string> = {
  none: '不执行动作', 'inject-context': '补充主会话上下文', 'append-reminder': '在答复末尾追加提醒',
}

function Choice({ label, value, choices, disabled, onSelect }: {
  label: string; value: string; choices: { id: string; label: string }[]; disabled: boolean; onSelect: (value: string) => void
}): React.ReactNode {
  const [open, setOpen] = React.useState(false)
  return <div className={styles.choiceField}><span>{label}</span><Menu portal autoFocus open={open && !disabled} onClose={() => setOpen(false)}
    selectedId={value} items={choices} onSelect={id => { onSelect(id); setOpen(false) }}
    anchor={<Button variant="outline" size="sm" disabled={disabled} aria-haspopup="menu" aria-expanded={open && !disabled} onClick={() => setOpen(true)}>{choices.find(item => item.id === value)?.label ?? '请选择'} ▾</Button>} /></div>
}

/** Event, input, question and option-owned actions are edited in one rule card. */
export function JevRuleEditor({ rule, index, expanded, writable, update, remove, toggle }: {
  rule: DraftRule; index: number; expanded: boolean; writable: boolean
  update: (rule: DraftRule) => void; remove: () => void; toggle: () => void
}): React.ReactNode {
  const set = (changes: Partial<DraftRule>): void => update({ ...rule, ...changes })
  const updateOption = (id: string, changes: Partial<RuleOption>): void =>
    set({ options: rule.options.map(option => option.id === id ? { ...option, ...changes } : option) })
  const changeEvent = (value: string): void => {
    if (value !== 'before' && value !== 'after') return
    if (value === 'before') set({ phase: value, input: 'latest-user-message', question: '是否需要先检查证据？', thresholdPercent: '80',
      options: [
        { id: 'yes', label: '是', action: { type: 'inject-context', text: '' } },
        { id: 'no', label: '否', action: { type: 'none', text: '' } },
      ] })
    else set({ phase: value, input: 'tool-results', question: '本轮工具结果是否包含失败？', thresholdPercent: '80',
      options: [
        { id: 'failed', label: '有失败', action: { type: 'append-reminder', text: '' } },
        { id: 'success', label: '全部成功', action: { type: 'none', text: '' } },
      ] })
  }
  const sourceDescription = rule.input === 'custom-text'
    ? '使用下方输入的固定文字；每次事件发生都会读取它。'
    : rule.input === 'current-context-text'
      ? '运行时从当前步骤可见消息中提取所有文本；不包含图片或文件内容。'
      : rule.input === 'tool-results'
        ? '运行时读取本轮工具结果的 ID、成功状态和文字；没有工具结果时不判断。'
        : '运行时读取最新一条用户消息的文字；不包含整段会话、图片或文件。'
  return <article className={styles.ruleCard}>
    <div className={styles.ruleHeader}>
      <div className={styles.ruleSummary}>
        <div className={styles.ruleMeta}><span className={styles.ruleNumber}>规则 {index + 1}</span><span className={rule.phase === 'before' ? styles.phaseBefore : styles.phaseAfter}>{eventNames[rule.phase]}</span><span className={styles.threshold}>阈值 {rule.thresholdPercent || '—'}%</span></div>
        <strong>{rule.description.trim() || '未填写规则说明'}</strong>
        <span className={styles.ruleSummarySub}>{rule.questionSource === 'script' ? '题目由脚本生成' : rule.question.trim() || '未填写题目'} · {inputNames[rule.input] ?? '待判断内容未设置'} · {rule.options.length} 个选项</span>
      </div>
      <div className={styles.ruleControls}><Switch checked={rule.enabled} disabled={!writable} label={`启用规则 ${index + 1}`} onChange={enabled => set({ enabled })} /><Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={`jev-rule-${rule.id}`} onClick={toggle}>{expanded ? '收起' : '编辑'}</Button></div>
    </div>
    {expanded && <div className={styles.ruleBody} id={`jev-rule-${rule.id}`}>
      <label className={styles.field}>规则说明<Input value={rule.description} maxLength={500} disabled={!writable} placeholder="用一句话说明这条规则的用途" onChange={event => set({ description: event.currentTarget.value })} /></label>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><strong>事件</strong></div>
        <Choice label="触发事件" value={rule.phase} disabled={!writable} choices={[{ id: 'before', label: eventNames.before }, { id: 'after', label: eventNames.after }]} onSelect={changeEvent} />
      </div>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><strong>待判断内容</strong></div>
        <Choice label="内容来源" value={rule.input} disabled={!writable} choices={rule.phase === 'before'
          ? [{ id: 'latest-user-message', label: inputNames['latest-user-message'] }, { id: 'current-context-text', label: inputNames['current-context-text'] }, { id: 'custom-text', label: inputNames['custom-text'] }]
          : [{ id: 'tool-results', label: inputNames['tool-results'] }, { id: 'custom-text', label: inputNames['custom-text'] }]} onSelect={input => set({ input })} />
        <details className={styles.helpDetails}><summary>实际读取什么内容？</summary><p>{sourceDescription}</p></details>
        {rule.input === 'custom-text' && <label className={styles.field}>自定义待判断内容<textarea className={styles.textarea} value={rule.customInput} maxLength={24000} disabled={!writable} rows={3} placeholder="输入每次事件发生时供判定的固定内容" onChange={event => set({ customInput: event.currentTarget.value })} /></label>}
      </div>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><strong>题目</strong></div>
        <Choice label="题目来源" value={rule.questionSource} disabled={!writable} choices={[{ id: 'configured', label: '直接配置标题和选项' }, { id: 'script', label: '自定义生成脚本' }]} onSelect={value => set({ questionSource: value as DraftRule['questionSource'] })} />
        {rule.questionSource === 'configured' ? <label className={styles.field}>标题<Input value={rule.question} maxLength={8000} disabled={!writable} placeholder="例如：这条消息是否需要先检查证据？" onChange={event => set({ question: event.currentTarget.value })} /></label>
          : <><label className={styles.field}>题目生成脚本<textarea className={styles.codeArea} value={rule.questionScript} maxLength={16000} disabled={!writable} rows={7} spellCheck={false} placeholder={"// 可使用 event、input、options；支持 await import('node:fs/promises')\nreturn { title: '这条消息是否需要检查证据？', options }"} onChange={event => set({ questionScript: event.currentTarget.value })} /></label>
            <details className={styles.helpDetails}><summary>脚本接口说明</summary><p>脚本在本机工作线程执行，可读取文件。返回 <code>{'{ title, options: [{ id, label }] }'}</code>；选项 ID 与下方一致。行为仍由规则配置决定。</p></details></>}
        <label className={`${styles.field} ${styles.thresholdField}`}>执行行为的最低概率（%）<Input type="number" min="0" max="100" step="1" value={rule.thresholdPercent} disabled={!writable} onChange={event => set({ thresholdPercent: event.currentTarget.value })} /></label>
      </div>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><strong>选项与行为</strong></div>
        <div className={styles.ruleOptions}>{rule.options.map((option, optionIndex) => <div className={styles.ruleOption} key={option.id}>
          <div className={styles.optionTitle}><span className={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</span><label className={styles.field}>选项文案<Input value={option.label} maxLength={800} disabled={!writable} aria-label={`规则 ${index + 1} 选项 ${optionIndex + 1}`} onChange={event => updateOption(option.id, { label: event.currentTarget.value })} /></label>
            {rule.phase === 'before' && <Button variant="ghost" size="sm" disabled={!writable || rule.options.length <= 2} onClick={() => set({ options: rule.options.filter(item => item.id !== option.id) })}>移除</Button>}</div>
          <Choice label="动作类型" value={option.action.type} disabled={!writable} choices={rule.phase === 'before'
            ? [{ id: 'none', label: actionNames.none }, { id: 'inject-context', label: actionNames['inject-context'] }]
            : [{ id: 'none', label: actionNames.none }, { id: 'append-reminder', label: actionNames['append-reminder'] }]}
            onSelect={type => updateOption(option.id, { action: { type: type as Action['type'], text: type === 'none' ? '' : option.action.text } })} />
          {option.action.type !== 'none' && <label className={styles.field}>动作参数 · {option.action.type === 'inject-context' ? '补充的上下文' : '追加的提醒文字'}<textarea className={styles.textarea} value={option.action.text} maxLength={8000} disabled={!writable} rows={3} placeholder="输入选中此选项时使用的文字" onChange={event => updateOption(option.id, { action: { ...option.action, text: event.currentTarget.value } })} /></label>}
        </div>)}</div>
        {rule.phase === 'before' && <Button variant="outline" size="sm" disabled={!writable || rule.options.length >= 16} onClick={() => set({ options: [...rule.options, { id: `option-${crypto.randomUUID().replaceAll('-', '')}`, label: '', action: { type: 'none', text: '' } }] })}>添加选项</Button>}
      </div>
      <div className={styles.ruleFooter}><Button variant="ghost" size="sm" disabled={!writable} onClick={remove}>删除规则</Button></div>
    </div>}
  </article>
}
