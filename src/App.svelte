<script lang="ts">
  import { ArchiModelEngine } from './lib/model/ArchiModelEngine';
  import type { ArchiModel, DiagramView } from './lib/model/types';
  import { FolderOpen, File, ChevronRight, ChevronDown, Layers, Box, Cpu, Network, Zap } from '@lucide/svelte';

  const engine = new ArchiModelEngine();

  let model = $state<ArchiModel | null>(null);
  let activeView = $state<DiagramView | null>(null);
  let isLoading = $state(false);
  let errorMsg = $state('');
  let expandedFolders = $state(new Set<string>());

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
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'ArchiMate Model', accept: { 'application/xml': ['.archimate'] } }],
        multiple: false,
      });
      isLoading = true;
      errorMsg = '';
      const file = await fileHandle.getFile();
      const text = await file.text();
      model = engine.parseXmlModel(text);
      activeView = model.views[0] ?? null;
    } catch (e: any) {
      if (e?.name !== 'AbortError') errorMsg = `Failed to open file: ${e?.message}`;
    } finally {
      isLoading = false;
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
    return groups;
  }

  function toggleFolder(key: string) {
    const next = new Set(expandedFolders);
    next.has(key) ? next.delete(key) : next.add(key);
    expandedFolders = next;
  }
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
        {isLoading ? 'Loading…' : 'Open .archimate'}
      </button>
    </nav>
    {#if model}
      <div class="toolbar-model-name">{model.name}</div>
    {/if}
    <div class="toolbar-spacer"></div>
    <div class="toolbar-badge">Phase 1 · Parser & Model Engine</div>
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
                    onclick={() => activeView = view}>
                    <File size={12} />
                    {view.name}
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
                  <li class="sidebar-item-row">
                    <IconComp size={12} />
                    <span class="item-name">{el.name || el.id}</span>
                    <span class="item-type">{el.type.replace(/^I/, '')}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}

        <!-- Relationships summary -->
        <section class="sidebar-section">
          <div class="sidebar-section-header sidebar-section-header--static">
            <ChevronRight size={12}/>
            Relationships <span class="sidebar-count">{model.relationships.size}</span>
          </div>
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
          <span class="view-stats">{activeView.nodes.length} nodes · {activeView.connections.length} connections</span>
        </div>
        <div class="canvas-diagram-placeholder">
          <div class="phase-notice">
            <Cpu size={18} />
            <strong>Phase 1 complete</strong> — Model parsed successfully. maxGraph canvas rendering arrives in Phase 3.
          </div>
          <div class="element-preview-grid">
            {#each activeView.nodes as node}
              {@const elem = model.elements.get(node.archimateElementId ?? '')}
              <div class="element-card"
                   style="--el-color:{layerVar[elem?.layer ?? 'other']}">
                <div class="element-card-type">{elem?.type ?? node.type}</div>
                <div class="element-card-name">{node.name || elem?.name || node.id}</div>
                <div class="element-card-pos">{node.x},{node.y} · {node.width}×{node.height}</div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="canvas-welcome">
          <p>Select a view from the sidebar to preview its contents.</p>
        </div>
      {/if}
    </main>
  </div>

  <!-- ── Status bar ── -->
  <footer class="statusbar">
    {#if model}
      <span>✓ {model.elements.size} elements · {model.relationships.size} relationships · {model.views.length} views</span>
      <span class="statusbar-sep">|</span>
      <span>ArchiMate {model.version}</span>
    {:else}
      <span>No model loaded</span>
    {/if}
    <div class="statusbar-spacer"></div>
    <span>Issue #1 — WASM Model Engine</span>
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
  .sidebar-section-header--static { cursor: default; }
  .sidebar-section-header--static:hover { background: transparent; color: var(--text-secondary); }

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

  /* Row-based element items (non-interactive) */
  .sidebar-item-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 20px;
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
  }
  .sidebar-item-row:hover { background: var(--bg-hover); }
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
  .view-stats { font-size: 11px; color: var(--text-muted); margin-left: auto; }

  .canvas-diagram-placeholder { flex: 1; padding: 24px; overflow: auto; }
  .phase-notice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 12px;
    margin-bottom: 20px;
  }
  .phase-notice strong { color: var(--accent-green); }

  .element-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .element-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-top: 3px solid var(--el-color, var(--text-muted));
    border-radius: var(--radius-md);
    padding: 12px;
    transition: border-color 0.15s, background 0.15s;
  }
  .element-card:hover { background: var(--bg-hover); border-color: var(--el-color, var(--border-default)); }
  .element-card-type { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 4px; }
  .element-card-name { font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px; }
  .element-card-pos { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }

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
