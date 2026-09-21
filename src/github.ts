import {readPreviewState} from './comment.js';
import type {PreviewState, RepositoryContext} from './types.js';

interface GitHubUser {
  login: string;
}

interface IssueComment {
  id: number;
  body: string;
  user: GitHubUser;
}

export class GitHubClient {
  readonly #token: string;
  readonly #context: RepositoryContext;
  readonly #commentAuthor: string;
  readonly #fetch: typeof fetch;

  constructor(
    token: string,
    context: RepositoryContext,
    commentAuthor: string,
    fetcher: typeof fetch = fetch,
  ) {
    if (commentAuthor.trim() === '')
      throw new Error('comment-author is required');
    this.#token = token;
    this.#context = context;
    this.#commentAuthor = commentAuthor;
    this.#fetch = fetcher;
  }

  async findProofComment(): Promise<
    {comment: IssueComment; state: PreviewState} | undefined
  > {
    for (let page = 1; page <= 10; page += 1) {
      const comments = await this.#request<IssueComment[]>(
        `/repos/${this.#context.fullName}/issues/${this.#context.pullRequest}/comments?per_page=100&page=${page}`,
      );
      for (const comment of comments) {
        if (comment.user.login !== this.#commentAuthor) continue;
        const state = readPreviewState(comment.body);
        if (state) return {comment, state};
      }
      if (comments.length < 100) return undefined;
    }
    throw new Error(
      'pull request has too many comments to locate Theme Proof state',
    );
  }

  async upsertComment(body: string): Promise<void> {
    const existing = await this.findProofComment();
    if (existing) {
      await this.#request(
        `/repos/${this.#context.fullName}/issues/comments/${existing.comment.id}`,
        {method: 'PATCH', body: JSON.stringify({body})},
      );
      return;
    }
    await this.#request(
      `/repos/${this.#context.fullName}/issues/${this.#context.pullRequest}/comments`,
      {method: 'POST', body: JSON.stringify({body})},
    );
  }

  async #request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.#fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.#token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'theme-proof-action',
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
