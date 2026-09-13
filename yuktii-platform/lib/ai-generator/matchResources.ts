/**
 * matchResources — Tag-based resource matching
 *
 * Takes the resourceTags array Groq returned and matches them against the ResourceLink table.
 * Groq NEVER outputs raw URLs. This function is the only path by which real URLs reach students.
 *
 * Matching: a ResourceLink matches if ANY of its tags overlap with ANY of the Groq-returned tags.
 * Returns up to 3 matched links for the given domain.
 */
import { prisma } from '@/lib/prisma';

export interface MatchedResource {
  id: string;
  title: string;
  url: string;
  sourceType: string;
  description: string;
}

export async function matchResources(
  resourceTags: string[],
  domainSlug: string,
): Promise<MatchedResource[]> {
  if (resourceTags.length === 0) return [];

  // Fetch all ResourceLink rows for this domain (table is small, in-memory filter is fine)
  const allLinks = await prisma.resourceLink.findMany({
    where: { domainSlug },
    select: { id: true, title: true, url: true, sourceType: true, description: true, tags: true },
  });

  const normalizedInputTags = resourceTags.map(t => t.toLowerCase().trim());

  const scored = allLinks
    .map(link => {
      let linkTags: string[] = [];
      try {
        linkTags = (JSON.parse(link.tags) as string[]).map(t => t.toLowerCase().trim());
      } catch {
        linkTags = [];
      }
      const overlap = linkTags.filter(t => normalizedInputTags.includes(t)).length;
      return { link, overlap };
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ link }) => ({
      id:          link.id,
      title:       link.title,
      url:         link.url,
      sourceType:  link.sourceType,
      description: link.description,
    }));

  // If no domain-specific match, fall back to cross-domain match (resourceTags only, no domain filter)
  if (scored.length === 0) {
    const allDomainLinks = await prisma.resourceLink.findMany({
      select: { id: true, title: true, url: true, sourceType: true, description: true, tags: true },
    });

    return allDomainLinks
      .map(link => {
        let linkTags: string[] = [];
        try {
          linkTags = (JSON.parse(link.tags) as string[]).map(t => t.toLowerCase().trim());
        } catch {
          linkTags = [];
        }
        const overlap = linkTags.filter(t => normalizedInputTags.includes(t)).length;
        return { link, overlap };
      })
      .filter(({ overlap }) => overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map(({ link }) => ({
        id:          link.id,
        title:       link.title,
        url:         link.url,
        sourceType:  link.sourceType,
        description: link.description,
      }));
  }

  return scored;
}
