<div align="center">

# DSH Sketch Reference

### Sketch it. Let DSH help.

[![Release](https://img.shields.io/github/v/release/Amadeus2027/dsh-sketch-reference?label=release&color=4176e6)](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) [![CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Tested DSH](https://img.shields.io/badge/DSH-alpha.1_%7C_alpha.2-536DFE)](https://github.com/deepseek-ai/deepseek-harness) [![Ask DeepWiki](https://img.shields.io/badge/DeepWiki-Ask-20B8A5.svg)](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

[**Download**](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) · [**Quick start**](#quick-start) · [**中文**](README.md) · [**DeepWiki**](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

</div>

**Sketch, discuss and build in your workspace.** Sketch Reference brings Excalidraw into DeepSeek Harness. The native Agent can read your sketch on demand, anchor comments to shapes and propose canvas edits for your approval.

**Development preview v0.7.0-alpha.1 — Sketch Graph.** Connect editable sketches from elements or selected regions, distinguish navigation from detail design, and switch between the existing side panel and fullscreen with movable native chat. Existing drawings remain the root document. [Scope and validation](docs/release-v0.7.0.md)

![Actual Sketch Graph UI: split view, fullscreen, floating native chat and detail editor](docs/assets/v0.7.0/sketch-graph.gif)

<details>
<summary>Website built through real DeepSeek conversations</summary>

![Browser interactions with the generated website: login, product details and cart](docs/assets/v0.7.0/agent-site.gif)

Windows DSH alpha.2, DeepSeek-V4.1-Flash / High, four sketches, real native tool calls and corrective conversations. This edited GIF shows automated interactions with the final site, not a continuous recording of generation. [Evidence and failures](docs/validation-v0.7.0.md) · [Capture provenance](docs/assets/v0.7.0/README.md)

</details>

![v0.6.5 canvas recording: native sketch-style layout, undo and redraw, PNG attachment, back to chat](docs/assets/v0.6.5/workflow.gif)

*Sketch → adjust the layout → add a reference → return to chat. [Still image](docs/assets/v0.6.5/sketch.png)*

<details>
<summary>Demo and case notes</summary>

The v0.6.5 canvas recording uses automated inputs and shows drawing, saving, PNG attachments and returning to chat. It contains no model calls or sent chat messages. [Recording provenance](docs/assets/v0.6.5/README.md)

Website, UI and PPT cases come from real DSH Agent experiments at the versions documented in their linked reports. A human-operated, real DeepSeek multi-turn development recording is still pending Windows capture. [Recording checklist](docs/demo-recording-v0.6.5.md)

The comparison below covers sketch communication and editing workflows; model quality, latency and token use were not measured comparatively.

</details>

## Before and after adding the plugin

The same task: **“Build from this layout, then change this part.”**

| Native chat + an ordinary PNG | With Sketch Reference |
| --- | --- |
| **Express the layout:** describe it, or draw elsewhere and upload | **Draw in the session:** autosave alongside the current task |
| **Discuss one area:** describe “the box on the right” or mark another image | **Point to shapes:** anchored comments, navigation and follow-up menus |
| **Update the reference:** edit the original, export and attach again | **Read on demand:** Agent gets the current saved structure and PNG |
| **Edit the canvas:** adjust it manually in a drawing tool | **Preview and approve:** Agent proposes → you preview → approve → native undo |

Bring sketching, focused discussions and reviewed edits into DSH’s native chat and workspace tools.

## One sketch, three ways to collaborate

- **Draw and ask.** Use native chat: “Build a webpage from the current sketch.” Standalone AI analysis is optional.
- **Point and discuss.** Ask the Agent to annotate an area. Follow-up, correction and edit actions draft a message in the native composer; you edit and send it.
- **Preview and approve.** Restricted tools propose canvas changes with aligned before/after previews. Stale proposals cannot overwrite a newer sketch.

Drawings and comments are session-bound. Drawing, hovering and paging do not call a model. No extra AI service or separate key configuration is introduced.

<details>
<summary>Comments and follow-up menu</summary>

![Compact v0.6.3 comment strip, shape anchor and follow-up menu](https://raw.githubusercontent.com/Amadeus2027/dsh-sketch-reference/main/docs/assets/v0.6.3/comments.png)

v0.6.3 menu example with scripted sample comments. [Asset notes](docs/assets/v0.6.3/README.md)

</details>

## What you can build with it

| Use case | Keep iterating in the same conversation |
| --- | --- |
| Web / UI | Sketch → implement → correct search, navigation and return behavior. [Dashboard and three-screen UI](docs/release-readiness-v0.6.0.md#b-真实应用与纠正) |
| Slides | Sketch regions → create editable slides → adjust a specific page. [Five-page PPTX and focused correction](docs/release-readiness-v0.6.0.md#b-真实应用与纠正) |
| Freehand | Draw an object or diagram → discuss the image → clarify. [Unlabeled cup and collaboration](docs/windows-validation-v0.4.0-20261010.md) |

The plugin supplies editable sketches and reference images; **DSH Agent** continues building webpages, UI and slides in the workspace.

## Quick start

Choose a version: `main`, its source ZIP and matching CI artifacts contain the **v0.7.0-alpha.1 development preview**. `releases/latest` currently provides **v0.6.5 stable**, without Sketch Graph.

**Install from a source ZIP or a prebuilt package.** Both use DSH’s official plugin manager. No separate Excalidraw installation is required.

**Option 1: extract the source ZIP and add the project directory**

Use **[Code → Download ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/archive/refs/heads/main.zip)**, extract it and open the directory containing `package.json`. Install dependencies and build, then add that directory directly; packing a `.tgz` is optional:

```sh
pnpm install --frozen-lockfile
pnpm run bundle
# Save your drawing and exit the running DSH host before adding the directory
dsh plugin --profile web add "/absolute/path/dsh-sketch-reference-main"
dsh web
```

DSH links this directory. Keep it, including `lib` and `node_modules`; rebuild and restart DSH after source updates. Run `add` again if you move to a new directory. [Directory installation and upgrades](docs/installation.md#从源码-zip-目录直接安装)

**Option 2: prebuilt package (no local build)**

- **ZIP download remains available:** open a [successful build](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml), download the `dsh-sketch-reference-installable` ZIP artifact and extract the `.tgz` and `SHA256SUMS.txt`.
- **Direct download:** get the versioned `.tgz` and checksum file from [Releases](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest).

Once you have the versioned `.tgz` and its matching `SHA256SUMS.txt`, save your work and exit the host, then run:

```sh
dsh plugin --profile web add /absolute/path/dsh-sketch-reference-0.6.5.tgz
```

Run `dsh web` to start. The prebuilt package includes the editor and fonts; no repository clone, separate Excalidraw installation or local build is needed.

Environment: DSH Web `0.2.1-alpha.1` / `0.2.1-alpha.2`, with pnpm available to the npm CLI manager. Keep your profile, storage and browser data when upgrading. [Installation and upgrades](docs/installation.md)

1. Choose a workspace and session, click **参考板** beside the composer, then draw and add a purpose.
2. Wait for **已保存** and return to native chat. **作为参考发送** optionally adds the PNG to the composer.
3. Discuss, annotate or request a change. Review and approve canvas edits; send chat messages yourself.

The UI is Chinese. Models and authentication use your DSH configuration; image reads require visual input support. Drawing, saving and exports work independently. [Usage guide](docs/usage.md)

<details>
<summary>Compatibility, data and feature boundaries</summary>

- v0.6.5 covers both Web hosts on isolated Linux installations, plus Windows alpha.2 installation, annotations/edits, live themes, split layout and migration from alpha.1 + v0.6.3. Agent regressions use scripted responses; no new real-model quality evaluation was performed. [Windows acceptance](docs/windows-validation-v0.6.5.md). Other host versions, mobile clients, non-default tool modes and every plugin combination are not claimed compatible.
- Uncertain anchors fall back to text. Models may misread sketches or return invalid arguments; mathematical correctness is not guaranteed. Focus is version-bound and does not restrict other host tools or erase chat history.
- Canvas edits are allowlisted; arbitrary changes to locked, bound, grouped elements or styles are unsupported. Undo history is not restored across refreshes.
- Drafts/images live in local DSH storage; model-visible data goes to the configured provider. Historical attachments are not automatically reclaimed. Export backups before upgrading or uninstalling.
- After a synchronization disconnect, use **⋯ → 同步批注** or reopen. There is no bundled website/PPT generator or automatic drawing-to-code synchronization.

[Host compatibility report](docs/dsh-compatibility.md) · [v0.6.5 validation scope](docs/validation-v0.6.5.md)

</details>

## Help improve visual collaboration

**Star the repository** to follow updates if you want DSH to keep working with the same sketch. [Share issues and use cases](https://github.com/Amadeus2027/dsh-sketch-reference/issues) with sanitized drawings and reproducible steps.

<details>
<summary>Build, validation and licenses</summary>

You can add the extracted source directory directly as described above. For the full checks or an optional distributable `.tgz`, run:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm pack
```

[Contributing](CONTRIBUTING.md) · [v0.6.5 validation](docs/validation-v0.6.5.md) · [Reuse](REUSE.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Community plugin under [MIT](LICENSE), with drawing from Excalidraw and host capabilities from DeepSeek Harness. See the linked third-party licenses and validation records.

</details>
