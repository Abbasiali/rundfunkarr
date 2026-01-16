import { promises as fs } from "fs";
import path from "path";
import type { Ruleset } from "@/types";

// In-memory storage for rulesets indexed by topic
let rulesetsByTopic: Map<string, Ruleset[]> = new Map();
let lastFetchTime: number = 0;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// GitHub raw URLs for auto-update
const GITHUB_RULESETS_URL =
  process.env.RULESETS_URL ||
  "https://raw.githubusercontent.com/mediathekarr/mediathekarr/main/data/rulesets.json";

async function fetchFromGitHub(): Promise<Ruleset[] | null> {
  try {
    console.log(`[Rulesets] Fetching from GitHub: ${GITHUB_RULESETS_URL}`);
    const response = await fetch(GITHUB_RULESETS_URL, {
      headers: { "User-Agent": "MediathekArr" },
    });

    if (!response.ok) {
      console.warn(`[Rulesets] GitHub fetch failed: ${response.status}`);
      return null;
    }

    const rulesets: Ruleset[] = await response.json();
    console.log(`[Rulesets] Fetched ${rulesets.length} rulesets from GitHub`);
    return rulesets;
  } catch (error) {
    console.warn("[Rulesets] Error fetching from GitHub:", error);
    return null;
  }
}

async function loadFromLocalFile(): Promise<Ruleset[]> {
  const rulesetsPath = path.join(process.cwd(), "data", "rulesets.json");
  const fileContent = await fs.readFile(rulesetsPath, "utf-8");
  const rulesets: Ruleset[] = JSON.parse(fileContent);
  console.log(`[Rulesets] Loaded ${rulesets.length} rulesets from local file`);
  return rulesets;
}

function indexRulesets(allRulesets: Ruleset[]): void {
  // Clear and rebuild the topic map
  rulesetsByTopic = new Map();

  // Group rulesets by topic and sort by priority
  for (const ruleset of allRulesets) {
    const existing = rulesetsByTopic.get(ruleset.topic) || [];
    existing.push(ruleset);
    rulesetsByTopic.set(ruleset.topic, existing);
  }

  // Sort each topic's rulesets by priority
  for (const [topic, rulesets] of rulesetsByTopic) {
    rulesetsByTopic.set(
      topic,
      rulesets.sort((a, b) => a.priority - b.priority)
    );
  }

  console.log(
    `[Rulesets] Indexed ${allRulesets.length} rulesets for ${rulesetsByTopic.size} topics`
  );
}

export async function loadRulesets(): Promise<void> {
  try {
    // Try GitHub first, fall back to local file
    let allRulesets = await fetchFromGitHub();

    if (!allRulesets) {
      console.log("[Rulesets] Falling back to local file");
      allRulesets = await loadFromLocalFile();
    }

    indexRulesets(allRulesets);
    lastFetchTime = Date.now();
  } catch (error) {
    console.error("[Rulesets] Error loading rulesets:", error);
  }
}

export async function refreshRulesetsIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastFetchTime > REFRESH_INTERVAL_MS) {
    console.log("[Rulesets] Refreshing rulesets (hourly update)");
    await loadRulesets();
  }
}

export function getRulesetsForTopic(topic: string): Ruleset[] {
  const rulesets = rulesetsByTopic.get(topic) || [];
  return rulesets;
}

export function getRulesetsForTopicAndTvdbId(topic: string, tvdbId: number): Ruleset[] {
  const topicRulesets = getRulesetsForTopic(topic);
  const filtered = topicRulesets.filter((r) => r.media?.media_tvdbId === tvdbId);
  return filtered;
}

export function getAllTopics(): string[] {
  return Array.from(rulesetsByTopic.keys());
}

export function isRulesetsLoaded(): boolean {
  return rulesetsByTopic.size > 0;
}

// Initialize rulesets on first import
let initPromise: Promise<void> | null = null;

export async function ensureRulesetsLoaded(): Promise<void> {
  if (isRulesetsLoaded()) {
    // Check for hourly refresh in background
    refreshRulesetsIfNeeded().catch(console.error);
    return;
  }

  if (!initPromise) {
    initPromise = loadRulesets();
  }

  await initPromise;
}
