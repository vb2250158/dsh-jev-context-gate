import test from 'node:test'
import assert from 'node:assert/strict'
import { judge } from '../src/judge.mjs'

const settings = { provider: 'test', model: 'judge', nativeJev: false, maxContextCharacters: 2000, rules: [{ id: 'r1', enabled: true, phase: 'before', question: '需要证据吗', context: '先检查证据', threshold: 0.8 }] }
const chunks = text => async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } } }()
const createMessage = text => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })

test('structured generic verdict injects configured context only', async () => {
  const result = await judge({ settings, phase: 'before', text: '截图显示错误', stream: () => chunks('{"r1":{"matchProbability":0.9}}'), createMessage })
  assert.equal(result.scoreKind, 'self-reported')
  assert.equal(result.context, '[r1]\n先检查证据')
})

test('invalid verdict fails closed', async () => {
  await assert.rejects(() => judge({ settings, phase: 'before', text: 'x', stream: () => chunks('{"r1":{"matchProbability":2}}'), createMessage }))
})

test('tool calls are rejected by the judgement boundary', async () => {
  const stream = async function* () { yield { type: 'tool-call-delta', index: 0, id: 'x', argumentsDelta: '{}' }; yield { type: 'finish', reason: { kind: 'stop' } } }()
  await assert.rejects(() => judge({ settings, phase: 'before', text: 'x', stream: () => stream, createMessage }))
})

test('Jev model IDs select native mode without the legacy switch', async () => {
  await assert.rejects(() => judge({ settings: { ...settings, model: 'jev-latest', nativeJev: false }, phase: 'before', text: 'x', stream: () => chunks('{}'), createMessage }), /Native Jev/)
})
