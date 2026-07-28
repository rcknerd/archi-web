<script lang="ts">
  import type { ArchiModel, ArchiElement, ArchiRelationship, DiagramView } from '../model/types';
  import type { Selection } from '../model/selection';
  import { formatTypeName, ELEMENT_FILL, LAYER_FILL } from '../canvas/archi-styles';
  import { X } from '@lucide/svelte';

  interface Props {
    model: ArchiModel | null;
    selection: Selection;
    activeView: DiagramView | null;
    onclear?: () => void;
  }

  let { model, selection, activeView, onclear }: Props = $props();

  function elementById(id: string | undefined): ArchiElement | undefined {
    if (!model || !id) return undefined;
    return model.elements.get(id);
  }

  function relationshipById(id: string): ArchiRelationship | undefined {
    return model?.relationships.get(id);
  }

  function relatedRels(elementId: string): ArchiRelationship[] {
    if (!model) return [];
    return [...model.relationships.values()].filter(
      (r) => r.sourceId === elementId || r.targetId === elementId,
    );
  }

  function nameOf(id: string): string {
    return model?.elements.get(id)?.name || model?.relationships.get(id)?.name || id;
  }

  function viewsContaining(elementId: string): DiagramView[] {
    if (!model) return [];
    const walk = (nodes: { archimateElementId?: string; children?: any[] }[]): boolean => {
      for (const n of nodes) {
        if (n.archimateElementId === elementId) return true;
        if (n.children?.length && walk(n.children)) return true;
      }
      return false;
    };
    return model.views.filter((v) => walk(v.nodes));
  }

  const resolved = $derived.by(() => {
    if (!model || selection.kind === 'none') return null;

    if (selection.kind === 'element' || selection.kind === 'diagram-node') {
      const elId = selection.elementId || selection.id;
      const el = elementById(elId);
      // Diagram-only node (note/group) without concept
      if (!el && selection.kind === 'diagram-node' && activeView) {
        const findNode = (nodes: any[]): any => {
          for (const n of nodes) {
            if (n.id === selection.diagramNodeId || n.id === selection.id) return n;
            if (n.children) {
              const f = findNode(n.children);
              if (f) return f;
            }
          }
          return null;
        };
        const node = findNode(activeView.nodes);
        if (node) {
          return {
            mode: 'diagram-node' as const,
            title: node.name || 'Diagram object',
            type: node.type,
            fill: node.fillColor || '#ffffff',
            docs: '',
            props: {} as Record<string, string>,
            id: node.id,
            layer: 'other',
            rels: [] as ArchiRelationship[],
            inViews: [] as DiagramView[],
          };
        }
      }
      if (!el) return null;
      return {
        mode: 'element' as const,
        title: el.name || el.id,
        type: el.type,
        fill: ELEMENT_FILL[el.type] || LAYER_FILL[el.layer] || '#fff',
        docs: el.documentation || '',
        props: el.properties || {},
        id: el.id,
        layer: el.layer,
        rels: relatedRels(el.id),
        inViews: viewsContaining(el.id),
      };
    }

    if (selection.kind === 'relationship') {
      const rel = relationshipById(selection.id);
      if (!rel) return null;
      return {
        mode: 'relationship' as const,
        title: rel.name || formatTypeName(rel.type),
        type: rel.type,
        fill: '#8892a4',
        docs: rel.documentation || '',
        props: rel.properties || {},
        id: rel.id,
        layer: 'relations',
        rels: [] as ArchiRelationship[],
        inViews: [] as DiagramView[],
        sourceId: rel.sourceId,
        targetId: rel.targetId,
      };
    }

    if (selection.kind === 'view') {
      const v = model.views.find((x) => x.id === selection.id) || activeView;
      if (!v) return null;
      return {
        mode: 'view' as const,
        title: v.name,
        type: 'ArchimateDiagramModel',
        fill: '#4d8ef0',
        docs: v.documentation || '',
        props: v.viewpoint ? { viewpoint: v.viewpoint } : {},
        id: v.id,
        layer: 'views',
        rels: [] as ArchiRelationship[],
        inViews: [] as DiagramView[],
        nodeCount: v.nodes.length,
        connCount: v.connections.length,
      };
    }

    return null;
  });
</script>

<aside class="props-pane">
  <header class="props-header">
    <span class="props-title">Properties</span>
    {#if selection.kind !== 'none' && onclear}
      <button type="button" class="props-clear" onclick={onclear} title="Clear selection">
        <X size={14} />
      </button>
    {/if}
  </header>

  {#if !model}
    <div class="props-empty">Load a model to inspect elements.</div>
  {:else if !resolved}
    <div class="props-empty">
      <p>Nothing selected</p>
      <p class="props-hint">Click an element in the explorer or on the diagram.</p>
    </div>
  {:else}
    <div class="props-body">
      <div class="props-identity">
        <span class="props-swatch" style="background:{resolved.fill}"></span>
        <div class="props-identity-text">
          <div class="props-name" title={resolved.title}>{resolved.title}</div>
          <div class="props-type">{formatTypeName(resolved.type)}</div>
        </div>
      </div>

      <section class="props-section">
        <h3>Details</h3>
        <dl class="props-dl">
          <dt>ID</dt>
          <dd class="mono">{resolved.id}</dd>
          {#if resolved.mode === 'element'}
            <dt>Layer</dt>
            <dd>{resolved.layer}</dd>
          {/if}
          {#if resolved.mode === 'relationship'}
            <dt>Source</dt>
            <dd>{nameOf((resolved as any).sourceId)}</dd>
            <dt>Target</dt>
            <dd>{nameOf((resolved as any).targetId)}</dd>
          {/if}
          {#if resolved.mode === 'view'}
            <dt>Nodes</dt>
            <dd>{(resolved as any).nodeCount}</dd>
            <dt>Connections</dt>
            <dd>{(resolved as any).connCount}</dd>
          {/if}
        </dl>
      </section>

      {#if resolved.docs}
        <section class="props-section">
          <h3>Documentation</h3>
          <p class="props-docs">{resolved.docs}</p>
        </section>
      {/if}

      {#if Object.keys(resolved.props).length}
        <section class="props-section">
          <h3>Properties</h3>
          <dl class="props-dl">
            {#each Object.entries(resolved.props) as [k, v]}
              <dt>{k}</dt>
              <dd>{v}</dd>
            {/each}
          </dl>
        </section>
      {/if}

      {#if resolved.mode === 'element' && resolved.rels.length}
        <section class="props-section">
          <h3>Relationships ({resolved.rels.length})</h3>
          <ul class="props-list">
            {#each resolved.rels.slice(0, 40) as rel}
              {@const outbound = rel.sourceId === resolved.id}
              <li>
                <span class="rel-dir">{outbound ? '→' : '←'}</span>
                <span class="rel-type">{formatTypeName(rel.type)}</span>
                <span class="rel-peer">{nameOf(outbound ? rel.targetId : rel.sourceId)}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if resolved.mode === 'element' && resolved.inViews.length}
        <section class="props-section">
          <h3>Used in views</h3>
          <ul class="props-list">
            {#each resolved.inViews as v}
              <li class="view-chip">{v.name}</li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .props-pane {
    width: var(--props-width, 280px);
    flex-shrink: 0;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .props-header {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .props-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
  }
  .props-clear {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
  }
  .props-clear:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .props-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 12px;
    padding: 24px;
    text-align: center;
  }
  .props-hint {
    font-size: 11px;
    opacity: 0.8;
  }
  .props-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }
  .props-identity {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .props-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1px solid var(--border-default);
    flex-shrink: 0;
  }
  .props-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    word-break: break-word;
  }
  .props-type {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    margin-top: 2px;
  }
  .props-section {
    margin-bottom: 14px;
  }
  .props-section h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 600;
  }
  .props-dl {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 4px 8px;
    font-size: 12px;
  }
  .props-dl dt {
    color: var(--text-muted);
  }
  .props-dl dd {
    color: var(--text-secondary);
    word-break: break-word;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .props-docs {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .props-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .props-list li {
    font-size: 11px;
    color: var(--text-secondary);
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 3px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .rel-dir {
    color: var(--accent-blue);
    font-weight: 600;
    width: 12px;
  }
  .rel-type {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    flex-shrink: 0;
  }
  .rel-peer {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .view-chip {
    color: var(--accent-blue) !important;
    border-bottom: none !important;
  }
</style>
