# Yuktii product and evaluation roadmap

## Product promise

Yukti is an evidence-backed learning-to-employment platform. A learner should
be able to build, explain, verify, and present a project that an employer can
trust. A certificate must link to observable work, rather than course
attendance alone.

## Current platform policy

- A stage passes at **50/100 or above**.
- Every passed, non-reviewed stage unlocks the next stage.
- The final stage can issue a certificate only when all stages are complete.
- Every evaluation must show the repository URL, evaluated commit SHA, time,
  score, requirement evidence, test outcomes, and next action.
- AI assistance is permitted. Explicit disclosures are shown as transparency
  notices and do not reduce a score. The platform must not make unsupported
  claims that code is AI-generated.

## Evaluation architecture

1. Clone the public repository and record its default branch and immutable
   HEAD commit SHA.
2. Build a recursive inventory of version-controlled files. Exclude dependency
   folders, generated output, binaries, and vendored code from code-quality
   scoring.
3. Verify README, stack, dependency install, build/start behaviour, tests,
   security basics, and the stage's hidden acceptance tests.
4. Create a source map for every relevant code/config/test/documentation file.
   Read large files in bounded chunks and retain file/line evidence for every
   requirement judgement.
5. Score requirements only from concrete evidence. The model may explain
   evidence; it must not invent execution results or award points for missing
   requirements.
6. Display the exact evaluated SHA. If it matches the previous attempt, tell
   the learner that no new GitHub commit was found and that a similar score is
   expected.
7. Use human review only for material conflicts, prompt-injection attempts,
   confirmed cross-student duplication, or agent failure. Do not send every
   near-threshold result to review.

## Implementation backlog

### P0 - learner journey and reliability

- [x] Use a 50/100 pass threshold in worker, student UI, quick evaluator, and
      review approval.
- [x] Mark every passed stage complete; limit certificate generation to the
      final stage.
- [x] Surface `needs_review` rather than leaving the learner in a loading state.
- [x] Show the evaluated commit SHA and same-commit resubmission explanation.
- [x] Add a non-scoring explicit AI-assistance transparency notice.
- [ ] Add a queue watchdog: queued jobs should retry or fail visibly after a
      defined timeout, with an admin retry action.
- [ ] Add an automated test covering stages 1 through N, a 49 score, a 50
      score, review status, and certificate issuance.

### P1 - robust code evaluation

- [x] Create a tracked-file and source-file inventory before scoring.
- [ ] Add stack detection for Node, Python, Java, .NET, Go, Rust, IoT and Odoo.
- [ ] Run each stage's generated hidden acceptance tests instead of generic
      test discovery when such tests exist.
- [ ] Add static quality/security checks: secret detection, dependency audit,
      unsafe input handling, error handling, and architecture boundaries.
- [ ] Persist per-requirement evidence as file path, line range, command, and
      runtime output.
- [ ] Add an optional learner explanation/mini-viva for flagged work, focused
      on understanding rather than AI authorship detection.

### P2 - career outcomes

- [ ] Produce an employer-viewable proof-of-skill page from each completed
      project: commit SHA, stack, requirements, tests, demo, and mentor report.
- [ ] Build role-based pathways (for example, data analyst, LLM developer,
      backend developer, IoT engineer) with observable competencies.
- [ ] Give the AI tutor persistent learner memory, Socratic guidance, targeted
      revision plans, and interview questions grounded in the learner's code.
- [ ] Add CV/GitHub review, project-based mock interviews, mentor workflows,
      and local internship/employer matching.
- [ ] Give institutions a skills-gap dashboard and employers verified evidence
      rather than simple completion certificates.

## Responsible AI policy

The platform evaluates working software and demonstrated understanding. It may
detect explicit disclosure markers, but it does not infer authorship from code
style, punish AI assistance, or use a probabilistic AI detector to lower marks.
When a transparency marker exists, the learner receives this notice:

> AI assistance may have been used in this submission. This does not affect
> your score. Be prepared to explain your implementation and design choices.

## Operational checklist

- Vercel and Render use the same Neon `DATABASE_URL` and Upstash `REDIS_URL`.
- Render sets `EVALUATION_PASS_SCORE=50`.
- Render worker logs `Worker listening on queue: evaluation` and each submitted
  job logs `Pipeline started`.
- The database URL is Neon pooled URL for application traffic; migrations use
  its direct URL.
- Admins review only intentional `needs_review` cases and can approve, override,
  or request resubmission.
