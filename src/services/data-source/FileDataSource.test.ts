import { describe, expect, it, vi } from 'vitest'

import { MovingFeatureDataSourceError } from './MovingFeatureDataSource'
import { FileDataSource, hasSupportedExtension } from './FileDataSource'

const file = (name: string, contents: string): File =>
  ({ name, text: vi.fn().mockResolvedValue(contents) }) as unknown as File

describe('FileDataSource', () => {
  it.each(['dataset.json', 'dataset.mfjson', 'DATASET.MFJSON'])(
    'parses supported file %s as unknown JSON',
    async (name) => {
      await expect(
        new FileDataSource(file(name, '{"type":"Feature"}')).load(),
      ).resolves.toEqual({ type: 'Feature' })
    },
  )

  it('reports malformed and empty files as invalid JSON', async () => {
    await expect(
      new FileDataSource(file('broken.json', '{broken')).load(),
    ).rejects.toMatchObject({
      kind: 'invalid-json',
      message: 'broken.json contains malformed JSON.',
    })
    await expect(
      new FileDataSource(file('empty.mfjson', '  ')).load(),
    ).rejects.toMatchObject({
      kind: 'invalid-json',
      message: 'empty.mfjson is empty.',
    })
  })

  it('rejects unsupported extensions before reading', async () => {
    const text = vi.fn().mockResolvedValue('{}')
    const unsupported = { name: 'dataset.txt', text } as unknown as File

    await expect(new FileDataSource(unsupported).load()).rejects.toBeInstanceOf(
      MovingFeatureDataSourceError,
    )
    expect(text).not.toHaveBeenCalled()
    expect(hasSupportedExtension('dataset.txt')).toBe(false)
  })

  it('wraps unreadable files as a data-source failure', async () => {
    const unreadable = {
      name: 'private.json',
      text: vi.fn().mockRejectedValue(new Error('denied')),
    } as unknown as File

    await expect(new FileDataSource(unreadable).load()).rejects.toMatchObject({
      kind: 'data-source',
      message: 'Unable to read private.json.',
    })
  })
})
