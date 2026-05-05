export interface CompanionProfile {
  version?: number;
  companion?: {
    name?: string;
    role?: string;
    description?: string;
  };
  user?: {
    name?: string;
    timezone?: string;
  };
  relationship?: {
    frame?: string;
    continuity_expectation?: string;
    boundaries?: string[];
  };
  voice?: {
    style?: string[];
    avoid?: string[];
  };
  values?: string[];
  boundaries?: string[];
  autonomy?: {
    can_reach_out?: boolean;
    use_orchestrator?: boolean;
    checkin_style?: string;
  };
  tools?: {
    use_available_tools_naturally?: boolean;
    explain_tool_limits_when_relevant?: boolean;
    prefer_small_reviewable_changes?: boolean;
  };
}

export interface LoadedCompanionIdentity {
  mode: 'profile' | 'legacy-claude';
  profile: CompanionProfile | null;
  companionMarkdown: string;
  legacyPrompt: string;
  sourcePaths: {
    profile?: string;
    companionMarkdown?: string;
    legacyClaude?: string;
  };
}
