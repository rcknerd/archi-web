<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Graph, InternalEvent, Client, Point, Geometry } from '@maxgraph/core';
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

  // Re-render when view / model changes
  $effect(() => {
    const _view = view;
    const _model = model;
    if (graph && containerEl) {
      renderView(_view, _model);
    }
  });

  onMount(() => {
    InternalEvent.disableContextMenu(containerEl);
    Client.setTranslate(0, 0);

    graph = new Graph(containerEl);
    graph.setEnabled(false);
    graph.setPanning(true);
    // maxGraph API variants across versions
    try {
      (graph as any).setPanningEnabled?.(true);
      (graph as any).panningHandler?.setUseLeftButtonForPanning?.(true);
    } catch {
      /* ignore */
    }
    graph.centerZoom = true;
    graph.setTooltips(true);
    graph.setHtmlLabels(true);
    graph.setCellsFoldable(false);
    graph.setConnectable(false);

    const container = graph.container as HTMLElement;
    container.style.background = '#1a1f2e';
    container.style.cursor = 'grab';

    renderView(view, model);
  });

  onDestroy(() => {
    if (graph) {
      graph.destroy();
      graph = null;
    }
  });

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

  function buildLabel(name: string, type: string, kind: string): string {
    const safeName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (kind === 'junction') return '';
    const badge = type.replace(/([A-Z])/g, ' $1').trim();
    return `<div style="padding:3px 5px;text-align:center;line-height:1.25;">
      <div style="font-size:9px;color:#666;letter-spacing:0.2px;margin-bottom:1px;">${badge}</div>
      <div style="font-size:11px;font-weight:600;color:inherit;">${safeName}</div>
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
    const absBounds = collectAbsoluteBounds(v.nodes);

    g.batchUpdate(() => {
      clearGraph(g);
      const rootParent = g.getDefaultParent();
      const nodeMap = new Map<string, any>();

      const insertNode = (node: DiagramNode, parent: any) => {
        const type = resolveElementType(node, m);
        const fillColor = node.fillColor ?? ELEMENT_FILL[type] ?? ELEMENT_FILL[node.type] ?? '#ffffff';
        const fontColor = node.fontColor ?? '#111111';
        const strokeColor = node.lineColor ?? '#5c5c5c';
        const hasChildren = !!(node.children && node.children.length);
        const style = styleForElementType(type, {
          fillColor,
          fontColor,
          strokeColor,
          hasChildren,
        });

        // Junctions are small diamonds/circles in Archi
        let w = node.width || 120;
        let h = node.height || 55;
        if (type.includes('Junction')) {
          w = Math.min(w, 14);
          h = Math.min(h, 14);
        }

        const label = buildLabel(node.name || m.elements.get(node.archimateElementId ?? '')?.name || '', type, type.includes('Junction') ? 'junction' : '');

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

      // Edges
      for (const conn of v.connections) {
        insertConnection(g, conn, nodeMap, m, absBounds, rootParent);
      }

      // Fit after layout
      try {
        g.fit(24);
      } catch {
        /* some versions need view validate first */
        g.getView()?.revalidate?.();
        g.fit?.(24);
      }
    });
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
      strokeColor: conn.lineColor ?? '#555e7a',
      strokeWidth: 1.4,
      fontSize: 10,
      fontColor: '#8892a4',
      fontFamily: 'Inter, system-ui, sans-serif',
      // Prefer orthogonal when no bendpoints; straight with manual points when present
      edgeStyle: conn.bendpoints?.length ? 'entityRelationEdgeStyle' : 'orthogonalEdgeStyle',
      rounded: 0,
      jettySize: 'auto',
      orthogonalLoop: 1,
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
        const points = conn.bendpoints.map(
          (bp) => {
            const abs = absoluteBendpoint(bp, { x: src.cx, y: src.cy }, { x: tgt.cx, y: tgt.cy });
            return new Point(abs.x, abs.y);
          },
        );
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
      }
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!graph) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const view = graph.getView();
    const scale = Math.max(0.15, Math.min(4, view.getScale() * delta));
    graph.zoomTo(scale);
  }

  function resetZoom() {
    graph?.fit?.(20);
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
  }

  .graph-container:active {
    cursor: grabbing;
  }

  :global(.graph-container svg) {
    display: block;
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
