<script lang="ts">
  import { ArchiModelEngine } from './lib/model/ArchiModelEngine';
  import type { ArchiModel, DiagramView, DiagramNode } from './lib/model/types';
  import type { Selection } from './lib/model/selection';
  import { EMPTY_SELECTION } from './lib/model/selection';
  import {
    FolderOpen,
    File,
    ChevronRight,
    ChevronDown,
    Layers,
    Box,
    Cpu,
    Network,
    Zap,
    Save,
  } from '@lucide/svelte';
  import DiagramCanvas from './lib/canvas/DiagramCanvas.svelte';
  import PropertiesPane from './lib/ui/PropertiesPane.svelte';

  const engine = new ArchiModelEngine();
  const ARCHIMATE_PICKER_TYPES = [
    {
      description: 'ArchiMate Model',
      accept: { 'application/xml': ['.archimate'], 'text/xml': ['.archimate'] },
    },
  ];

  let model = $state<ArchiModel | null>(null);
  let activeView = $state<DiagramView | null>(null);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let errorMsg = $state('');
  let statusNote = $state('');
  let expandedFolders = $state(new Set<string>(['views']));
  let fileHandle = $state<FileSystemFileHandle | null>(null);
  let fileName = $state('');
  let dirty = $state(false);
  let selection = $state<Selection>({ ...EMPTY_SELECTION });
  /** Bumps to remount the canvas after structural view changes (e.g. drop). */
  let viewEpoch = $state(0);

  const layerIcon: Record<string, any> = {
    strategy: Zap,
    business: Layers,
    application: Box,
    technology: Cpu,
    physical: Network,
    motivation: Layers,
    implementation: Layers,
    other: Box,
  };

  const layerVar: Record<string, string> = {
    strategy: 'var(--layer-strategy)',
    business: 'var(--layer-business)',
    application: 'var(--layer-application)',
    technology: 'var(--layer-technology)',
    physical: 'var(--layer-physical)',
    motivation: 'var(--layer-motivation)',
    implementation: 'var(--layer-implementation)',
    other: 'var(--text-muted)',
  };

  async function openFile() {
    try {
      if (!(window as any).showOpenFilePicker) {
        // Fallback for browsers without File System Access API
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.archimate,application/xml,text/xml';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          await loadFromText(await file.text(), null, file.name);
        };
        input.click();
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        types: ARCHIMATE_PICKER_TYPES,
        multiple: false,
      });
      isLoading = true;
      errorMsg = '';
      const file = await handle.getFile();
      await loadFromText(await file.text(), handle, file.name);
    } catch (e: any) {
      if (e?.name !== 'AbortError') errorMsg = `Failed to open file: ${e?.message}`;
    } finally {
      isLoading = false;
    }
  }

  async function loadFromText(
    text: string,
    handle: FileSystemFileHandle | null,
    name: string,
  ) {
    isLoading = true;
    errorMsg = '';
    try {
      const parsed = engine.parseXmlModel(text);
      model = parsed;
      activeView = parsed.views[0] ?? null;
      selection = { ...EMPTY_SELECTION };
      fileHandle = handle;
      fileName = name;
      dirty = false;
      statusNote = `Loaded ${parsed.elements.size} elements · ${parsed.views.length} views`;
      // Expand views + layers that have content
      const next = new Set<string>(['views']);
      for (const el of parsed.elements.values()) next.add(el.layer);
      expandedFolders = next;
    } catch (e: any) {
      errorMsg = `Failed to parse model: ${e?.message || e}`;
      model = null;
      activeView = null;
      selection = { ...EMPTY_SELECTION };
    } finally {
      isLoading = false;
    }
  }

  async function saveFile() {
    if (!model) return;
    try {
      isSaving = true;
      errorMsg = '';
      const xml = engine.serializeXmlModel(model);
      const blob = new Blob([xml], { type: 'application/xml' });

      if (fileHandle && 'createWritable' in fileHandle) {
        const writable = await (fileHandle as any).createWritable();
        await writable.write(blob);
        await writable.close();
      } else if ((window as any).showSaveFilePicker) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName || `${model.name || 'model'}.archimate`,
          types: ARCHIMATE_PICKER_TYPES,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        fileHandle = handle;
        fileName = handle.name || fileName;
      } else {
        // Anchor download fallback
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || `${model.name || 'model'}.archimate`;
        a.click();
        URL.revokeObjectURL(url);
      }
      dirty = false;
      statusNote = `Saved ${fileName || 'model.archimate'}`;
    } catch (e: any) {
      if (e?.name !== 'AbortError') errorMsg = `Failed to save: ${e?.message}`;
    } finally {
      isSaving = false;
    }
  }

  async function saveFileAs() {
    if (!model) return;
    // Force picker even if we already have a handle
    const prev = fileHandle;
    fileHandle = null;
    try {
      if (!(window as any).showSaveFilePicker) {
        await saveFile();
        return;
      }
      isSaving = true;
      const xml = engine.serializeXmlModel(model);
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName || `${model.name || 'model'}.archimate`,
        types: ARCHIMATE_PICKER_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([xml], { type: 'application/xml' }));
      await writable.close();
      fileHandle = handle;
      fileName = handle.name || fileName;
      dirty = false;
      statusNote = `Saved as ${fileName}`;
    } catch (e: any) {
      fileHandle = prev;
      if (e?.name !== 'AbortError') errorMsg = `Failed to save: ${e?.message}`;
    } finally {
      isSaving = false;
    }
  }

  function groupedElements() {
    if (!model) return {} as Record<string, any[]>;
    const groups: Record<string, any[]> = {};
    for (const el of model.elements.values()) {
      const g = el.layer;
      if (!groups[g]) groups[g] = [];
      groups[g].push(el);
    }
    // Stable layer order
    const order = [
      'strategy',
      'business',
      'application',
      'technology',
      'physical',
      'motivation',
      'implementation',
      'other',
    ];
    const sorted: Record<string, any[]> = {};
    for (const k of order) {
      if (groups[k]) sorted[k] = groups[k].sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function toggleFolder(key: string) {
    const next = new Set(expandedFolders);
    next.has(key) ? next.delete(key) : next.add(key);
    expandedFolders = next;
  }

  function selectView(view: DiagramView) {
    activeView = view;
    selection = { kind: 'view', id: view.id, viewId: view.id };
  }

  function selectElement(el: { id: string }) {
    selection = { kind: 'element', id: el.id, elementId: el.id };
  }

  function selectRelationship(rel: { id: string }) {
    selection = { kind: 'relationship', id: rel.id };
  }

  function onCanvasSelect(sel: Selection) {
    selection = sel;
  }

  function clearSelection() {
    selection = { ...EMPTY_SELECTION };
  }

  /** Update diagram node position after drag on canvas (in-memory; Save persists). */
  function onNodeMove(payload: { diagramNodeId: string; x: number; y: number }) {
    if (!activeView || !model) return;
    const update = (nodes: DiagramNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === payload.diagramNodeId) {
          n.x = Math.round(payload.x);
          n.y = Math.round(payload.y);
          return true;
        }
        if (n.children?.length && update(n.children)) return true;
      }
      return false;
    };
    // Mutate the active view tree
    if (update(activeView.nodes)) {
      dirty = true;
      statusNote = 'Moved element (unsaved)';
      // Trigger reactivity for activeView reference
      activeView = activeView;
      model = model;
    }
  }

  /** Drop an explorer element onto the diagram (adds a diagram object if missing). */
  function onCanvasDropElement(payload: { elementId: string; x: number; y: number }) {
    if (!activeView || !model) return;
    const el = model.elements.get(payload.elementId);
    if (!el) return;

    const alreadyOnView = (nodes: DiagramNode[]): boolean => {
      for (const n of nodes) {
        if (n.archimateElementId === payload.elementId) return true;
        if (n.children?.length && alreadyOnView(n.children)) return true;
      }
      return false;
    };
    if (alreadyOnView(activeView.nodes)) {
      selection = { kind: 'element', id: el.id, elementId: el.id };
      statusNote = `"${el.name}" is already on this view`;
      return;
    }

    const id = `diag-${crypto.randomUUID?.() || Date.now()}`;
    const node: DiagramNode = {
      id,
      archimateElementId: el.id,
      name: el.name,
      type: 'DiagramObject',
      x: Math.round(payload.x),
      y: Math.round(payload.y),
      width: 120,
      height: 55,
    };
    activeView.nodes = [...activeView.nodes, node];
    // Force canvas remount via view identity-preserving update + key bump
    activeView = { ...activeView, nodes: activeView.nodes };
    model = model;
    dirty = true;
    selection = {
      kind: 'diagram-node',
      id: el.id,
      elementId: el.id,
      diagramNodeId: id,
      viewId: activeView.id,
    };
    statusNote = `Added "${el.name}" to view (unsaved)`;
    viewEpoch += 1;
  }

  function countNodes(nodes: { children?: any[] }[]): number {
    let n = 0;
    for (const node of nodes) {
      n += 1;
      if (node.children?.length) n += countNodes(node.children);
    }
    return n;
  }

  const selectedKey = $derived(
    selection.kind === 'none'
      ? ''
      : selection.diagramNodeId || selection.elementId || selection.id,
  );
</script>

<div class="workbench">
  <!-- ── Toolbar ── -->
  <header class="toolbar">
    <div class="toolbar-brand">
      <span class="brand-icon">◈</span>
      <span class="brand-name">Archi <em>Web</em></span>
    </div>
    <nav class="toolbar-actions">
      <button class="btn btn-primary" onclick={openFile} disabled={isLoading}>
        <FolderOpen size={14} />
        {isLoading ? 'Loading…' : 'Open'}
      </button>
      <button class="btn" onclick={saveFile} disabled={!model || isSaving} title="Save model">
        <Save size={14} />
        {isSaving ? 'Saving…' : 'Save'}
      </button>
      <button class="btn" onclick={saveFileAs} disabled={!model || isSaving} title="Save as…">
        Save as…
      </button>
    </nav>
    {#if model}
      <div class="toolbar-model-name" title={fileName || model.name}>
        {model.name}{dirty ? ' •' : ''}
        {#if fileName}<span class="toolbar-filename">{fileName}</span>{/if}
      </div>
    {/if}
    <div class="toolbar-spacer"></div>
    <div class="toolbar-badge">Phase 4 · Select · Move · Inspect</div>
  </header>

  <!-- ── Body ── -->
  <div class="body">
    <!-- Sidebar -->
    <aside class="sidebar">
      {#if !model}
        <div class="sidebar-empty">
          <FolderOpen size={32} strokeWidth={1.2} />
          <p>Open an <code>.archimate</code> file to explore your model</p>
        </div>
      {:else}
        <!-- Views section -->
        <section class="sidebar-section">
          <button class="sidebar-section-header" onclick={() => toggleFolder('views')}>
            {#if expandedFolders.has('views')}<ChevronDown size={12}/>{:else}<ChevronRight size={12}/>{/if}
            Views <span class="sidebar-count">{model.views.length}</span>
          </button>
          {#if expandedFolders.has('views')}
            <ul class="sidebar-list">
              {#each model.views as view}
                <li>
                  <button
                    class="sidebar-item {activeView?.id === view.id ? 'active' : ''}"
                    onclick={() => selectView(view)}>
                    <File size={12} />
                    <span class="item-name">{view.name}</span>
                    <span class="item-type">{view.nodes.length}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <!-- Elements grouped by layer -->
        {#each Object.entries(groupedElements()) as [layer, elements]}
          <section class="sidebar-section">
            <button class="sidebar-section-header" onclick={() => toggleFolder(layer)}>
              {#if expandedFolders.has(layer)}<ChevronDown size={12}/>{:else}<ChevronRight size={12}/>{/if}
              <span class="layer-dot" style="background:{layerVar[layer]}"></span>
              {layer.charAt(0).toUpperCase() + layer.slice(1)}
              <span class="sidebar-count">{elements.length}</span>
            </button>
            {#if expandedFolders.has(layer)}
              <ul class="sidebar-list">
                {#each elements as el}
                  {@const IconComp = layerIcon[el.layer] ?? Box}
                  <li>
                    <button
                      type="button"
                      class="sidebar-item {selection.elementId === el.id || selection.id === el.id ? 'active' : ''}"
                      onclick={() => selectElement(el)}
                      draggable="true"
                      ondragstart={(e) => {
                        e.dataTransfer?.setData('application/x-archi-element', el.id);
                        e.dataTransfer!.effectAllowed = 'copy';
                      }}
                      title="Click to inspect · Drag onto diagram (coming soon)"
                    >
                      <IconComp size={12} />
                      <span class="item-name">{el.name || el.id}</span>
                      <span class="item-type">{el.type.replace(/^I/, '')}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}

        <!-- Relationships -->
        <section class="sidebar-section">
          <button class="sidebar-section-header" onclick={() => toggleFolder('relationships')}>
            {#if expandedFolders.has('relationships')}<ChevronDown size={12}/>{:else}<ChevronRight size={12}/>{/if}
            Relationships <span class="sidebar-count">{model.relationships.size}</span>
          </button>
          {#if expandedFolders.has('relationships')}
            <ul class="sidebar-list">
              {#each [...model.relationships.values()] as rel}
                <li>
                  <button
                    type="button"
                    class="sidebar-item {selection.id === rel.id ? 'active' : ''}"
                    onclick={() => selectRelationship(rel)}
                  >
                    <span class="item-name">{rel.name || rel.type.replace(/Relationship$/, '')}</span>
                    <span class="item-type">{rel.type.replace(/Relationship$/, '')}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </aside>

    <!-- Main canvas area -->
    <main class="canvas-area">
      {#if errorMsg}
        <div class="canvas-error">{errorMsg}</div>
      {:else if !model}
        <div class="canvas-welcome">
          <div class="welcome-icon">◈</div>
          <h1>Archi Web</h1>
          <p>A modern browser-based ArchiMate modeling tool</p>
          <p class="welcome-sub">Open an <code>.archimate</code> file using the button above to begin.</p>
          <div class="welcome-stack">
            <span>Svelte 5</span>
            <span>maxGraph</span>
            <span>TeaVM WASM</span>
            <span>isomorphic-git</span>
          </div>
        </div>
      {:else if activeView}
        <div class="canvas-view-header">
          <span class="view-label">View</span>
          <span class="view-name">{activeView.name}</span>
          {#if activeView.viewpoint}
            <span class="view-viewpoint">{activeView.viewpoint}</span>
          {/if}
          <span class="view-stats"
            >{countNodes(activeView.nodes)} nodes · {activeView.connections.length} connections</span
          >
        </div>
        <div class="canvas-live">
          {#key `${activeView.id}-${viewEpoch}`}
            <DiagramCanvas
              view={activeView}
              model={model}
              selectedId={selectedKey}
              onselect={onCanvasSelect}
              onmove={onNodeMove}
              ondropelement={onCanvasDropElement}
            />
          {/key}
        </div>
      {:else}
        <div class="canvas-welcome">
          <p>Select a view from the sidebar to preview its contents.</p>
        </div>
      {/if}
    </main>

    <!-- Properties / selection info -->
    <PropertiesPane
      model={model}
      selection={selection}
      activeView={activeView}
      onclear={clearSelection}
    />
  </div>

  <!-- ── Status bar ── -->
  <footer class="statusbar">
    {#if model}
      <span>✓ {model.elements.size} elements · {model.relationships.size} relationships · {model.views.length} views</span>
      <span class="statusbar-sep">|</span>
      <span>ArchiMate {model.version}</span>
      {#if statusNote}
        <span class="statusbar-sep">|</span>
        <span>{statusNote}</span>
      {/if}
    {:else}
      <span>No model loaded — open a .archimate file</span>
    {/if}
    <div class="statusbar-spacer"></div>
    {#if selection.kind !== 'none'}
      <span class="statusbar-sep">|</span>
      <span>Selected: {selection.kind} · {selection.id.slice(0, 12)}</span>
    {/if}
    <span>Phase 4 WIP</span>
  </footer>
</div>

<style>
  .workbench {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: var(--toolbar-height);
    padding: 0 14px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
    z-index: 10;
  }
  .toolbar-brand {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    font-size: 14px;
    color: var(--text-primary);
    letter-spacing: -0.3px;
  }
  .brand-icon { font-size: 18px; color: var(--accent-blue); }
  .brand-name em { color: var(--accent-blue); font-style: normal; }
  .toolbar-model-name {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 0 10px;
    border-left: 1px solid var(--border-subtle);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbar-spacer { flex: 1; }
  .toolbar-badge {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 20px;
    padding: 2px 9px;
    letter-spacing: 0.3px;
  }
  .toolbar-actions { display: flex; gap: 6px; }

  /* ── Body ── */
  .body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sidebar-width);
    flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-subtle);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 12px;
    color: var(--text-muted);
    padding: 24px;
    text-align: center;
    line-height: 1.6;
  }
  .sidebar-empty code { color: var(--accent-blue); font-family: var(--font-mono); font-size: 11px; }
  .sidebar-section { border-bottom: 1px solid var(--border-subtle); }

  .sidebar-section-header {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    user-select: none;
    background: transparent;
    border: none;
    text-align: left;
    font-family: var(--font-sans);
  }
  .sidebar-section-header:hover { color: var(--text-primary); background: var(--bg-hover); }

  .sidebar-count {
    margin-left: auto;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--bg-elevated);
    border-radius: 8px;
    padding: 0 5px;
  }
  .layer-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .sidebar-list { list-style: none; padding: 2px 0 6px; }

  /* Button-based sidebar items (views) */
  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 10px 4px 20px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    background: transparent;
    border: none;
    text-align: left;
    font-family: var(--font-sans);
    transition: background 0.1s;
  }
  .sidebar-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .sidebar-item.active { background: var(--bg-active); color: var(--accent-blue); }

  .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-type {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    font-family: var(--font-mono);
    flex-shrink: 0;
  }

  /* ── Canvas ── */
  .canvas-area {
    flex: 1;
    overflow: auto;
    background: var(--bg-base);
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .canvas-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 14px;
    color: var(--text-secondary);
    text-align: center;
    padding: 40px;
  }
  .welcome-icon { font-size: 52px; color: var(--accent-blue); opacity: 0.4; }
  .canvas-welcome h1 {
    font-size: 26px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.5px;
  }
  .canvas-welcome code { color: var(--accent-blue); font-family: var(--font-mono); font-size: 12px; }
  .welcome-sub { color: var(--text-muted); font-size: 12px; }
  .welcome-stack {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .welcome-stack span {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    background: var(--bg-elevated);
  }
  .canvas-error {
    padding: 16px;
    color: var(--accent-red);
    background: rgba(248,113,113,0.06);
    border-bottom: 1px solid rgba(248,113,113,0.2);
  }
  .canvas-view-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 16px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .view-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
  .view-name { font-weight: 600; color: var(--text-primary); font-size: 13px; }
  .view-viewpoint {
    font-size: 10px;
    color: var(--accent-blue);
    background: var(--accent-blue-glow);
    border-radius: 10px;
    padding: 1px 8px;
  }
  .view-stats { font-size: 11px; color: var(--text-muted); margin-left: auto; }
  .toolbar-filename {
    display: block;
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 400;
  }
  .toolbar-actions :global(.btn:disabled) { opacity: 0.45; cursor: not-allowed; }

  .canvas-live {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  /* ── Statusbar ── */
  .statusbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--statusbar-height);
    padding: 0 12px;
    background: var(--accent-blue);
    color: rgba(255,255,255,0.85);
    font-size: 11px;
    flex-shrink: 0;
  }
  .statusbar-sep { opacity: 0.4; }
  .statusbar-spacer { flex: 1; }
</style>
