#!/usr/bin/env node
/**
 * Generate / verify `skills-lock.json` (§7 — "Pins skill versions for
 * reproducibility").
 *
 * ## What a skills lockfile is for
 *
 * A skill changes how an agent does the work. If `add-content-type` silently drops
 * the "register the cache tag" step, every content type added afterwards is stale on
 * the site and nobody sees a failing test — the loss is in the *instructions*, and it
 * only shows up as bugs in unrelated code weeks later.
 *
 * So skills are treated like dependencies: content-addressed, pinned, and diffable.
 * The lockfile records a SHA-256 of each `SKILL.md` plus its declared `name` and
 * `description`, so:
 *
 *  - a review shows *that* a recipe changed and by how much, not just that a markdown
 *    file was touched;
 *  - an agent (or a human) can confirm the recipe it just followed is the reviewed
 *    one, rather than a local edit;
 *  - CI fails when the lockfile is stale, which is what makes the first two true.
 *
 * ## Usage
 *
 *   node scripts/skills-lock.mjs            # write skills-lock.json
 *   node scripts/skills-lock.mjs --check    # verify, exit 1 if stale (CI)
 *
 * The hash covers file bytes only — deliberately not mtime or git metadata, so the
 * same content always produces the same lock regardless of checkout order or CI
 * cache state.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = ".claude/skills";
const LOCKFILE = "skills-lock.json";
const LOCK_VERSION = 1;

/** Pull `name` and `description` out of the YAML frontmatter, without a YAML parser. */
function readFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return {};
  const fields = {};
  // Frontmatter here is flat `key: value`, with values that may contain colons.
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function collect() {
  const names = readdirSync(SKILLS_DIR)
    .filter((entry) => statSync(join(SKILLS_DIR, entry)).isDirectory())
    .sort();

  const skills = {};
  for (const name of names) {
    const path = join(SKILLS_DIR, name, "SKILL.md");
    let raw;
    try {
      raw = readFileSync(path);
    } catch {
      console.error(`✗ ${name}: no SKILL.md`);
      process.exitCode = 1;
      continue;
    }
    const source = raw.toString("utf8");
    const { name: declaredName, description } = readFrontmatter(source);

    if (!declaredName) {
      console.error(`✗ ${name}: SKILL.md frontmatter has no \`name\``);
      process.exitCode = 1;
    } else if (declaredName !== name) {
      // A mismatch means the skill cannot be invoked by its directory name.
      console.error(`✗ ${name}: frontmatter name is "${declaredName}" — must match the directory`);
      process.exitCode = 1;
    }
    if (!description) {
      console.error(`✗ ${name}: SKILL.md frontmatter has no \`description\``);
      process.exitCode = 1;
    }

    skills[name] = {
      integrity: sha256(raw),
      bytes: raw.length,
      description: description ?? null,
    };
  }
  return skills;
}

function build() {
  const skills = collect();
  return {
    lockfileVersion: LOCK_VERSION,
    // Not a timestamp: a generated-at field would make the lockfile change on every
    // run and destroy the "diff shows a real change" property this file exists for.
    skillsDir: SKILLS_DIR,
    skills,
  };
}

const lock = build();
const serialized = `${JSON.stringify(lock, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let existing;
  try {
    existing = readFileSync(LOCKFILE, "utf8");
  } catch {
    console.error(`✗ ${LOCKFILE} is missing. Run: node scripts/skills-lock.mjs`);
    process.exit(1);
  }
  if (existing !== serialized) {
    console.error(
      `✗ ${LOCKFILE} is out of date — a skill changed without the lockfile being ` +
        "regenerated. Run: node scripts/skills-lock.mjs",
    );
    process.exit(1);
  }
  if (process.exitCode) process.exit(process.exitCode);
  console.log(`✓ ${LOCKFILE} matches ${Object.keys(lock.skills).length} skill(s)`);
} else {
  writeFileSync(LOCKFILE, serialized);
  console.log(`✓ wrote ${LOCKFILE} (${Object.keys(lock.skills).length} skills)`);
  if (process.exitCode) process.exit(process.exitCode);
}
