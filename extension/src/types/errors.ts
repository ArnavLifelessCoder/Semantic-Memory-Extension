export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly chunkIndex: number,
    public readonly pageId: number
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export class IndexError extends Error {
  constructor(message: string, public readonly operation: 'load' | 'save' | 'search') {
    super(message);
    this.name = 'IndexError';
  }
}

export class SyncError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'SyncError';
  }
}
