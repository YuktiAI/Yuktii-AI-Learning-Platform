export class AiGenerationError extends Error {
  constructor(
    public readonly stage: 'master' | 'stage_content',
    message: string
  ) {
    super(message);
    this.name = 'AiGenerationError';
  }
}
