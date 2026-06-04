export interface CodeAnalysis {
  background?: string;
  goals?: string;
  features?: string;
  architecture?: string;
  innovation?: string;
}

export interface CodeFile {
  path: string;
  content: string;
  lines: string[];
  lineCount: number;
}

export interface ExtractionResult {
  totalLines: number;
  selectedFiles: CodeFile[];
  extractedCode: string;
  pages: string[];
}

export interface CopyrightDocuments {
  sourceCode: string;
  manual: string;
  applicationForm: string;
}

export interface ProjectAnalysis {
  projectType: string;
  entryFile: string;
  entryFunction?: string;
  coreDirectories: string[];
  architecture: string;
  shutdownFile?: string;
  estimatedLines?: number;
  fileGroups?: {
    name: string;
    priority: number;
    files: string[];
  }[];
  mergeStrategy?: string;
}

export interface ComplianceIssue {
  type: 'info' | 'warning' | 'error';
  category: 'line_count' | 'copyright' | 'minified' | 'file_count';
  message: string;
  filePath?: string;
  details?: string;
}

export interface ComplianceScanResult {
  ok: boolean;
  score: number;
  issues: ComplianceIssue[];
}

export interface RuanZhuConfig {
  source_root?: string;
  ignore?: string[];
  filters?: string[];
  lines_to_extract?: number;
}


