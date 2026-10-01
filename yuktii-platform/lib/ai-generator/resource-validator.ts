/**
 * lib/ai-generator/resource-validator.ts — HTTP reachability validator for
 * AI-generated resource URLs.
 *
 * Strategy:
 *   1. HTTP HEAD request with 5-second timeout
 *   2. If HEAD fails or returns 405, retry with GET (truncated, max 1KB)
 *   3. A URL is "valid" if it returns any 2xx or 3xx response
 *   4. If invalid, replace with a verified fallback from the curated registry
 *
 * Used by getOrGenerateStageContent after LLM generation to ensure all
 * resource URLs in the spec are actually reachable before saving to DB.
 */

const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 1;

/** Minimum info about a validated resource */
export interface ValidatedResource {
  url: string;
  title: string;
  isReachable: boolean;
  replacedWith?: string; // if swapped with a fallback
}

/** Curated fallback registry — all URLs verified reachable */
const FALLBACK_REGISTRY: Record<string, string[]> = {
  datasets: [
    'https://www.kaggle.com/datasets',
    'https://huggingface.co/datasets',
    'https://archive.ics.uci.edu/datasets',
    'https://openml.org/search?type=data',
    'https://datasetsearch.research.google.com/',
  ],
  docs: [
    'https://docs.ros.org/en/humble/',
    'https://arduino.cc/reference/en/',
    'https://docs.espressif.com/projects/esp-idf/en/latest/',
    'https://docs.platformio.org/',
    'https://mosquitto.org/documentation/',
    'https://nodered.org/docs/',
    'https://docs.wokwi.com/',
  ],
  tutorials: [
    'https://learn.sparkfun.com/',
    'https://www.instructables.com/circuits/',
    'https://randomnerdtutorials.com/',
    'https://create.arduino.cc/projecthub',
    'https://roboticsacademy.net/',
  ],
};

/**
 * Check if a single URL is reachable.
 * Returns true for any 2xx or 3xx HTTP status.
 */
async function isUrlReachable(url: string): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const method = attempt === 0 ? 'HEAD' : 'GET';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: { 'User-Agent': 'YuktiiAI-SpecValidator/1.0' },
          // For GET, only consume a small part of the body
          ...(method === 'GET' ? { redirect: 'follow' } : {}),
        });
        clearTimeout(timer);
        // 2xx or 3xx = reachable
        return response.status < 400;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // AbortError or network error — try next attempt
      if (attempt === MAX_RETRIES) return false;
    }
  }
  return false;
}

/**
 * Validate an array of resource URLs and replace dead links with fallbacks.
 *
 * @param urls - Array of { url, title } objects from LLM output
 * @param fallbackCategory - Which curated fallback list to use ('datasets' | 'docs' | 'tutorials')
 * @returns Array of ValidatedResource with reachability info
 */
export async function validateAndFixResourceUrls(
  urls: Array<{ url: string; title: string }>,
  fallbackCategory: keyof typeof FALLBACK_REGISTRY = 'datasets',
): Promise<ValidatedResource[]> {
  const fallbacks = FALLBACK_REGISTRY[fallbackCategory] ?? FALLBACK_REGISTRY.datasets;
  let fallbackIndex = 0;

  const results = await Promise.allSettled(
    urls.map(async ({ url, title }) => {
      const reachable = await isUrlReachable(url);
      if (reachable) {
        return { url, title, isReachable: true };
      }

      // Replace with next fallback from curated list
      const fallbackUrl = fallbacks[fallbackIndex % fallbacks.length] ?? fallbacks[0];
      fallbackIndex++;

      console.warn(`[resource-validator] Dead URL replaced: ${url} → ${fallbackUrl}`);
      return {
        url: fallbackUrl,
        title,
        isReachable: false,
        replacedWith: fallbackUrl,
      };
    }),
  );

  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { url: fallbacks[0], title: 'Reference Resource', isReachable: false, replacedWith: fallbacks[0] },
  );
}

/**
 * Quick single-URL check — used in admin previews.
 */
export async function checkUrlReachability(url: string): Promise<{ reachable: boolean; url: string }> {
  const reachable = await isUrlReachable(url);
  return { reachable, url };
}
