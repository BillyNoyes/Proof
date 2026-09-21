export interface RepositoryContext {
  owner: string;
  repository: string;
  fullName: string;
  repositoryId: number;
  pullRequest: number;
  sha: string;
}

export interface ThemePreview {
  id: string;
  name: string;
  role: string;
  shop: string;
  editorUrl: string;
  previewUrl: string;
}

export interface PreviewState {
  schemaVersion: 1;
  repository: string;
  pullRequest: number;
  context: string;
  store: string;
  themeId: string;
  previewUrl: string;
  editorUrl: string;
  sha: string;
}

export interface ArtifactSummary {
  root: string;
  files: number;
  bytes: number;
}
