import { expect } from 'chai'
import { resolveDataFrameIndex, formatPreviewValue } from '@daemonarium/replay'
import type { DecodedFrame } from '@daemonarium/replay'

function frame(
  typeName: string,
  socket: number,
  cls: DecodedFrame['class'] = 'stimulus'
): DecodedFrame {
  return {
    offset: 0,
    typeName,
    class: cls,
    header: { socket },
    payload: new Uint8Array(),
  }
}

describe('resolveDataFrameIndex', () => {
  it('returns fromIndex when it is already process_data_event', () => {
    const frames = [
      frame('process_copy_event', 0),
      frame('process_data_event', 0),
    ]
    expect(resolveDataFrameIndex(frames, 1, 0)).to.equal(1)
  })

  it('finds next data event on the same socket after a copy', () => {
    const frames = [
      frame('process_copy_event', 0),
      frame('process_copy_event', 1),
      frame('process_data_event', 1),
      frame('process_data_event', 0),
    ]
    expect(resolveDataFrameIndex(frames, 0, 0)).to.equal(3)
    expect(resolveDataFrameIndex(frames, 1, 1)).to.equal(2)
  })

  it('returns null when no data event exists', () => {
    const frames = [frame('process_copy_event', 0)]
    expect(resolveDataFrameIndex(frames, 0, 0)).to.equal(null)
  })
})

describe('formatPreviewValue', () => {
  it('formats primitives and binary', () => {
    expect(formatPreviewValue('hi')).to.equal('"hi"')
    expect(formatPreviewValue(3)).to.equal('3')
    expect(formatPreviewValue(new Uint8Array(4))).to.equal('binary[4]')
  })
})
