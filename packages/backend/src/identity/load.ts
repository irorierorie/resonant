import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import type { ResonantConfig } from '../config.js';
import type { CompanionProfile, LoadedCompanionIdentity } from './types.js';

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function parseProfile(path: string): CompanionProfile | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return (yaml.load(raw) as CompanionProfile) || {};
}

export function findLegacyClaudePath(config: ResonantConfig): string | null {
  const candidates = [
    config.agent.claude_md_path,
    join(config.agent.cwd, '.claude/CLAUDE.md'),
    join(config.agent.cwd, 'CLAUDE.md'),
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export function loadCompanionIdentity(config: ResonantConfig): LoadedCompanionIdentity {
  const profile = parseProfile(config.identity.profile_path);
  const companionMarkdown = readIfExists(config.identity.companion_md_path).trim();

  if (profile || companionMarkdown) {
    return {
      mode: 'profile',
      profile,
      companionMarkdown,
      legacyPrompt: '',
      sourcePaths: {
        ...(profile && { profile: config.identity.profile_path }),
        ...(companionMarkdown && { companionMarkdown: config.identity.companion_md_path }),
      },
    };
  }

  const legacyClaudePath = findLegacyClaudePath(config);
  const legacyPrompt = legacyClaudePath ? readFileSync(legacyClaudePath, 'utf-8') : '';

  return {
    mode: 'legacy-claude',
    profile: null,
    companionMarkdown: '',
    legacyPrompt,
    sourcePaths: {
      ...(legacyClaudePath && { legacyClaude: legacyClaudePath }),
    },
  };
}
