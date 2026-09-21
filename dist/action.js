import {
  getInput,
  info,
  notice,
  setFailed,
  setOutput,
  setSecret,
  summary,
  validateThemeArtifact
} from "./chunk-JESWGQF2.js";

// src/action.ts
import { resolve } from "path";

// src/config.ts
import { createHash } from "crypto";
import { readFile } from "fs/promises";
var contextPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
var storePattern = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
function normalizeStore(value) {
  let store = value.trim().toLowerCase();
  if (store.startsWith("https://")) store = store.slice("https://".length);
  if (store.endsWith("/")) store = store.slice(0, -1);
  if (!storePattern.test(store)) {
    throw new Error("store must be a full myshopify.com domain");
  }
  return store;
}
function resolvePreviewContext(configured, repositoryId, pullRequest) {
  const value = configured.trim() || `proof-${repositoryId}-${pullRequest}`;
  if (contextPattern.test(value) && value.length <= 64) return value;
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 20);
  return `proof-${repositoryId}-${pullRequest}-${digest}`.slice(0, 64);
}
function parseBoolean(value, name) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}
async function readRepositoryContext(eventPath, pullRequestInput) {
  const value = JSON.parse(await readFile(eventPath, "utf8"));
  const event = object(value, "GitHub event");
  const repository = object(event.repository, "repository");
  const owner = object(repository.owner, "repository.owner");
  const pullRequest = object(event.pull_request, "pull_request");
  const head = object(pullRequest.head, "pull_request.head");
  const fullName = string(repository.full_name, "repository.full_name");
  const [ownerName, repositoryName] = fullName.split("/");
  if (!ownerName || !repositoryName || ownerName !== string(owner.login, "owner.login")) {
    throw new Error("GitHub event contains an invalid repository identity");
  }
  const eventNumber = integer(pullRequest.number, "pull_request.number");
  const configuredNumber = pullRequestInput.trim();
  const pullRequestNumber = configuredNumber ? positiveInteger(configuredNumber, "pull-request-number") : eventNumber;
  if (pullRequestNumber !== eventNumber) {
    throw new Error("pull-request-number does not match the GitHub event");
  }
  return {
    owner: ownerName,
    repository: repositoryName,
    fullName,
    repositoryId: integer(repository.id, "repository.id"),
    pullRequest: pullRequestNumber,
    sha: string(head.sha, "pull_request.head.sha")
  };
}
function object(value, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}
function string(value, name) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}
function integer(value, name) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}
function positiveInteger(value, name) {
  if (!/^\d+$/.test(value))
    throw new Error(`${name} must be a positive integer`);
  return integer(Number(value), name);
}

// src/comment.ts
var markerPattern = /<!-- theme-proof-state:([A-Za-z0-9_-]+) -->/;
function renderPreviewComment(state) {
  return [
    "## Theme Proof",
    "",
    `Preview updated for \`${escapeCode(state.sha.slice(0, 12))}\`.`,
    "",
    `[Storefront preview](${state.previewUrl}) \xB7 [Theme Editor](${state.editorUrl})`,
    "",
    `Theme Check: passed  `,
    `Context: \`${escapeCode(state.context)}\``,
    "",
    marker(state)
  ].join("\n");
}
function renderRemovedComment(state) {
  return [
    "## Theme Proof",
    "",
    "Preview removed because this pull request was closed.",
    "",
    `Last deployed commit: \`${escapeCode(state.sha.slice(0, 12))}\``,
    "",
    marker(state)
  ].join("\n");
}
function readPreviewState(body) {
  const encoded = markerPattern.exec(body)?.[1];
  if (!encoded) return void 0;
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Theme Proof comment contains invalid state");
  }
  return validateState(value);
}
function marker(state) {
  return `<!-- theme-proof-state:${Buffer.from(JSON.stringify(state)).toString("base64url")} -->`;
}
function validateState(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Theme Proof comment contains invalid state");
  }
  const state = value;
  if (state.schemaVersion !== 1 || typeof state.repository !== "string" || typeof state.pullRequest !== "number" || typeof state.context !== "string" || typeof state.store !== "string" || typeof state.themeId !== "string" || typeof state.previewUrl !== "string" || typeof state.editorUrl !== "string" || typeof state.sha !== "string") {
    throw new Error("Theme Proof comment contains invalid state");
  }
  return state;
}
function escapeCode(value) {
  return value.replaceAll("`", "\\`");
}

// src/github.ts
var GitHubClient = class {
  #token;
  #context;
  #commentAuthor;
  #fetch;
  constructor(token, context, commentAuthor, fetcher = fetch) {
    if (commentAuthor.trim() === "")
      throw new Error("comment-author is required");
    this.#token = token;
    this.#context = context;
    this.#commentAuthor = commentAuthor;
    this.#fetch = fetcher;
  }
  async findProofComment() {
    for (let page = 1; page <= 10; page += 1) {
      const comments = await this.#request(
        `/repos/${this.#context.fullName}/issues/${this.#context.pullRequest}/comments?per_page=100&page=${page}`
      );
      for (const comment of comments) {
        if (comment.user.login !== this.#commentAuthor) continue;
        const state = readPreviewState(comment.body);
        if (state) return { comment, state };
      }
      if (comments.length < 100) return void 0;
    }
    throw new Error(
      "pull request has too many comments to locate Theme Proof state"
    );
  }
  async upsertComment(body) {
    const existing = await this.findProofComment();
    if (existing) {
      await this.#request(
        `/repos/${this.#context.fullName}/issues/comments/${existing.comment.id}`,
        { method: "PATCH", body: JSON.stringify({ body }) }
      );
      return;
    }
    await this.#request(
      `/repos/${this.#context.fullName}/issues/${this.#context.pullRequest}/comments`,
      { method: "POST", body: JSON.stringify({ body }) }
    );
  }
  async #request(path, init = {}) {
    const response = await this.#fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.#token}`,
        "Content-Type": "application/json",
        "User-Agent": "theme-proof-action",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status})`);
    }
    if (response.status === 204) return void 0;
    return await response.json();
  }
};

// src/shopify.ts
import { spawn } from "child_process";
var minimumCliVersion = [4, 6, 1];
var maxOutputBytes = 1e6;
var ShopifyClient = class {
  #command;
  #store;
  #password;
  #runner;
  constructor(options) {
    this.#command = options.command;
    this.#store = options.store;
    this.#password = options.password;
    this.#runner = options.runner ?? runCommand;
  }
  async verifyVersion() {
    const result = await this.#run(["version"], void 0, 3e4);
    const version = /\b(\d+)\.(\d+)\.(\d+)\b/.exec(result.stdout)?.slice(1).map(Number);
    if (!version || version.length !== 3) {
      throw new Error("could not determine the Shopify CLI version");
    }
    if (compareVersion(version, minimumCliVersion) < 0) {
      throw new Error(
        `Shopify CLI ${minimumCliVersion.join(".")} or newer is required`
      );
    }
    return version.join(".");
  }
  async pushPreview(options) {
    const args = [
      "theme",
      "push",
      "--path",
      options.path,
      "--development-context",
      options.context,
      "--json"
    ];
    if (options.strict) args.push("--strict");
    const result = await this.#run(args, options.path, 10 * 6e4);
    return parseThemePreview(result.stdout, this.#store);
  }
  async deleteTheme(themeId2) {
    if (!/^\d+$/.test(themeId2))
      throw new Error("theme ID must contain only digits");
    await this.#run(
      ["theme", "delete", "--theme", themeId2, "--force", "--no-color"],
      void 0,
      5 * 6e4
    );
  }
  async #run(args, cwd, timeoutMs) {
    const env = {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: this.#password,
      SHOPIFY_FLAG_STORE: this.#store,
      SHOPIFY_FLAG_FORCE: "1",
      SHOPIFY_FLAG_NO_UPDATE: "1"
    };
    const options = {
      env,
      timeoutMs
    };
    if (cwd !== void 0) options.cwd = cwd;
    const result = await this.#runner(this.#command, args, options);
    if (result.code !== 0) {
      throw new Error(
        redact(
          `Shopify CLI failed (${result.code}): ${result.stderr}`,
          this.#password
        )
      );
    }
    return result;
  }
};
function parseThemePreview(stdout, expectedStore) {
  let value;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    throw new Error("Shopify CLI returned invalid JSON");
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Shopify CLI returned invalid theme data");
  }
  const theme = value.theme;
  if (typeof theme !== "object" || theme === null) {
    throw new Error("Shopify CLI returned invalid theme data");
  }
  const data = theme;
  const id = themeId(data.id);
  const name = requiredString(data.name, "theme.name");
  const role = requiredString(data.role, "theme.role");
  const shop = requiredString(data.shop, "theme.shop").toLowerCase();
  const editorUrl = validatedUrl(data.editor_url, "theme.editor_url");
  const previewUrl = validatedUrl(data.preview_url, "theme.preview_url");
  if (shop !== expectedStore)
    throw new Error("Shopify CLI returned a different store");
  if (role !== "development") {
    throw new Error("Shopify CLI did not return a development theme");
  }
  if (previewUrl.hostname !== expectedStore) {
    throw new Error("Shopify CLI returned a preview URL for a different store");
  }
  if (previewUrl.searchParams.get("preview_theme_id") !== id) {
    throw new Error("Shopify CLI returned a mismatched preview URL");
  }
  if (![expectedStore, "admin.shopify.com"].includes(editorUrl.hostname) || !editorUrl.pathname.includes(`/themes/${id}/editor`)) {
    throw new Error("Shopify CLI returned a mismatched Theme Editor URL");
  }
  return {
    id,
    name,
    role,
    shop,
    editorUrl: editorUrl.href,
    previewUrl: previewUrl.href
  };
}
var runCommand = (command, args, options) => new Promise((resolve2, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let outputBytes = 0;
  const append = (target, chunk) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > maxOutputBytes) {
      child.kill();
      reject(new Error("Shopify CLI output exceeded the safety limit"));
      return;
    }
    if (target === "stdout") stdout += chunk.toString();
    else stderr += chunk.toString();
  };
  child.stdout.on("data", (chunk) => append("stdout", chunk));
  child.stderr.on("data", (chunk) => append("stderr", chunk));
  child.once("error", reject);
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Shopify CLI timed out"));
  }, options.timeoutMs);
  timeout.unref();
  child.once("close", (code) => {
    clearTimeout(timeout);
    resolve2({ code: code ?? 1, stdout, stderr });
  });
});
function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
function themeId(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  throw new Error("Shopify CLI returned an invalid theme ID");
}
function requiredString(value, name) {
  if (typeof value !== "string" || value === "")
    throw new Error(`${name} is invalid`);
  return value;
}
function validatedUrl(value, name) {
  const url = new URL(requiredString(value, name));
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  return url;
}
function redact(value, secret) {
  return secret === "" ? value : value.replaceAll(secret, "[redacted]");
}

// src/action.ts
async function run() {
  const password = getInput("password", { required: true });
  const githubToken = getInput("github-token", { required: true });
  setSecret(password);
  setSecret(githubToken);
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");
  const repository = await readRepositoryContext(
    eventPath,
    getInput("pull-request-number")
  );
  const store = normalizeStore(getInput("store", { required: true }));
  const context = resolvePreviewContext(
    getInput("context"),
    repository.repositoryId,
    repository.pullRequest
  );
  const github = new GitHubClient(
    githubToken,
    repository,
    getInput("comment-author") || "github-actions[bot]"
  );
  const shopify = new ShopifyClient({
    command: getInput("shopify-command") || "shopify",
    store,
    password
  });
  const cliVersion = await shopify.verifyVersion();
  info(`Using Shopify CLI ${cliVersion}`);
  const targetMode = getInput("target-mode") || "development-context";
  if (targetMode !== "development-context") {
    throw new Error("target-mode currently supports only development-context");
  }
  const mode = getInput("mode") || "deploy";
  if (mode === "cleanup") {
    const existing = await github.findProofComment();
    if (!existing) {
      notice("No Theme Proof preview was recorded for this pull request.");
      return;
    }
    assertMatchingState(
      existing.state,
      repository.fullName,
      repository.pullRequest,
      store,
      context
    );
    await shopify.deleteTheme(existing.state.themeId);
    await github.upsertComment(renderRemovedComment(existing.state));
    notice(`Removed Theme Proof preview ${existing.state.themeId}.`);
    return;
  }
  if (mode !== "deploy") throw new Error("mode must be deploy or cleanup");
  const artifact = await validateThemeArtifact(
    resolve(getInput("theme-path") || ".")
  );
  info(
    `Validated ${artifact.files} theme files (${artifact.bytes} bytes).`
  );
  const strict = parseBoolean(getInput("strict") || "true", "strict");
  const theme = await shopify.pushPreview({
    path: artifact.root,
    context,
    strict
  });
  const state = {
    schemaVersion: 1,
    repository: repository.fullName,
    pullRequest: repository.pullRequest,
    context,
    store,
    themeId: theme.id,
    previewUrl: theme.previewUrl,
    editorUrl: theme.editorUrl,
    sha: repository.sha
  };
  await github.upsertComment(renderPreviewComment(state));
  setOutput("theme-id", theme.id);
  setOutput("preview-url", theme.previewUrl);
  setOutput("editor-url", theme.editorUrl);
  setOutput("context", context);
  await summary.addHeading("Theme Proof").addLink("Storefront preview", theme.previewUrl).addRaw(" \xB7 ").addLink("Theme Editor", theme.editorUrl).write();
}
function assertMatchingState(state, repository, pullRequest, store, context) {
  if (state.repository !== repository || state.pullRequest !== pullRequest || state.store !== store || state.context !== context) {
    throw new Error("recorded preview state does not match this pull request");
  }
}
run().catch((error) => {
  setFailed(error instanceof Error ? error.message : String(error));
});
//# sourceMappingURL=action.js.map