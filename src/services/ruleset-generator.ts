import { prisma } from "@/lib/db";
import type { Ruleset, TvdbData, ApiResultItem } from "@/types";

// Common German show name patterns in MediathekView
const SEASON_EPISODE_PATTERNS = [
  /\(S(\d{2})\/E(\d{2})\)/, // (S01/E01)
  /S(\d{2})E(\d{2})/, // S01E01
  /Staffel\s*(\d+).*Folge\s*(\d+)/i, // Staffel 1 Folge 1
];

const DATE_PATTERNS = [
  /vom\s+(\d{1,2}\.\s*\w+\s*\d{4})/, // vom 15. Januar 2024
  /(\d{1,2}\.\d{1,2}\.\d{4})/, // 15.01.2024
];

interface MediathekSearchResult {
  results: ApiResultItem[];
}

/**
 * Search MediathekView API directly
 */
async function searchMediathekApi(query: string): Promise<ApiResultItem[]> {
  try {
    const response = await fetch("https://mediathekviewweb.de/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({
        queries: [
          {
            fields: ["topic"],
            query: query,
          },
        ],
        sortBy: "timestamp",
        sortOrder: "desc",
        future: false,
        offset: 0,
        size: 50,
      }),
    });

    if (!response.ok) {
      console.warn(`[RulesetGenerator] MediathekView API error: ${response.status}`);
      return [];
    }

    const data: MediathekSearchResult = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("[RulesetGenerator] Error searching MediathekView:", error);
    return [];
  }
}

/**
 * Find the best matching topic from MediathekView results
 */
function findBestMatchingTopic(results: ApiResultItem[], showInfo: TvdbData): string | null {
  if (results.length === 0) return null;

  // Get unique topics
  const topics = [...new Set(results.map((r) => r.topic))];

  // Try to match German name first, then English name
  const searchNames = [
    showInfo.germanName?.toLowerCase(),
    showInfo.name.toLowerCase(),
    ...showInfo.aliases.map((a) => a.name.toLowerCase()),
  ].filter(Boolean) as string[];

  // Exact match
  for (const topic of topics) {
    const topicLower = topic.toLowerCase();
    for (const name of searchNames) {
      if (topicLower === name) {
        console.log(`[RulesetGenerator] Exact topic match: "${topic}"`);
        return topic;
      }
    }
  }

  // Contains match
  for (const topic of topics) {
    const topicLower = topic.toLowerCase();
    for (const name of searchNames) {
      if (topicLower.includes(name) || name.includes(topicLower)) {
        console.log(`[RulesetGenerator] Partial topic match: "${topic}"`);
        return topic;
      }
    }
  }

  // If only one topic in results, use it
  if (topics.length === 1) {
    console.log(`[RulesetGenerator] Using single topic: "${topics[0]}"`);
    return topics[0];
  }

  console.log(`[RulesetGenerator] No matching topic found. Available: ${topics.join(", ")}`);
  return null;
}

/**
 * Detect the best matching strategy based on sample results
 */
function detectMatchingStrategy(results: ApiResultItem[]): string {
  if (results.length === 0) return "SeasonAndEpisodeNumber";

  let seasonEpisodeCount = 0;
  let dateCount = 0;

  for (const result of results.slice(0, 10)) {
    const title = result.title;

    // Check for season/episode patterns
    for (const pattern of SEASON_EPISODE_PATTERNS) {
      if (pattern.test(title)) {
        seasonEpisodeCount++;
        break;
      }
    }

    // Check for date patterns
    for (const pattern of DATE_PATTERNS) {
      if (pattern.test(title)) {
        dateCount++;
        break;
      }
    }
  }

  if (seasonEpisodeCount > dateCount && seasonEpisodeCount > 0) {
    console.log(
      `[RulesetGenerator] Detected strategy: SeasonAndEpisodeNumber (${seasonEpisodeCount} matches)`
    );
    return "SeasonAndEpisodeNumber";
  }

  if (dateCount > 0) {
    console.log(
      `[RulesetGenerator] Detected strategy: ItemTitleEqualsAirdate (${dateCount} matches)`
    );
    return "ItemTitleEqualsAirdate";
  }

  // Default to exact title matching
  console.log("[RulesetGenerator] Detected strategy: ItemTitleExact (default)");
  return "ItemTitleExact";
}

/**
 * Generate regex patterns based on detected format
 */
function generateRegexPatterns(
  results: ApiResultItem[],
  strategy: string
): { episodeRegex: string; seasonRegex: string; titleRegexRules: string } {
  if (strategy === "SeasonAndEpisodeNumber") {
    // Check which pattern is used
    for (const result of results.slice(0, 5)) {
      if (/\(S\d{2}\/E\d{2}\)/.test(result.title)) {
        return {
          episodeRegex: "(?<=E)(\\d{2})(?=\\))",
          seasonRegex: "(?<=S)(\\d{2})(?=/E)",
          titleRegexRules: "[]",
        };
      }
      if (/S\d{2}E\d{2}/.test(result.title)) {
        return {
          episodeRegex: "(?<=E)(\\d{2})",
          seasonRegex: "(?<=S)(\\d{2})(?=E)",
          titleRegexRules: "[]",
        };
      }
    }
  }

  if (strategy === "ItemTitleEqualsAirdate") {
    // Try to detect date format
    for (const result of results.slice(0, 5)) {
      const match = result.title.match(/vom\s+(\d{1,2}\.\s*\w+\s*\d{4})/);
      if (match) {
        const topic = result.topic;
        return {
          episodeRegex: "",
          seasonRegex: "",
          titleRegexRules: JSON.stringify([
            {
              type: "regex",
              field: "title",
              pattern: `^${topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*vom\\s+(\\d{1,2}\\.\\s*\\w+\\s*\\d{4})`,
            },
          ]),
        };
      }
    }
  }

  // Default patterns
  return {
    episodeRegex: "(?<=E)(\\d{2})(?=\\))",
    seasonRegex: "(?<=S)(\\d{2})(?=/E)",
    titleRegexRules: "[]",
  };
}

/**
 * Convert database model to Ruleset type
 */
function convertToRuleset(dbRuleset: {
  id: string;
  topic: string;
  tvdbId: number;
  showName: string;
  germanName: string | null;
  matchingStrategy: string;
  filters: string;
  episodeRegex: string;
  seasonRegex: string;
  titleRegexRules: string;
}): Ruleset {
  return {
    id: parseInt(dbRuleset.id.replace(/-/g, "").slice(0, 8), 16) || 99999,
    mediaId: dbRuleset.tvdbId,
    topic: dbRuleset.topic,
    priority: 0,
    filters: dbRuleset.filters,
    titleRegexRules: dbRuleset.titleRegexRules,
    episodeRegex: dbRuleset.episodeRegex || null,
    seasonRegex: dbRuleset.seasonRegex || null,
    matchingStrategy: dbRuleset.matchingStrategy as Ruleset["matchingStrategy"],
    media: {
      media_id: dbRuleset.tvdbId,
      media_name: dbRuleset.showName,
      media_type: "show",
      media_tvdbId: dbRuleset.tvdbId,
      media_tmdbId: null,
      media_imdbId: null,
    },
  };
}

/**
 * Generate a ruleset for a show if one doesn't exist
 */
export async function generateRulesetForShow(
  tvdbId: number,
  showInfo: TvdbData
): Promise<Ruleset | null> {
  console.log(
    `[RulesetGenerator] Attempting to generate ruleset for "${showInfo.germanName || showInfo.name}" (TVDB: ${tvdbId})`
  );

  // Check if we already have a generated ruleset for this TVDB ID
  const existingByTvdbId = await prisma.generatedRuleset.findFirst({
    where: { tvdbId },
  });

  if (existingByTvdbId) {
    console.log(
      `[RulesetGenerator] Found existing ruleset for TVDB ${tvdbId}: topic="${existingByTvdbId.topic}"`
    );
    return convertToRuleset(existingByTvdbId);
  }

  // Search MediathekView for the show
  const searchQuery = showInfo.germanName || showInfo.name;
  console.log(`[RulesetGenerator] Searching MediathekView for: "${searchQuery}"`);

  const results = await searchMediathekApi(searchQuery);
  console.log(`[RulesetGenerator] MediathekView returned ${results.length} results`);

  if (results.length === 0) {
    // Try English name if German search failed
    if (showInfo.germanName && showInfo.name !== showInfo.germanName) {
      console.log(`[RulesetGenerator] Trying English name: "${showInfo.name}"`);
      const englishResults = await searchMediathekApi(showInfo.name);
      if (englishResults.length > 0) {
        return generateRulesetFromResults(tvdbId, showInfo, englishResults);
      }
    }
    console.log("[RulesetGenerator] No results found in MediathekView");
    return null;
  }

  return generateRulesetFromResults(tvdbId, showInfo, results);
}

async function generateRulesetFromResults(
  tvdbId: number,
  showInfo: TvdbData,
  results: ApiResultItem[]
): Promise<Ruleset | null> {
  // Find the best matching topic
  const matchingTopic = findBestMatchingTopic(results, showInfo);
  if (!matchingTopic) {
    console.log("[RulesetGenerator] Could not find matching topic");
    return null;
  }

  // Check if ruleset for this topic already exists
  const existingByTopic = await prisma.generatedRuleset.findUnique({
    where: { topic: matchingTopic },
  });

  if (existingByTopic) {
    // Update TVDB ID if different
    if (existingByTopic.tvdbId !== tvdbId) {
      console.log(
        `[RulesetGenerator] Topic "${matchingTopic}" exists with different TVDB ID (${existingByTopic.tvdbId} vs ${tvdbId})`
      );
    }
    return convertToRuleset(existingByTopic);
  }

  // Detect matching strategy
  const topicResults = results.filter((r) => r.topic === matchingTopic);
  const strategy = detectMatchingStrategy(topicResults);
  const patterns = generateRegexPatterns(topicResults, strategy);

  // Create new ruleset
  console.log(
    `[RulesetGenerator] Creating new ruleset: topic="${matchingTopic}", strategy="${strategy}"`
  );

  const newRuleset = await prisma.generatedRuleset.create({
    data: {
      topic: matchingTopic,
      tvdbId,
      showName: showInfo.name,
      germanName: showInfo.germanName,
      matchingStrategy: strategy,
      filters: '[{"attribute":"duration","type":"GreaterThan","value":"15"}]',
      episodeRegex: patterns.episodeRegex,
      seasonRegex: patterns.seasonRegex,
      titleRegexRules: patterns.titleRegexRules,
    },
  });

  console.log(`[RulesetGenerator] Created ruleset with ID: ${newRuleset.id}`);
  return convertToRuleset(newRuleset);
}

/**
 * Get all generated rulesets from the database
 */
export async function getGeneratedRulesets(): Promise<Ruleset[]> {
  const dbRulesets = await prisma.generatedRuleset.findMany();
  return dbRulesets.map(convertToRuleset);
}

/**
 * Get generated ruleset for a specific topic
 */
export async function getGeneratedRulesetByTopic(topic: string): Promise<Ruleset | null> {
  const dbRuleset = await prisma.generatedRuleset.findUnique({
    where: { topic },
  });
  return dbRuleset ? convertToRuleset(dbRuleset) : null;
}

/**
 * Get generated ruleset for a specific TVDB ID
 */
export async function getGeneratedRulesetByTvdbId(tvdbId: number): Promise<Ruleset | null> {
  const dbRuleset = await prisma.generatedRuleset.findFirst({
    where: { tvdbId },
  });
  return dbRuleset ? convertToRuleset(dbRuleset) : null;
}
