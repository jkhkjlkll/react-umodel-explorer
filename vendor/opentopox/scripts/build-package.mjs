import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");
const frameworkSource = join(root, "src", "framework");
const frameworkDist = join(distDir, "framework");
const examplesSource = join(root, "examples");

await rm(distDir, { recursive: true, force: true });
await mkdir(frameworkDist, { recursive: true });

for (const entry of await readdir(frameworkSource, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === ".DS_Store") continue;
  await cp(join(frameworkSource, entry.name), join(frameworkDist, entry.name));
}

await cp(examplesSource, join(distDir, "examples"), {
  recursive: true,
  filter: (source) => !source.endsWith(".DS_Store"),
});
await rewriteDistExamples(join(distDir, "examples"));

for (const file of [
  "README.md",
  "README.zh-CN.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "USAGE.md",
  "DEVELOPER_GUIDE.md",
  "MAINTAINERS.md",
  "SECURITY.md",
  "CHANGELOG.md",
]) {
  await cp(join(root, file), join(distDir, basename(file)));
}
for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
  await cp(join(root, file), join(distDir, basename(file)));
}

const publicDocs = [
  "security-guidelines.md",
  "topology-data-adapter.md",
  "realtime-topology-protocol.md",
  "performance-and-troubleshooting.md",
  "realtime-topology-runtime.md",
];
await mkdir(join(distDir, "docs"), { recursive: true });
for (const file of publicDocs) {
  await cp(join(root, "docs", file), join(distDir, "docs", file));
}

const packageJson = JSON.parse(await readText(join(root, "package.json")));
const packageManifest = {
  name: packageJson.name,
  version: packageJson.version,
  type: "module",
  description: packageJson.description,
  license: packageJson.license,
  author: packageJson.author,
  repository: packageJson.repository,
  bugs: packageJson.bugs,
  homepage: packageJson.homepage,
  keywords: packageJson.keywords,
  main: "./framework/index.js",
  module: "./framework/index.js",
  types: "./framework/index.d.ts",
  typesVersions: {
    "*": {
      react: [
        "./framework/react.d.ts",
      ],
      "framework/*": [
        "./framework/*",
      ],
    },
  },
  exports: {
    ".": {
      types: "./framework/index.d.ts",
      import: "./framework/index.js",
      default: "./framework/index.js",
    },
    "./react": {
      types: "./framework/react.d.ts",
      import: "./framework/react.js",
      default: "./framework/react.js",
    },
    "./style.css": "./framework/topology.css",
    "./framework/*": "./framework/*",
    "./package.json": "./package.json",
  },
  sideEffects: [
    "./framework/topology.css",
  ],
  peerDependencies: {
    react: ">=18",
  },
  peerDependenciesMeta: {
    react: {
      optional: true,
    },
  },
};

await writeFile(join(distDir, "package.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);

console.log(`Built ${packageJson.name}@${packageJson.version} into dist/`);

async function readText(path) {
  return Buffer.from(await readFile(path)).toString("utf8");
}

async function rewriteDistExamples(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteDistExamples(path);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".html") && entry.name !== "README.md") continue;
    const source = await readText(path);
    const rewritten = source
      .replace(
        "Run the examples from the repository root:\n\n```sh\nnpm run serve\n```",
        "Serve the generated `dist/` directory with any static server, for example:\n\n```sh\npython3 -m http.server 5177\n```",
      )
      .replace(
        "Each example imports from `../../src/framework/index.js` so it can run directly\nfrom a source checkout without a bundler.",
        "These dist examples import from `../../framework/index.js` so they can run\ninside the generated `dist/` package directory.",
      )
      .replace(
        "Each example imports from `../../framework/index.js` so it can run directly\nfrom a source checkout without a bundler.",
        "These dist examples import from `../../framework/index.js` so they can run\ninside the generated `dist/` package directory.",
      )
      .replaceAll("../../src/framework/", "../../framework/");
    if (rewritten !== source) {
      await writeFile(path, rewritten);
    }
  }
}
