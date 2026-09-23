import * as React from 'react'
import { Button, Input, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './JevSettingsSection.module.css'

export type Action = { type: 'none' | 'inject-context' | 'append-reminder'; text: string }
export type RuleOption = { id: string; label: string; action: Action }
export type Rule = {
  id: string; enabled: boolean; phase: 'before' | 'after'; input: string; customInput: string
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
        <strong>{rule.questionSource === 'script' ? '脚本运行时生成题目' : rule.question.trim() || '未填写题目标题'}</strong>
        <span className={styles.ruleSummarySub}>{inputNames[rule.input] ?? '待判断内容未设置'} · {rule.options.length} 个选项</span>
      </div>
      <div className={styles.ruleControls}><Switch checked={rule.enabled} disabled={!writable} label={`启用规则 ${index + 1}`} onChange={enabled => set({ enabled })} /><Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={`jev-rule-${rule.id}`} onClick={toggle}>{expanded ? '收起' : '编辑'}</Button></div>
    </div>
    {expanded && <div className={styles.ruleBody} id={`jev-rule-${rule.id}`}>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><span>01</span><div><strong>事件</strong><small>事件发生时，开始这条规则的判断。</small></div></div>
        <Choice label="触发事件" value={rule.phase} disabled={!writable} choices={[{ id: 'before', label: eventNames.before }, { id: 'after', label: eventNames.after }]} onSelect={changeEvent} />
      </div>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><span>02</span><div><strong>待判断内容</strong><small>明确模型实际会看到哪段内容。</small></div></div>
        <Choice label="内容来源" value={rule.input} disabled={!writable} choices={rule.phase === 'before'
          ? [{ id: 'latest-user-message', label: inputNames['latest-user-message'] }, { id: 'current-context-text', label: inputNames['current-context-text'] }, { id: 'custom-text', label: inputNames['custom-text'] }]
          : [{ id: 'tool-results', label: inputNames['tool-results'] }, { id: 'custom-text', label: inputNames['custom-text'] }]} onSelect={input => set({ input })} />
        <p className={styles.hint}>{sourceDescription}</p>
        {rule.input === 'custom-text' && <label className={styles.field}>自定义待判断内容<textarea className={styles.textarea} value={rule.customInput} maxLength={24000} disabled={!writable} rows={3} placeholder="输入每次事件发生时供判定的固定内容" onChange={event => set({ customInput: event.currentTarget.value })} /></label>}
      </div>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><span>03</span><div><strong>题目</strong><small>题目由标题和下方选项组成。</small></div></div>
        <Choice label="题目来源" value={rule.questionSource} disabled={!writable} choices={[{ id: 'configured', label: '直接配置标题和选项' }, { id: 'script', label: '自定义生成脚本' }]} onSelect={value => set({ questionSource: value as DraftRule['questionSource'] })} />
        {rule.questionSource === 'configured' ? <label className={styles.field}>标题<Input value={rule.question} maxLength={8000} disabled={!writable} placeholder="例如：这条消息是否需要先检查证据？" onChange={event => set({ question: event.currentTarget.value })} /></label>
          : <><label className={styles.field}>题目生成脚本<textarea className={styles.codeArea} value={rule.questionScript} maxLength={16000} disabled={!writable} rows={7} spellCheck={false} placeholder={"// 可使用 event、input、options；支持 await import('node:fs/promises')\nreturn { title: '这条消息是否需要检查证据？', options }"} onChange={event => set({ questionScript: event.currentTarget.value })} /></label>
            <p className={styles.hint}>脚本在本机工作线程执行，可读取文件。必须返回 <code>{'{ title, options: [{ id, label }] }'}</code>；选项 ID 要与下方一致。脚本只生成题目，不能改行为。</p></>}
        <label className={styles.field}>执行行为所需的最低选项概率（%）<Input type="number" min="0" max="100" step="1" value={rule.thresholdPercent} disabled={!writable} onChange={event => set({ thresholdPercent: event.currentTarget.value })} /></label>
      </div>
      <div className={styles.ruleStage}><div className={styles.stageHeading}><span>04</span><div><strong>选项与行为</strong><small>模型选中某项且达到阈值时，执行该选项的行为。</small></div></div>
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
      <div className={styles.ruleFooter}><span>保存规则后才会生效。</span><Button variant="ghost" size="sm" disabled={!writable} onClick={remove}>删除规则</Button></div>
    </div>}
  </article>
}
