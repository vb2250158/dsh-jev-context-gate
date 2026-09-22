import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceCorrection, validateEvidenceFacts } from '../src/evidence.mjs'

test('only failed host facts create a bounded correction', () => {
  const result = evidenceCorrection({ answer: '结论', facts: [{ name: 'logs', ok: false, summary: '读取失败' }, { name: 'source', ok: true }] })
  assert.equal(result.status, 'unsupported')
  assert.match(result.correction, /logs/)
  assert.doesNotMatch(result.correction, /source/)
})
test('successful host facts do not add correction', () => assert.deepEqual(evidenceCorrection({ answer: '结论', facts: [{ name: 'source', ok: true }] }), { status: 'supported', correction: '' }))
test('invalid or oversized evidence fails closed', () => {
  assert.throws(() => validateEvidenceFacts([{ name: 'x', ok: 'yes' }]))
  assert.equal(evidenceCorrection({ answer: 'x', facts: [{ name: 'x', ok: false }], maxCharacters: 1 }).status, 'budget-exceeded')
})
