# Archi Web — Agent Notes

Browser-based ArchiMate modelling tool. Port of desktop [Archi](https://www.archimatetool.com) (`K:\repo\archi` / Open Group ArchiMate).

**Owner / primary agent:** Grok (xAI). Previous agent: Antigravity (mid Phase 3).

## Canonical locations

| Path | Role |
|------|------|
| `K:\repo\archi-web` (`/mnt/k/repo/archi-web`) | Primary Windows workspace (user-facing, has `node_modules`) |
| `~/projects/archi-web` | Linux/WSL worktree for reliable git (K: drive blocks `chmod` on `.git`) |
| `K:\repo\archi` | Desktop Archi 5.8.0-SNAPSHOT source (reference / TeaVM input) |
| https://github.com/rcknerd/archi-web | Remote; default branch **`paksi`** |

Prefer editing under `K:\repo\archi-web` when the user is on Windows; sync to `~/projects/archi-web` before commit/push if git on K: fails.

## Stack

- Svelte 5 + TypeScript + Vite 8
- maxGraph (`@maxgraph/core`) for diagrams
- isomorphic-git (Phase 5)
- TeaVM WASM bridge (scaffold; XML DOM parser is current fallback)
- Vitest + jsdom

```bash
npm install
npm run dev      # Vite
npm test         # vitest run
npm run check    # svelte-check + tsc
npm run build
```

## Roadmap (GitHub issues)

| Phase | Issue | Status |
|-------|-------|--------|
| 1 Scaffold + model engine | #1 | **Closed** — TS parser, types, workbench UI, Vitest |
| 2 File System Access + explorer | #2 | **Closed** — open/save/save-as, explorer tree, serialize |
| 3 maxGraph read-only canvas | #3 | **Closed** — nested nodes, bendpoints, shapes, edge styles |
| 4 Palette, inspector, undo | #4 | Open |
| 5 isomorphic-git / GitHub | #5 | Open (dep present) |
| 6 SVG/PNG/CSV export | #6 | Open |

## Current architecture

```
src/
  App.svelte                 # Workbench shell: toolbar, sidebar, canvas host
  lib/model/
    types.ts                 # ArchiElement, Relationship, DiagramView, ArchiModel
    ArchiModelEngine.ts      # parseXmlModel (DOMParser); optional WASM init stub
    ArchiModelEngine.test.ts
  lib/canvas/                # Phase 3 WIP (was untracked under Antigravity)
    DiagramCanvas.svelte     # maxGraph Graph, pan/zoom, read-only render
    archi-styles.ts          # ArchiMate fill colours + relationship edge styles
java-model-wasm/             # TeaVM scaffold; sources from ../../archi/com.archimatetool.model
```

### Parser notes

- Loads `.archimate` via `showOpenFilePicker` → `engine.parseXmlModel(text)`.
- Saves via `showSaveFilePicker` / file handle `createWritable` → `engine.serializeXmlModel(model)`.
- Elements / relationships distinguished by `xsi:type` (`*Relationship`); folders walked recursively.
- Views: `*DiagramModel` / `*SketchModel`; **direct** `child` nodes only (nesting preserved); `sourceConnection` + Archi relative `bendpoint`s.
- Bounds: supports both `width`/`height` (Archi desktop) and legacy `w`/`h`.
- WASM path (`/wasm/archi_model.wasm`) not built yet; engine falls back to XML DOM.

### Canvas notes (Phase 3)

- Read-only (`graph.setEnabled(false)`), panning + wheel zoom + fit.
- Nested vertices (parent cell = container); absolute bendpoint conversion for edges.
- Shape families via `styleForElementType` (rounded, ellipse, actor, cylinder, junction, note, grouping, …).
- Relationship arrow styles for Composition, Aggregation, Assignment, Serving, Realization, etc.
- Still approximate vs desktop icons/stencils; full stencil parity is future work.

## Conventions

- Keep Phase work aligned to the matching GitHub issue; close issues when verification criteria are met.
- Prefer small, testable commits on `paksi`.
- Desktop reference for behaviour/colours: `K:\repo\archi`, especially `com.archimatetool.model` and editor figure code.
- Do not commit secrets; origin must be `https://github.com/rcknerd/archi-web.git` (no embedded tokens).

## Immediate next steps (when resuming)

1. Phase 4: palette, properties inspector, command stack (undo/redo), enable graph editing.
2. Optional: complete TeaVM WASM build from `java-model-wasm` + desktop model sources.
3. Phase 5–6: git collab + exporters.
