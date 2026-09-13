/**
 * db.ts — Prisma client for the evaluation worker.
 *
 * Uses the shared schema from the Next.js platform folder.
 * The prisma.schema field in package.json points there.
 */

import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
    });
  }
  return _prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

// Convenience type re-exports for pipeline stages
export type { PrismaClient } from '@prisma/client';
