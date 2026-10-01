-- Workstream D: retain the full per-enrollment, versioned evaluator specification.
ALTER TABLE "StageGeneratedContent" ADD COLUMN IF NOT EXISTS "projectSpec" TEXT;
ALTER TABLE "StageGeneratedContent" ADD COLUMN IF NOT EXISTS "specVersion" TEXT NOT NULL DEFAULT 'v1.0';
ALTER TABLE "StageGeneratedContent" ADD COLUMN IF NOT EXISTS "specHash" TEXT;
