import {
  getInput,
  info,
  prepareThemeArtifact,
  setFailed,
  setOutput
} from "./chunk-JESWGQF2.js";

// src/build-action.ts
import { join } from "path";

// src/build-runner.ts
import { spawn } from "child_process";
async function runConfiguredBuild(config, runner = runShellCommand) {
  const env = buildEnvironment();
  if (config.setup) {
    await runStep("setup", config.setup, config.workingDirectory, env, runner);
  }
  if (config.install) {
    await runStep(
      "install",
      config.install,
      config.workingDirectory,
      env,
      runner
    );
  }
  if (config.command) {
    await runStep(
      "build",
      config.command,
      config.workingDirectory,
      env,
      runner
    );
  }
}
var runShellCommand = (command, options) => new Promise((resolve2, reject) => {
  const child = spawn(command, {
    cwd: options.cwd,
    env: options.env,
    shell: true,
    stdio: "inherit"
  });
  child.once("error", reject);
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("build command timed out"));
  }, options.timeoutMs);
  timeout.unref();
  child.once("close", (code) => {
    clearTimeout(timeout);
    resolve2({ code: code ?? 1 });
  });
});
function buildEnvironment() {
  const env = { ...process.env, CI: "true" };
  for (const name of Object.keys(env)) {
    if (/(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)(?:_|$)/i.test(
      name
    )) {
      delete env[name];
    }
  }
  return env;
}
async function runStep(name, command, cwd, env, runner) {
  const result = await runner(command, { cwd, env, timeoutMs: 15 * 6e4 });
  if (result.code !== 0)
    throw new Error(`${name} command failed (${result.code})`);
}

// src/project-config.ts
import { readFile } from "fs/promises";
import { isAbsolute, relative, resolve, sep } from "path";
var defaults = {
  version: 1,
  build: {
    workingDirectory: ".",
    themeDirectory: "."
  }
};
async function loadProjectConfig(workspace, configuredPath) {
  const root = resolve(workspace);
  const requested = configuredPath.trim();
  if (requested === "") return resolveConfig(defaults, root);
  const configPath = inside(root, requested, "config");
  let content;
  try {
    content = await readFile(configPath, "utf8");
  } catch (error) {
    if (isMissing(error) && requested === "theme-proof.config.json") {
      return resolveConfig(defaults, root);
    }
    throw error;
  }
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(
      `Theme Proof config is not valid JSON: ${relative(root, configPath)}`
    );
  }
  const config = validateConfig(value);
  return { ...resolveConfig(config, root), configPath };
}
function validateConfig(value) {
  const config = record(value, "config");
  rejectUnknown(config, ["$schema", "version", "build"], "config");
  if (config.version !== 1)
    throw new Error("Theme Proof config version must be 1");
  const build = record(config.build ?? {}, "build");
  rejectUnknown(
    build,
    ["workingDirectory", "themeDirectory", "setup", "install", "command"],
    "build"
  );
  return {
    version: 1,
    build: {
      workingDirectory: optionalString(build.workingDirectory) ?? ".",
      themeDirectory: optionalString(build.themeDirectory) ?? ".",
      ...optionalCommand(build.setup, "build.setup", "setup"),
      ...optionalCommand(build.install, "build.install"),
      ...optionalCommand(build.command, "build.command", "command")
    }
  };
}
function resolveConfig(config, workspace) {
  return {
    workspace,
    workingDirectory: inside(
      workspace,
      config.build.workingDirectory,
      "build.workingDirectory"
    ),
    themeDirectory: inside(
      workspace,
      config.build.themeDirectory,
      "build.themeDirectory"
    ),
    ...config.build.setup ? { setup: config.build.setup } : {},
    ...config.build.install ? { install: config.build.install } : {},
    ...config.build.command ? { command: config.build.command } : {}
  };
}
function inside(root, value, name) {
  if (value === "" || isAbsolute(value)) {
    throw new Error(`${name} must be a non-empty relative path`);
  }
  const path = resolve(root, value);
  const relationship = relative(root, path);
  if (relationship === ".." || relationship.startsWith(`..${sep}`)) {
    throw new Error(`${name} cannot leave the GitHub workspace`);
  }
  return path;
}
function record(value, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}
function rejectUnknown(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new Error(`${name} contains unknown property: ${key}`);
  }
}
function optionalString(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || value === "")
    throw new Error("paths must be strings");
  return value;
}
function optionalCommand(value, name, property = "install") {
  if (value === void 0 || value === null || value === "") return {};
  if (typeof value !== "string")
    throw new Error(`${name} must be a string or null`);
  return { [property]: value };
}
function isMissing(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/build-action.ts
async function run() {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error("GITHUB_WORKSPACE is required");
  const config = await loadProjectConfig(
    workspace,
    getInput("config") || "theme-proof.config.json"
  );
  if (config.configPath) {
    info(`Using ${config.configPath}`);
  } else {
    info(
      "No Theme Proof config found; using a no-build theme at the repository root."
    );
  }
  await runConfiguredBuild(config);
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) throw new Error("RUNNER_TEMP is required");
  const artifact = await prepareThemeArtifact(
    config.themeDirectory,
    join(runnerTemp, "theme-proof-artifact")
  );
  setOutput("theme-path", artifact.root);
  setOutput("files", artifact.files);
  setOutput("bytes", artifact.bytes);
  info(
    `Prepared ${artifact.files} theme files (${artifact.bytes} bytes).`
  );
}
run().catch((error) => {
  setFailed(error instanceof Error ? error.message : String(error));
});
//# sourceMappingURL=build-action.js.map