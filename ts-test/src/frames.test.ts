import { expect } from 'chai'
import { direction } from '@wa-os/ts-kernel/src/kernelApi.js'
import {
  encodeMonitorFrame,
  parseMonitorFrames,
  classifyFrame,
} from '../../src/replay/frames.js'

describe('parseMonitorFrames', () => {
  it('round-trips Copy IN + Data and classifies them', () => {
    const payload = new Uint8Array([1, 2, 3, 4])
    const copy = encodeMonitorFrame(
      'process_copy_event',
      {
        _type: 'process_copy_event',
        process: 5,
        socket: 0,
        direction: direction.IN,
        amount: payload.length,
      },
      payload
    )
    const data = encodeMonitorFrame('process_data_event', {
      _type: 'process_data_event',
      process: 5,
      socket: 0,
      direction: direction.IN,
    })
    const events = new Uint8Array(copy.length + data.length)
    events.set(copy, 0)
    events.set(data, copy.length)

    const frames = parseMonitorFrames(events)
    expect(frames).to.have.length(2)
    expect(frames[0].typeName).to.equal('process_copy_event')
    expect(frames[0].class).to.equal('stimulus')
    expect(Buffer.from(frames[0].payload).equals(Buffer.from(payload))).to.equal(true)
    expect(frames[1].typeName).to.equal('process_data_event')
    expect(frames[1].class).to.equal('stimulus')
  })

  it('classifies Copy OUT as expect and bind as topology', () => {
    expect(
      classifyFrame('process_copy_event', { direction: direction.OUT })
    ).to.equal('expect')
    expect(classifyFrame('process_bind_event', {})).to.equal('topology')
    expect(classifyFrame('process_error_event', {})).to.equal('anchor')
  })
})
