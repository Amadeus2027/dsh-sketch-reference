<div align="center">

# DSH Sketch Reference

### Sketch it. Let DSH help.

[![Release](https://img.shields.io/github/v/release/Amadeus2027/dsh-sketch-reference?label=release&color=4176e6)](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) [![CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) [![DSH](https://img.shields.io/badge/DSH-alpha.1_%7C_alpha.2-536DFE)](docs/dsh-compatibility.md) [![MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[**Install**](#quick-start) · [**Usage**](docs/usage.md) · [**Release notes**](docs/release-v0.7.0.md) · [**中文**](README.md)

</div>

**Draw in your DSH session. Let the Agent read, discuss and build from it.** Use Excalidraw for page layouts, slide outlines or freehand ideas. Connect pages and details with Sketch Graph. Keep DSH’s native chat, workspace and model configuration.

![Sketch Graph: open a sketch from the overview, switch to fullscreen and use native floating chat](docs/assets/v0.7.0/sketch-graph.gif)

*See relationships in the overview; double-click to draw the details. Switch between split view and fullscreen. [Demo provenance](docs/assets/v0.7.0/README.md)*

## From a sketch to the next step

| What you want to do | Continue in the same DSH conversation |
| --- | --- |
| **Build a webpage** | Sketch layouts and navigation → ask the Agent to implement → run and refine in the workspace |
| **Make slides** | Sketch each page’s regions → request editable slides → revise a specific page |
| **Discuss a detail** | Select shapes or open an anchored comment → ask a follow-up → preview and approve canvas edits |

**Keep drawing and discussion connected:** sketches are session-bound; the Agent reads structure and PNGs on demand. Comments can point to shapes. AI edits to the root sketch require a preview and approval; stale proposals cannot overwrite a newer drawing. Drawing, moving shapes and viewing comments do not trigger model calls.

<details>
<summary><strong>Real example: four sketches → an e-commerce website</strong></summary>

![Browser interactions with the Agent-generated website: login, product details and cart](docs/assets/v0.7.0/agent-site.gif)

Real DeepSeek conversations in Windows DSH alpha.2 read four sketches and their relationships, generated HTML/CSS/JS, then corrected the result through feedback. The GIF shows interactions with the completed site, with waits edited out. [Process, corrections and validation](docs/validation-v0.7.0.md)

More cases: [Web/UI and a five-page PPTX](docs/release-readiness-v0.6.0.md#b-真实应用与纠正) · [Unlabeled freehand recognition](docs/windows-validation-v0.4.0-20261010.md)

</details>

## Quick start

Install **DSH Web `0.2.1-alpha.1` or `0.2.1-alpha.2`** first, with pnpm available. No separate Excalidraw installation or extra AI key configuration is needed. Before upgrading, wait for saves, export a backup and exit the running DSH host.

Install **[v0.7.0](https://github.com/Amadeus2027/dsh-sketch-reference/releases/tag/v0.7.0)** through the official plugin manager:

```sh
dsh plugin --profile web add https://github.com/Amadeus2027/dsh-sketch-reference/releases/download/v0.7.0/dsh-sketch-reference-0.7.0.tgz
dsh web
```

1. Choose a workspace and session. Click **参考板** beside the composer, draw and add a purpose.
2. Wait for **已保存** and ask in native chat: “Build a webpage from the current sketch.” **作为参考发送** optionally adds the PNG to the composer.
3. Continue discussing, annotating or requesting changes. Review canvas edits before approval; send chat messages yourself.

**Other installation options remain available:**

<details>
<summary>Download a TGZ / installable ZIP and add it locally</summary>

Get the `.tgz` and `SHA256SUMS.txt` from [Releases](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest). The [installable ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/releases/download/v0.7.0/dsh-sketch-reference-0.7.0-installable.zip) contains the same package and its checksum file. Verify them, then run:

```sh
dsh plugin --profile web add /absolute/path/dsh-sketch-reference-0.7.0.tgz
dsh web
```

The `dsh-sketch-reference-installable` artifact in [successful CI runs](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) remains available for testing unreleased changes.

</details>

<details>
<summary>Extract a source ZIP, build and add the project directory</summary>

Download the [tagged v0.7.0 source ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/archive/refs/tags/v0.7.0.zip), or use [Code → Download ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/archive/refs/heads/main.zip) for the latest main branch. Extract and open the directory containing `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm run bundle
# Save and exit DSH; replace the path with your extracted directory
dsh plugin --profile web add "/absolute/path/dsh-sketch-reference-0.7.0"
dsh web
```

No TGZ packing is required. DSH links this directory: keep it, including `lib` and `node_modules`. Rebuild and restart after source updates. [Windows paths and upgrades](docs/installation.md#从源码-zip-目录直接安装)

</details>

## Sketch Graph: one sketch per node

- **Organize a design.** Name pages and distinguish navigation from detail relationships. Link details from an element, multiple elements or a selected region.
- **Keep it editable.** Double-click into Excalidraw and return through breadcrumbs. Existing sketches stay as the root document.
- **Read context on demand.** The Agent reads graph relationships and summaries first, then specific nodes and PNGs as needed.
- **Continue the native workflow.** Autosave, conflict protection, editable backups and additive recovery; native chat remains available in fullscreen.

[Usage guide](docs/usage.md) · [Installation and upgrades](docs/installation.md) · [Documentation index](docs/README.md) · [DeepWiki](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

<details>
<summary>Compatibility, data and current boundaries</summary>

- A community plugin for the two DSH Web versions above. Other hosts, mobile clients and all plugin combinations are not claimed compatible. Image reads require visual input support; drawing, saving and exports work independently. The plugin UI is Chinese.
- Up to 100 nodes / 300 edges; full graphs still drop frames. Graph-wide undo, search, complex bound-element edits and undo across refreshes are unavailable. Comments, edit proposals and native attachment sending currently target the root sketch.
- Drafts and images live in local DSH storage; data read by a model goes to the configured provider. Historical attachments are not automatically reclaimed. Export backups before upgrades or removal. Models may misread sketches or return invalid parameters; uncertain anchors fall back to text.
- The plugin provides editable references and collaboration tools. Webpages and slides are built by DSH Agent and its workspace tools. Focus does not constrain other host tools or erase chat history.

[Version validation](docs/validation-v0.7.0.md) · [Performance and limitations](docs/review-graph-performance-20261017.md) · [Host compatibility](docs/dsh-compatibility.md). Formal-package Linux regressions and historical Windows / real-model cases retain their own evidence; they do not establish complete cross-platform acceptance.

</details>

## Contribute

Find it useful? **[Star the repository](https://github.com/Amadeus2027/dsh-sketch-reference/stargazers)** to follow updates. [Report issues](https://github.com/Amadeus2027/dsh-sketch-reference/issues) with sanitized sketches and reproduction steps, or submit a PR following the [contribution guide](CONTRIBUTING.md).

[MIT](LICENSE) · Drawing by Excalidraw · Graph overview by React Flow · [Reuse](REUSE.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
