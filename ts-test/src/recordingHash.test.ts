import { expect } from 'chai'
import {
  parseRecordingHash,
  serializeRecordingHash,
  hashesEqual,
} from '../../src/replay/recordingHash.js'

describe('recordingHash', () => {
  it('round-trips tab + msg + frame', () => {
    const state = { tab: 'messages' as const, msg: 3, frame: 12 }
    const hash = serializeRecordingHash(state)
    expect(hash).to.equal('#tab=messages&msg=3&frame=12')
    expect(parseRecordingHash(hash)).to.deep.equal(state)
  })

  it('round-trips environment focus', () => {
    const state = {
      tab: 'environment' as const,
      sock: 0,
      owner: 'DbgEcho',
      method: 'echo',
      msg: 1,
      frame: 0,
    }
    expect(parseRecordingHash(serializeRecordingHash(state))).to.deep.equal(state)
  })

  it('returns null for empty / unknown tab', () => {
    expect(parseRecordingHash('')).to.equal(null)
    expect(parseRecordingHash('#foo=1')).to.equal(null)
    expect(parseRecordingHash('#tab=nope')).to.equal(null)
  })

  it('hashesEqual compares serialized form', () => {
    expect(hashesEqual({ tab: 'api' }, { tab: 'api' })).to.equal(true)
    expect(hashesEqual({ tab: 'api' }, { tab: 'events' })).to.equal(false)
  })
})
