import {
  MovingFeatureDataSourceError,
  type MovingFeatureDataSource,
} from './MovingFeatureDataSource'

const SUPPORTED_EXTENSIONS = ['.json', '.mfjson'] as const

const hasSupportedExtension = (filename: string): boolean => {
  const normalizedName = filename.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  )
}

export class FileDataSource implements MovingFeatureDataSource {
  readonly origin = { type: 'file' as const }

  constructor(private readonly file: File) {}

  async load(): Promise<unknown> {
    if (!hasSupportedExtension(this.file.name)) {
      throw new MovingFeatureDataSourceError(
        'data-source',
        'Unsupported file type. Choose a .json or .mfjson file.',
      )
    }

    let contents: string
    try {
      contents = await this.file.text()
    } catch {
      throw new MovingFeatureDataSourceError(
        'data-source',
        `Unable to read ${this.file.name}.`,
      )
    }

    if (contents.trim().length === 0) {
      throw new MovingFeatureDataSourceError(
        'invalid-json',
        `${this.file.name} is empty.`,
      )
    }

    try {
      return JSON.parse(contents) as unknown
    } catch {
      throw new MovingFeatureDataSourceError(
        'invalid-json',
        `${this.file.name} contains malformed JSON.`,
      )
    }
  }
}

export { hasSupportedExtension }
