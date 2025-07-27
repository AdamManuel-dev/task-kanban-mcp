export interface GitRepository {
  path: string;
  name: string;
  remoteUrl?: string;
  currentBranch?: string;
  isClean: boolean;
}

export interface GitBranch {
  name: string;
  isActive: boolean;
  lastCommit?: string;
  lastCommitDate?: Date;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

export interface GitConfig {
  autoDetect: boolean;
  branchPatterns: string[];
  commitKeywords: string[];
  defaultBoard: string;
  branchMapping: Record<string, string>;
}

export interface BoardMappingRule {
  pattern: string;
  boardId: string;
  type: 'branch' | 'repo' | 'path';
  priority: number;
}
