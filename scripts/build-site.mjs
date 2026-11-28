import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const README_PATH = path.join(ROOT_DIR, "README.md");
const SITE_DIR = path.join(ROOT_DIR, "site");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DIST_DIAGRAMS_DIR = path.join(DIST_DIR, "diagrams");
const PUPPETEER_CONFIG = path.join(__dirname, "puppeteer-config.json");

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtmlEntities(text) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractSubgraphs(source) {
  const results = [];
  const regex = /^\s*subgraph\s+\S+(?:\s*\["([^"]+)"\]|\s+(.+))?$/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const label = (match[1] || match[2] || "").trim();
    if (label) {
      results.push(decodeHtmlEntities(label));
    }
  }
  return results;
}

function extractSearchText(title, source) {
  const cleaned = decodeHtmlEntities(source)
    .replace(/^\s*style\s+.*$/gm, "")
    .replace(/^\s*(graph|flowchart)\s+\S+$/gm, "")
    .replace(/[\[\]{}()|"<>]/g, " ")
    .replace(/-->|-\.->|==>|---/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${title} ${cleaned}`.toLowerCase();
}

function parseReadme(markdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const subtitleMatch = markdown.match(/^>\s+(.+)$/m);

  const title = titleMatch
    ? titleMatch[1].trim()
    : "Autonomous Hydrographic Survey USV — Architecture";
  const subtitle = subtitleMatch
    ? subtitleMatch[1].replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, "$1").trim()
    : "";

  const sectionRegex =
    /^##\s+([^\n]+)\n[\s\S]*?```mermaid\r?\n([\s\S]*?)```/gm;
  const diagrams = [];
  let match;

  while ((match = sectionRegex.exec(markdown)) !== null) {
    const rawHeading = match[1].trim();
    const source = match[2].replace(/\r\n/g, "\n").trim();
    const cleanTitle = rawHeading.replace(/^\d+\.\s*/, "").trim();
    const index = diagrams.length + 1;
    const number = String(index).padStart(2, "0");
    const slug = `${number}-${slugify(cleanTitle)}`;
    const nonEmptyLines = source
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const diagramType = nonEmptyLines[0] || "flowchart TD";
    const subgraphs = extractSubgraphs(source);
    const edgeCount = nonEmptyLines.filter((line) =>
      /-->|-\.->|==>/.test(line)
    ).length;

    diagrams.push({
      index,
      number,
      slug,
      rawHeading,
      title: cleanTitle,
      diagramType,
      subgraphs,
      edgeCount,
      lineCount: nonEmptyLines.length,
      searchText: extractSearchText(cleanTitle, source),
      svgPath: `diagrams/${slug}.svg`,
      mmdPath: `diagrams/${slug}.mmd`,
      source,
    });
  }

  return { title, subtitle, diagrams };
}

function resolveMmdcBinary() {
  const localBin = path.join(
    ROOT_DIR,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "mmdc.cmd" : "mmdc"
  );
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return "mmdc";
}

function detectChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function extractSvgViewBox(svgContent) {
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/i);
  if (!viewBoxMatch) {
    return { width: 1200, height: 800 };
  }
  const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return {
      width: Math.round(parts[2]),
      height: Math.round(parts[3]),
    };
  }
  return { width: 1200, height: 800 };
}

function renderDiagrams(diagrams) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hydro-usv-mmdc-"));
  try {
    const batchMarkdown = diagrams
      .map((d) => `## ${d.rawHeading}\n\n\`\`\`mermaid\n${d.source}\n\`\`\`\n`)
      .join("\n");
    const inputMd = path.join(tmpDir, "diagrams.md");
    const outputMd = path.join(tmpDir, "rendered.md");
    fs.writeFileSync(inputMd, batchMarkdown, "utf8");

    const env = { ...process.env };
    const chromePath = detectChromeExecutable();
    if (chromePath) {
      env.PUPPETEER_EXECUTABLE_PATH = chromePath;
    }

    const mmdcBin = resolveMmdcBinary();
    execFileSync(
      mmdcBin,
      [
        "-i",
        inputMd,
        "-o",
        outputMd,
        "-e",
        "svg",
        "-b",
        "transparent",
        "-j",
        "1",
        "-p",
        PUPPETEER_CONFIG,
      ],
      {
        cwd: ROOT_DIR,
        env,
        stdio: "inherit",
      }
    );

    fs.mkdirSync(DIST_DIAGRAMS_DIR, { recursive: true });

    for (const diagram of diagrams) {
      const renderedSvg = path.join(tmpDir, `rendered-${diagram.index}.svg`);
      if (!fs.existsSync(renderedSvg)) {
        throw new Error(
          `Expected rendered SVG for diagram ${diagram.number} (${diagram.title}) at ${renderedSvg}`
        );
      }

      const svgContent = fs.readFileSync(renderedSvg, "utf8");
      if (!svgContent.trim().startsWith("<svg")) {
        throw new Error(
          `Invalid SVG output for diagram ${diagram.number} (${diagram.title})`
        );
      }

      const { width, height } = extractSvgViewBox(svgContent);
      diagram.width = width;
      diagram.height = height;
      diagram.svgBytes = Buffer.byteLength(svgContent, "utf8");

      fs.writeFileSync(
        path.join(DIST_DIAGRAMS_DIR, `${diagram.slug}.svg`),
        svgContent,
        "utf8"
      );
      fs.writeFileSync(
        path.join(DIST_DIAGRAMS_DIR, `${diagram.slug}.mmd`),
        `${diagram.source}\n`,
        "utf8"
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function buildStaticSite(manifest) {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const templateHtml = fs.readFileSync(path.join(SITE_DIR, "index.html"), "utf8");
  const safeManifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");
  const finalHtml = templateHtml.replace(
    "<!--__MANIFEST_JSON__-->",
    safeManifestJson
  );

  fs.writeFileSync(path.join(DIST_DIR, "index.html"), finalHtml, "utf8");
  fs.copyFileSync(
    path.join(SITE_DIR, "styles.css"),
    path.join(DIST_DIR, "styles.css")
  );
  fs.copyFileSync(path.join(SITE_DIR, "app.js"), path.join(DIST_DIR, "app.js"));
  fs.writeFileSync(
    path.join(DIST_DIAGRAMS_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(DIST_DIR, ".nojekyll"), "", "utf8");
}

function main() {
  const startMs = Date.now();
  const markdown = fs.readFileSync(README_PATH, "utf8");
  const { title, subtitle, diagrams } = parseReadme(markdown);

  if (diagrams.length === 0) {
    throw new Error("No Mermaid diagrams found in README.md");
  }

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  console.log(
    `Validating and rendering ${diagrams.length} Mermaid diagrams from README.md...`
  );
  renderDiagrams(diagrams);

  const manifest = {
    title,
    subtitle,
    generatedAt: new Date().toISOString(),
    repoUrl: "https://github.com/indian-aman/hydro-usv-architecture",
    companionUrl: "https://github.com/indian-aman/hydro-usv-ros2",
    diagramCount: diagrams.length,
    diagrams,
  };

  buildStaticSite(manifest);

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\nBuilt dist/ with ${diagrams.length} SVG diagrams in ${elapsedSec}s:`);
  for (const d of diagrams) {
    const kb = (d.svgBytes / 1024).toFixed(1);
    console.log(
      `  ${d.number}. ${d.title} (${d.width}x${d.height}, ${kb} KB) -> ${d.svgPath}`
    );
  }
}

main();
