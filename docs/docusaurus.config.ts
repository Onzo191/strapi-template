import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";

/**
 * Docusaurus site for the platform docs (§7 — "ADRs + the recipes above as human
 * docs").
 *
 * ## Layout decision
 *
 * The site root is `docs/` itself and the docs plugin reads `path: "."`, rather than
 * the conventional `docs/docs/`. That is deliberate: `docs/architecture_plan.md`,
 * `docs/adr/006-security-hardening.md` and friends are referenced by path from code
 * comments, from `AGENTS.md`, from both app `CLAUDE.md` files and from the skill
 * recipes. Relocating them under a nested `docs/docs/` would break every one of those
 * references and turn a docs-site addition into a repo-wide churn commit.
 *
 * So the site is layered *over* the existing tree, and `exclude` keeps the site's own
 * scaffolding out of the sidebar.
 *
 * Not part of either Docker image: `.dockerignore` excludes `docs`, so this adds
 * nothing to the runtime images or their build context.
 */
const config: Config = {
  title: "VNG Platform",
  tagline: "Architecture decisions, task recipes and reference for vng.com.vn",

  // No static assets: this site is markdown + the classic theme. An empty
  // `static/` directory makes the build fail on an unmatched glob, and a
  // placeholder favicon would be a committed binary nobody chose.
  staticDirectories: [],

  // Set at deploy time; a placeholder keeps `docusaurus build` happy locally.
  url: process.env.DOCS_URL ?? "http://localhost:3100",
  baseUrl: process.env.DOCS_BASE_URL ?? "/",

  organizationName: "vng",
  projectName: "vng-platform",

  // Internal docs: a broken *route* link is a bug, not a warning to scroll past.
  onBrokenLinks: "throw",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          // See the layout note above.
          path: ".",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          exclude: [
            // The site's own scaffolding.
            "**/node_modules/**",
            "**/build/**",
            "**/.docusaurus/**",
            "src/**",
            "static/**",
            "README.md",
          ],
          editUrl: process.env.DOCS_EDIT_URL,
        },
        // A corporate-platform handbook, not a blog.
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  markdown: {
    /**
     * Enabled for any future `.mdx` doc. Note it does **not** apply to the two existing
     * mermaid diagrams (`architecture_plan.md`, `p3-freshness.md`): Docusaurus
     * implements mermaid as an MDX transform, and `format: "detect"` below parses `.md`
     * as CommonMark, where a ```mermaid fence stays a syntax-highlighted code block.
     *
     * That is an accepted trade, not an oversight. Switching the site to MDX would make
     * four legacy reference docs fail to compile outright (see `format` below), and a
     * per-file `format: mdx` override does not reach the mermaid transform. Mermaid
     * source is legible as text, the affected documents are background reference, and
     * the ADRs — the reason this site exists — use tables rather than diagrams.
     *
     * To render a diagram: write the doc as `.mdx`.
     */
    mermaid: true,
    /**
     * `.md` is parsed as **CommonMark**, only `.mdx` as MDX.
     *
     * Docusaurus 3 defaults every `.md` file to MDX, which treats `{…}` as a JSX
     * expression. The planning corpus (`init.md`, `master_summary.md`,
     * `web-mng_details.md`, `web-tracking_details.md`) is plain Markdown written long
     * before this site existed and is full of `{placeholder}` notation — under MDX it
     * fails to compile at all.
     *
     * The alternative was escaping braces across four large documents, which would
     * churn files nobody is editing and make them worse to read outside the site. This
     * is the right trade: nothing here needs JSX, and any future doc that does can be
     * named `.mdx` and opt in.
     */
    format: "detect",

    hooks: {
      /**
       * Warn rather than throw. The pre-existing planning docs contain
       * `docs/foo.md` links that were written relative to the repository root, so
       * they resolve one level too deep from inside `docs/`. They are stale links in
       * documents nobody is actively editing; failing the site build on them would
       * block the ADRs — which are the reason this site exists — on unrelated
       * cleanup. Route links (`onBrokenLinks`) still throw.
       */
      onBrokenMarkdownLinks: "warn",
    },
  },
  // The architecture plan and the freshness doc both use mermaid diagrams.
  themes: ["@docusaurus/theme-mermaid"],

  themeConfig: {
    navbar: {
      title: "VNG Platform",
      items: [
        { type: "docSidebar", sidebarId: "adr", position: "left", label: "ADRs" },
        { type: "docSidebar", sidebarId: "reference", position: "left", label: "Reference" },
      ],
    },
    footer: {
      style: "dark",
      copyright: `VNG Corporation — internal engineering documentation.`,
    },
    prism: {
      additionalLanguages: ["bash", "json", "typescript", "sql", "docker", "nginx"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
