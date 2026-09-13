/**
 * logger.ts — Structured console logger for the evaluation worker.
 * Each log line includes timestamp, evaluation ID context, and stage.
 */

export interface LogContext {
  evaluationId?: string;
  stage?: string;
  [key: string]: unknown;
}

function formatLine(level: string, message: string, ctx: LogContext): string {
  const ts = new Date().toISOString();
  const evalId = ctx.evaluationId ? `[eval:${ctx.evaluationId.slice(0, 8)}]` : '';
  const stage  = ctx.stage ? `[${ctx.stage}]` : '';
  const extras = Object.entries(ctx)
    .filter(([k]) => k !== 'evaluationId' && k !== 'stage')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return `${ts} ${level} ${evalId}${stage} ${message}${extras ? ' ' + extras : ''}`;
}

export const logger = {
  info: (message: string, ctx: LogContext = {}) =>
    console.log(formatLine('INFO ', message, ctx)),

  warn: (message: string, ctx: LogContext = {}) =>
    console.warn(formatLine('WARN ', message, ctx)),

  error: (message: string, ctx: LogContext = {}) =>
    console.error(formatLine('ERROR', message, ctx)),

  debug: (message: string, ctx: LogContext = {}) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(formatLine('DEBUG', message, ctx));
    }
  },
};
