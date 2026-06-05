import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredExamples = [
  "basic-usage",
  "cloud-resource-topology",
  "preset-entry",
  "minimal-realtime",
];
const errors = [];

for (const name of requiredExamples) {
  await assertExists(join(root, "examples", name, "index.html"), `missing example: ${name}`);
}

await validateExampleTree(join(root, "examples"), {
  label: "source examples",
  forbiddenPathPart: "../../framework/",
});

await validateExampleTree(join(root, "dist", "examples"), {
  label: "dist examples",
  forbiddenPathPart: "../../src/framework/",
});

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Example checks passed");
}

async function validateExampleTree(directory, { label, forbiddenPathPart }) {
  if (!(await exists(directory))) {
    errors.push(`${label} directory does not exist: ${directory}`);
    return;
  }
  for (const file of await listHtmlFiles(directory)) {
    const html = await readText(file);
    if (html.includes(forbiddenPathPart)) {
      errors.push(`${label} uses the wrong framework path in ${relative(file)}: ${forbiddenPathPart}`);
    }
    for (const ref of getLocalReferences(html)) {
      await assertExists(normalize(join(dirname(file), ref)), `${label} has broken reference in ${relative(file)}: ${ref}`);
    }
  }
}

async function listHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(path));
    if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

function getLocalReferences(html) {
  const refs = new Set();
  for (const match of html.matchAll(/\b(?:href|src)=["'](\.[^"']+)["']/g)) {
    refs.add(match[1]);
  }
  for (const match of html.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
    refs.add(match[1]);
  }
  return refs;
}

async function assertExists(path, message) {
  if (!(await exists(path))) errors.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path) {
  return Buffer.from(await readFile(path)).toString("utf8");
}

function relative(path) {
  return path.replace(`${root}/`, "");
}
