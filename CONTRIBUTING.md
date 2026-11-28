# Contributing to hydro-usv-architecture

`README.md` is the **single source of truth** for all architecture and operational flow diagrams in this repository. Every diagram is validated in GitHub Actions and published automatically to the interactive GitHub Pages Architecture Atlas.

## Editing Directly on GitHub (No Local Setup Needed)

1. **GitHub Web Editor**: Open `README.md`, edit any ` ```mermaid ` code block, and open a pull request. GitHub Actions automatically lints Markdown, renders every diagram to SVG, and uploads a preview artifact on the PR.
2. **GitHub Codespaces**: Click **Code -> Codespaces -> Create codespace on main**. The dev container installs Node.js 22, Chromium, Mermaid/Markdown VS Code extensions, and project dependencies automatically.

## Common Commands (in Codespaces or Cloud Environments)

```bash
# Lint all Markdown files
npm run lint

# Validate and render all Mermaid diagrams to SVG + build dist/
npm run build

# Run both Markdown linting and diagram rendering
npm run check

# Preview the interactive Architecture Atlas on port 4173
npm run preview
```

## Diagram Conventions

- Keep each top-level diagram under a numbered `## N. Title` heading in `README.md` followed by a fenced ` ```mermaid ` code block.
- Escape angle brackets inside node labels (`&lt;`, `&gt;`) and quote decision/edge labels containing special characters so Mermaid compiles cleanly in both GitHub and `@mermaid-js/mermaid-cli`.
- Keep sensor rates, ROS 2 topic names, CUDA pipeline stages, and COLREGS behaviors aligned with [indian-aman/hydro-usv-ros2](https://github.com/indian-aman/hydro-usv-ros2).
