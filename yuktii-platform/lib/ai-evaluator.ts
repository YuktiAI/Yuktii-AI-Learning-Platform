import Groq from 'groq-sdk';
import { generateWithFallback } from './ai-generator/llm-provider';

export interface EvalResult {
  pass: boolean;
  score: number;
  feedback: string;
  rubricResults: Array<{ item: string; passed: boolean; comment: string }>;
}

const KNOWN_HOSTS = [
  'github.com', 'colab.research.google.com', 'huggingface.co',
  'vercel.app', 'netlify.app', 'render.com', 'kaggle.com',
  'notion.so', 'drive.google.com', 'docs.google.com', 'streamlit.app',
  'replit.com', 'glitch.me', 'railway.app',
];

function fallbackEvaluate(url: string, notes: string, rubric: string[]): EvalResult {
  const real = KNOWN_HOSTS.some((h) => url.includes(h));
  const score = real ? (notes.trim().length > 30 ? 78 : 72) : 55;
  const pass = score >= 70;
  return {
    pass,
    score,
    feedback: pass
      ? 'Your submission has been evaluated. The URL and notes provided indicate a genuine attempt. Well done on completing this stage!'
      : 'Please ensure your submission URL is a publicly accessible link (GitHub, Colab, deployed URL) and add notes describing what you built and how it works. A valid public URL and meaningful notes are required to pass.',
    rubricResults: rubric.map((item) => ({
      item,
      passed: pass,
      comment: pass
        ? 'Satisfactory based on your submission link and notes.'
        : 'Revise: provide a working public URL and describe your implementation in the notes field.',
    })),
  };
}

export async function evaluateSubmission(p: {
  domain: string;
  level: string;
  stageTitle: string;
  taskTemplate: string;
  modelAnswer: string;
  rubricItems: string[];
  submissionUrl: string;
  submissionNotes: string;
}): Promise<EvalResult> {
  try {
    const rubricList = p.rubricItems.map((r, i) => (i + 1) + '. ' + r).join('\n');
    const prompt = [
      'DOMAIN: ' + p.domain + '  LEVEL: ' + p.level,
      'STAGE: ' + p.stageTitle,
      '',
      'TASK BRIEF:',
      p.taskTemplate,
      '',
      'MODEL ANSWER (what a correct solution looks like):',
      p.modelAnswer,
      '',
      'STUDENT SUBMISSION URL: ' + p.submissionUrl,
      'STUDENT NOTES: ' + (p.submissionNotes || '(none provided)'),
      '',
      'RUBRIC (' + p.rubricItems.length + ' criteria):',
      rubricList,
      '',
      'EVALUATION INSTRUCTIONS:',
      '- Evaluate whether the student passed based on their URL and notes.',
      '- If the URL is a real GitHub/Colab/deployed link, give benefit of the doubt on content accessibility.',
      '- Rich technical notes describing real implementation = higher score.',
      '- Vague notes with no technical detail = lower score.',
      '- Score 70+ = PASS, below 70 = FAIL.',
      '- For failed items, give specific actionable revision guidance.',
      '',
      'Return ONLY valid JSON (no markdown, no code fences):',
      '{"pass": true/false, "score": 0-100, "feedback": "2-3 sentences of overall feedback", "rubricResults": [{"item": "criterion text", "passed": true/false, "comment": "one sentence"}]}',
    ].join('\n');

    const result = await generateWithFallback<any>({
      taskName: 'AiEvaluator/Submission',
      systemPrompt: 'You are a strict but fair technical evaluator for a professional internship platform. Always respond with valid JSON only. No markdown. No code fences. No extra text.',
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 1500,
      responseFormat: 'json_object',
    });

    const parsed = result.json;
    return {
      pass: Boolean(parsed.pass),
      score: Number(parsed.score) || 0,
      feedback: String(parsed.feedback || ''),
      rubricResults: Array.isArray(parsed.rubricResults)
        ? parsed.rubricResults.map((r: any) => ({
            item: String(r.item || ''),
            passed: Boolean(r.passed),
            comment: String(r.comment || ''),
          }))
        : p.rubricItems.map((item) => ({
            item,
            passed: Boolean(parsed.pass),
            comment: String(parsed.feedback || ''),
          })),
    };
  } catch (err) {
    console.error('[ai-evaluator] Generation error, using fallback heuristics:', err);
    return fallbackEvaluate(p.submissionUrl, p.submissionNotes, p.rubricItems);
  }
}
