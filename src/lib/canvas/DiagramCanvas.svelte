<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Graph,
    InternalEvent,
    Client,
    Point,
    Geometry,
  } from '@maxgraph/core';
  import type { FitPlugin } from '@maxgraph/core';
  import '@maxgraph/core/css/common.css';
  import type { ArchiModel, DiagramView, DiagramNode, DiagramConnection } from '../model/types';
  import {
    ELEMENT_FILL,
    RELATIONSHIP_STYLE,
    DEFAULT_EDGE_STYLE,
    styleForElementType,
    absoluteBendpoint,
  } from './archi-styles';

  interface Props {
    view: DiagramView;
    model: ArchiModel;
  }

  let { view, model }: Props = $props();

  let containerEl: HTMLDivElement;
  let graph: Graph | null = null;
  let renderError = $state('');
  let resizeObserver: ResizeObserver | null = null;

  // Re-render when view / model changes (after graph exists)
  $effect(() => {
    const _view = view;
    const _model = model;
    if (graph && containerEl) {
      // Defer to next frame so layout has real container size
      requestAnimationFrame(() => renderView(_view, _model));
    }
  });

  onMount(() => {
    try {
      InternalEvent.disableContextMenu(containerEl);

      graph = new Graph(containerEl);

      // Read-only canvas (Phase 3)
      graph.setEnabled(false);
      graph.setPanning(true);
      try {
        const ph = graph.getPlugin('PanningHandler') as { setUseLeftButtonForPanning?: (v: boolean) => void } | undefined;
        ph?.setUseLeftButtonForPanning?.(true);
      } catch {
        /* optional */
      }
      graph.centerZoom = true;
      graph.setTooltips(true);
      graph.setHtmlLabels(true);
      graph.setConnectable(false);

      const container = graph.container as HTMLElement;
      container.style.background = '#1a1f2e';
      container.style.cursor = 'grab';
      // Ensure container participates in layout sizing
      container.style.width = '100%';
      container.style.height = '100%';

      // Re-fit when the flex layout assigns a non-zero size
      resizeObserver = new ResizeObserver(() => {
        if (!graph || !containerEl) return;
        if (containerEl.clientWidth < 10 || containerEl.clientHeight < 10) return;
        graph.sizeDidChange();
        fitGraph(graph);
      });
      resizeObserver.observe(containerEl);

      // Initial paint after layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (graph) renderView(view, model);
        });
      });
    } catch (e: any) {
      console.error('[DiagramCanvas] init failed', e);
      renderError = `Canvas init failed: ${e?.message || e}`;
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (graph) {
      graph.destroy();
      graph = null;
    }
  });

  function fitGraph(g: Graph) {
    try {
      const fitPlugin = g.getPlugin('fit') as FitPlugin | undefined;
      if (fitPlugin?.fit) {
        fitPlugin.fit({ border: 24 });
        // center after fit when available
        (g as any).center?.(true, true);
      } else if (typeof (g as any).fit === 'function') {
        (g as any).fit({ border: 24 });
      }
    } catch (e) {
      console.warn('[DiagramCanvas] fit failed', e);
    }
  }

  function clearGraph(g: Graph) {
    const parent = g.getDefaultParent();
    const children = g.getChildCells(parent, true, true);
    if (children.length) g.removeCells(children);
  }

  function cleanType(raw: string): string {
    return raw.replace(/^archimate:/, '').replace(/^I/, '');
  }

  function resolveElementType(node: DiagramNode, m: ArchiModel): string {
    if (node.archimateElementId) {
      const elem = m.elements.get(node.archimateElementId);
      if (elem?.type) return cleanType(elem.type);
    }
    return cleanType(node.type || 'Element');
  }

  function buildLabel(name: string, type: string, isJunction: boolean): string {
    if (isJunction) return '';
    const safeName = (name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const badge = type.replace(/([A-Z])/g, ' $1').trim();
    return `<div style="padding:3px 5px;text-align:center;line-height:1.25;pointer-events:none;">
      <div style="font-size:9px;color:#555;letter-spacing:0.2px;margin-bottom:1px;">${badge}</div>
      <div style="font-size:11px;font-weight:600;color:#111;">${safeName}</div>
    </div>`;
  }

  /** Absolute bounds map for bendpoint math (accounts for nesting). */
  function collectAbsoluteBounds(
    nodes: DiagramNode[],
    parentAbs = { x: 0, y: 0 },
    out = new Map<string, { x: number; y: number; width: number; height: number; cx: number; cy: number }>(),
  ) {
    for (const node of nodes) {
      const x = parentAbs.x + node.x;
      const y = parentAbs.y + node.y;
      const width = node.width || 120;
      const height = node.height || 55;
      out.set(node.id, {
        x,
        y,
        width,
        height,
        cx: x + width / 2,
        cy: y + height / 2,
      });
      if (node.children?.length) {
        collectAbsoluteBounds(node.children, { x, y }, out);
      }
    }
    return out;
  }

  function renderView(v: DiagramView, m: ArchiModel) {
    if (!graph) return;
    const g = graph;
    renderError = '';

    try {
      const absBounds = collectAbsoluteBounds(v.nodes);

      g.batchUpdate(() => {
        clearGraph(g);
        const rootParent = g.getDefaultParent();
        const nodeMap = new Map<string, any>();

        const insertNode = (node: DiagramNode, parent: any) => {
          const type = resolveElementType(node, m);
          const isJunction = type.includes('Junction');
          const fillColor =
            node.fillColor ?? ELEMENT_FILL[type] ?? ELEMENT_FILL[node.type] ?? '#ffffb5';
          const fontColor = node.fontColor ?? '#111111';
          const strokeColor = node.lineColor ?? '#5c5c5c';
          const hasChildren = !!(node.children && node.children.length);
          const style = styleForElementType(type, {
            fillColor,
            fontColor,
            strokeColor,
            hasChildren,
          });

          let w = node.width || 120;
          let h = node.height || 55;
          if (isJunction) {
            w = Math.min(w || 14, 14);
            h = Math.min(h || 14, 14);
          }

          const label = buildLabel(
            node.name || m.elements.get(node.archimateElementId ?? '')?.name || '',
            type,
            isJunction,
          );

          const cell = g.insertVertex({
            parent,
            id: node.id,
            value: label,
            x: node.x,
            y: node.y,
            width: w,
            height: h,
            style: style as any,
          });
          nodeMap.set(node.id, cell);

          for (const child of node.children || []) {
            insertNode(child, cell);
          }
        };

        for (const node of v.nodes) {
          insertNode(node, rootParent);
        }

        for (const conn of v.connections) {
          insertConnection(g, conn, nodeMap, m, absBounds, rootParent);
        }
      });

      g.view?.validate?.();
      g.sizeDidChange();
      fitGraph(g);

      // Debug aid in console
      const n = g.getChildVertices(g.getDefaultParent()).length;
      const e = g.getChildEdges(g.getDefaultParent()).length;
      console.debug(`[DiagramCanvas] rendered view "${v.name}": ${n} vertices, ${e} edges, container ${containerEl?.clientWidth}x${containerEl?.clientHeight}`);
    } catch (err: any) {
      console.error('[DiagramCanvas] render failed', err);
      renderError = `Render failed: ${err?.message || err}`;
    }
  }

  function insertConnection(
    g: Graph,
    conn: DiagramConnection,
    nodeMap: Map<string, any>,
    m: ArchiModel,
    absBounds: Map<string, { cx: number; cy: number; x: number; y: number; width: number; height: number }>,
    parent: any,
  ) {
    const sourceCell = nodeMap.get(conn.sourceId);
    const targetCell = nodeMap.get(conn.targetId);
    if (!sourceCell || !targetCell) return;

    const rel = conn.relationshipId ? m.relationships.get(conn.relationshipId) : undefined;
    const relType = cleanType(rel?.type ?? conn.type ?? 'AssociationRelationship');
    const relStyle = RELATIONSHIP_STYLE[relType] ?? DEFAULT_EDGE_STYLE;

    const edgeStyle: Record<string, unknown> = {
      ...relStyle,
      strokeColor: conn.lineColor ?? '#8892a4',
      strokeWidth: 1.4,
      fontSize: 10,
      fontColor: '#8892a4',
      fontFamily: 'Inter, system-ui, sans-serif',
      edgeStyle: conn.bendpoints?.length ? 'entityRelationEdgeStyle' : 'orthogonalEdgeStyle',
      rounded: false,
    };

    const edge = g.insertEdge({
      parent,
      id: conn.id,
      source: sourceCell,
      target: targetCell,
      value: conn.name ?? rel?.name ?? '',
      style: edgeStyle as any,
    });

    if (conn.bendpoints?.length) {
      const src = absBounds.get(conn.sourceId);
      const tgt = absBounds.get(conn.targetId);
      if (src && tgt) {
        const points = conn.bendpoints.map((bp) => {
          const abs = absoluteBendpoint(bp, { x: src.cx, y: src.cy }, { x: tgt.cx, y: tgt.cy });
          return new Point(abs.x, abs.y);
        });
        try {
          const geo = edge.getGeometry();
          if (geo) {
            const next = geo.clone() as Geometry;
            next.points = points;
            g.getDataModel().setGeometry(edge, next);
          } else {
            const ng = new Geometry();
            ng.relative = true;
            ng.points = points;
            g.getDataModel().setGeometry(edge, ng);
          }
        } catch (e) {
          console.warn('[DiagramCanvas] bendpoint apply failed', e);
        }
      }
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!graph) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const viewScale = graph.getView().getScale();
    const scale = Math.max(0.15, Math.min(4, viewScale * delta));
    graph.zoomTo(scale);
  }

  function resetZoom() {
    if (graph) fitGraph(graph);
  }

  function zoomIn() {
    graph?.zoomIn();
  }

  function zoomOut() {
    graph?.zoomOut();
  }
</script>

<div class="canvas-wrapper">
  <div class="zoom-toolbar">
    <button type="button" class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
    <button type="button" class="zoom-btn" onclick={resetZoom} title="Fit diagram">⊙</button>
    <button type="button" class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
  </div>

  {#if renderError}
    <div class="canvas-error-banner">{renderError}</div>
  {/if}

  <div
    bind:this={containerEl}
    class="graph-container"
    role="img"
    aria-label="ArchiMate diagram canvas"
    onwheel={handleWheel}
  ></div>
</div>

<style>
  .canvas-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #1a1f2e;
  }

  .graph-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    position: relative;
  }

  .graph-container:active {
    cursor: grabbing;
  }

  :global(.graph-container svg) {
    display: block;
  }

  .canvas-error-banner {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 56px;
    z-index: 101;
    padding: 8px 12px;
    background: rgba(248, 113, 113, 0.15);
    border: 1px solid rgba(248, 113, 113, 0.4);
    color: #fca5a5;
    font-size: 12px;
    border-radius: 6px;
  }

  .zoom-toolbar {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(22, 27, 37, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 4px;
    backdrop-filter: blur(8px);
  }

  .zoom-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #8892a4;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.1s,
      color 0.1s;
    font-family: system-ui;
  }

  .zoom-btn:hover {
    background: rgba(77, 142, 240, 0.2);
    color: #4d8ef0;
  }
</style>
