import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWordTimings, ensureTimedLyrics, parseLrc, wordIndexAt } from '../src/lib/lyrics.ts'

test('enhanced LRC keeps source word timestamps', () => {
  const lines = parseLrc('[00:01.00]<00:01.00>Hello <00:01.55>world\n[00:03.00]Next line')
  assert.equal(lines[0].words.length, 2)
  assert.deepEqual(lines[0].words.map(({ t }) => t), [1, 1.55])
  assert.equal(wordIndexAt(buildWordTimings(lines[0], lines[1]), 1.54), 0)
  assert.equal(wordIndexAt(buildWordTimings(lines[0], lines[1]), 1.55), 1)
})

test('short synced songs retain their real line timestamps', () => {
  const lines = parseLrc('[00:01.00]Hello world\n[00:03.00]Next line')
  const timed = ensureTimedLyrics(lines, 120, true)
  assert.equal(timed.simulated, false)
  assert.deepEqual(timed.lyrics.map(({ time }) => time), [1, 3])
})

test('line synced lyrics get ordered estimated word times without filling an instrumental gap', () => {
  const lines = parseLrc('[00:01.00]Hello world\n[00:20.00]Next line')
  const words = buildWordTimings(lines[0], lines[1])
  assert.equal(words.length, 2)
  assert.equal(words[0].t, 1)
  assert.ok(words[1].t > 1 && words[1].t < 10)
})
