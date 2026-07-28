<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Graph, InternalEvent, Point, Geometry } from '@maxgraph/core';
  import type { FitPlugin } from '@maxgraph/core';
  import '@maxgraph/core/css/common.css';
  import type { ArchiModel, DiagramView, DiagramNode, DiagramConnection } from '../model/types';
  import type { Selection } from '../model/selection';
  import {
    ELEMENT_FILL,
    RELATIONSHIP_STYLE,
    DEFAULT_EDGE_STYLE,
    styleForElementType,
    absoluteBendpoint,
    buildElementLabel,
    baseEdgeStyle,
  } from './archi-styles';

  export type DropPayload = {
    elementId: string;
    x: number;
    y: number;
    /** Diagram node under the drop point, if any (for nesting). */
    targetDiagramNodeId?: string;
    targetElementId?: string;
  };

  export type ConnectRequest = {
    sourceDiagramNodeId: string;
    targetDiagramNodeId: string;
    sourceElementId?: string;
    targetElementId?: string;
  };

  interface Props {
    view: DiagramView;
    model: ArchiModel;
    selectedId?: string;
    /** Magic connector mode — drag between shapes to create ArchiMate relations. */
    connectMode?: boolean;
    onselect?: (sel: Selection) => void;
    onmove?: (payload: { diagramNodeId: string; x: number; y: number }) => void;
    ondropelement?: (payload: DropPayload) => void;
    onconnectrequest?: (payload: ConnectRequest) => void;
  }

  let {
    view,
    model,
    selectedId = '',
    connectMode = false,
    onselect,
    onmove,
    ondropelement,
    onconnectrequest,
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let graph: Graph | null = null;
  let renderError = $state('');
  let resizeObserver: ResizeObserver | null = null;
  let nodeMap = new Map<string, any>();
  let elementRefByNode = new Map<string, string>();
  let lastRenderedViewId = '';
  let suppressSelect = false;
  let fitOnce = false;

  $effect(() => {
    if (!graph) return;
    applyExternalSelection(selectedId);
  });

  $effect(() => {
    if (!graph) return;
    applyConnectMode(connectMode);
  });

  $effect(() => {
    const vid = view.id;
    const _model = model;
    if (!graph || !containerEl) return;
    if (vid !== lastRenderedViewId) {
      lastRenderedViewId = vid;
      fitOnce = false;
      requestAnimationFrame(() => renderView(view, _model));
    }
  });

  onMount(() => {
    try {
      InternalEvent.disableContextMenu(containerEl);
      graph = new Graph(containerEl);

      graph.setEnabled(true);
      graph.setConnectable(false);
      graph.setCellsEditable(false);
      graph.setCellsResizable(false);
      graph.setAllowDanglingEdges(false);
      graph.setDisconnectOnMove(false);
      graph.setDropEnabled(false);
      graph.setSplitEnabled(false);
      graph.setHtmlLabels(true);
      graph.setTooltips(true);
      graph.centerZoom = true;

      graph.setPanning(true);
      try {
        const ph = graph.getPlugin('PanningHandler') as any;
        ph?.setUseLeftButtonForPanning?.(false);
        if (ph) ph.usePopupTrigger = true;
      } catch {
        /* optional */
      }

      graph.isCellMovable = (cell: any) => !connectMode && !!cell?.isVertex?.();
      graph.isCellSelectable = () => true;

      // Only allow connecting diagram vertices that map to ArchiMate elements
      graph.isValidConnection = (source: any, target: any) => {
        if (!source?.isVertex?.() || !target?.isVertex?.()) return false;
        if (source === target) return false;
        // Allow even without element refs (notes) but magic connector prefers elements
        return true;
      };

      const container = graph.container as HTMLElement;
      container.style.background = '#1a1f2e';
      container.style.width = '100%';
      container.style.height = '100%';

      graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
        if (suppressSelect || !graph || !onselect) return;
        const cells = graph.getSelectionCells();
        if (!cells.length) {
          onselect({ kind: 'none', id: '' });
          return;
        }
        const cell = cells[0];
        const nodeId = cell.id as string;
        if (cell.isEdge?.()) {
          const relId = (cell as any)._relationshipId as string | undefined;
          onselect({ kind: 'relationship', id: relId || nodeId, viewId: view.id });
          return;
        }
        const elementId = elementRefByNode.get(nodeId);
        onselect({
          kind: 'diagram-node',
          id: elementId || nodeId,
          elementId: elementId || undefined,
          diagramNodeId: nodeId,
          viewId: view.id,
        });
      });

      graph.addListener(InternalEvent.CELLS_MOVED, (_sender: unknown, evt: any) => {
        if (!onmove || !graph || connectMode) return;
        const cells: any[] = evt?.getProperty?.('cells') || [];
        for (const cell of cells) {
          if (!cell?.isVertex?.()) continue;
          const geo = cell.getGeometry?.();
          if (!geo) continue;
          onmove({ diagramNodeId: cell.id, x: geo.x, y: geo.y });
        }
      });

      // Magic connector: intercept completed connections
      try {
        const ch = graph.getPlugin('ConnectionHandler') as any;
        ch?.addListener?.(InternalEvent.CONNECT, (_s: unknown, evt: any) => {
          if (!graph || !onconnectrequest) return;
          const edge = evt?.getProperty?.('cell');
          if (!edge) return;
          const source = edge.getTerminal?.(true) || edge.source;
          const target = edge.getTerminal?.(false) || edge.target;
          // Remove provisional edge — App creates the proper ArchiMate relation
          try {
            graph.removeCells([edge]);
          } catch {
            /* ignore */
          }
          if (!source || !target) return;
          onconnectrequest({
            sourceDiagramNodeId: source.id,
            targetDiagramNodeId: target.id,
            sourceElementId: elementRefByNode.get(source.id),
            targetElementId: elementRefByNode.get(target.id),
          });
        });
      } catch (e) {
        console.warn('[DiagramCanvas] ConnectionHandler hook failed', e);
      }

      resizeObserver = new ResizeObserver(() => {
        if (!graph || !containerEl) return;
        if (containerEl.clientWidth < 10 || containerEl.clientHeight < 10) return;
        graph.sizeDidChange();
        if (!fitOnce) {
          fitGraph(graph);
          fitOnce = true;
        }
      });
      resizeObserver.observe(containerEl);

      lastRenderedViewId = view.id;
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

  function applyConnectMode(enabled: boolean) {
    if (!graph) return;
    graph.setConnectable(enabled);
    graph.isCellMovable = (cell: any) => !enabled && !!cell?.isVertex?.();
    const container = graph.container as HTMLElement;
    if (container) {
      container.style.cursor = enabled ? 'crosshair' : 'default';
    }
  }

  function applyExternalSelection(id: string) {
    if (!graph) return;
    suppressSelect = true;
    try {
      if (!id) {
        graph.clearSelection();
        return;
      }
      let cell = nodeMap.get(id);
      if (!cell) {
        for (const [nodeId, elId] of elementRefByNode) {
          if (elId === id) {
            cell = nodeMap.get(nodeId);
            break;
          }
        }
      }
      if (cell) {
        graph.setSelectionCell(cell);
        graph.scrollCellToVisible?.(cell);
      }
    } finally {
      suppressSelect = false;
    }
  }

  function fitGraph(g: Graph) {
    try {
      const fitPlugin = g.getPlugin('fit') as FitPlugin | undefined;
      if (fitPlugin?.fit) {
        fitPlugin.fit({ border: 28 });
        (g as any).center?.(true, true);
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

  function collectAbsoluteBounds(
    nodes: DiagramNode[],
    parentAbs = { x: 0, y: 0 },
    out = new Map<
      string,
      { x: number; y: number; width: number; height: number; cx: number; cy: number }
    >(),
  ) {
    for (const node of nodes) {
      const x = parentAbs.x + node.x;
      const y = parentAbs.y + node.y;
      const width = node.width || 120;
      const height = node.height || 55;
      out.set(node.id, { x, y, width, height, cx: x + width / 2, cy: y + height / 2 });
      if (node.children?.length) collectAbsoluteBounds(node.children, { x, y }, out);
    }
    return out;
  }

  function renderView(v: DiagramView, m: ArchiModel) {
    if (!graph) return;
    const g = graph;
    renderError = '';
    nodeMap = new Map();
    elementRefByNode = new Map();

    try {
      const absBounds = collectAbsoluteBounds(v.nodes);

      g.batchUpdate(() => {
        clearGraph(g);
        const rootParent = g.getDefaultParent();

        const insertNode = (node: DiagramNode, parent: any) => {
          const type = resolveElementType(node, m);
          const isJunction = type.includes('Junction');
          const fillColor =
            node.fillColor ?? ELEMENT_FILL[type] ?? ELEMENT_FILL[node.type] ?? '#ffffb5';
          const fontColor = node.fontColor ?? '#111111';
          const strokeColor = node.lineColor ?? '#3d4659';
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

          const label = buildElementLabel(
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
          if (node.archimateElementId) elementRefByNode.set(node.id, node.archimateElementId);

          for (const child of node.children || []) insertNode(child, cell);
        };

        for (const node of v.nodes) insertNode(node, rootParent);
        for (const conn of v.connections) insertConnection(g, conn, m, absBounds, rootParent);
      });

      g.view?.validate?.();
      g.sizeDidChange();
      fitGraph(g);
      fitOnce = true;
      applyConnectMode(connectMode);
      if (selectedId) applyExternalSelection(selectedId);
    } catch (err: any) {
      console.error('[DiagramCanvas] render failed', err);
      renderError = `Render failed: ${err?.message || err}`;
    }
  }

  function insertConnection(
    g: Graph,
    conn: DiagramConnection,
    m: ArchiModel,
    absBounds: Map<
      string,
      { cx: number; cy: number; x: number; y: number; width: number; height: number }
    >,
    parent: any,
  ) {
    const sourceCell = nodeMap.get(conn.sourceId);
    const targetCell = nodeMap.get(conn.targetId);
    if (!sourceCell || !targetCell) return;

    const rel = conn.relationshipId ? m.relationships.get(conn.relationshipId) : undefined;
    const relType = cleanType(rel?.type ?? conn.type ?? 'AssociationRelationship');
    const relStyle = RELATIONSHIP_STYLE[relType] ?? DEFAULT_EDGE_STYLE;
    const hasBendpoints = !!(conn.bendpoints && conn.bendpoints.length);
    const edgeStyle = baseEdgeStyle({
      ...relStyle,
      strokeColor: conn.lineColor ?? '#4a5568',
      edgeStyle: hasBendpoints ? 'orthogonalEdgeStyle' : 'manhattanEdgeStyle',
    });

    const edge = g.insertEdge({
      parent,
      id: conn.id,
      source: sourceCell,
      target: targetCell,
      value: '',
      style: edgeStyle as any,
    });
    (edge as any)._relationshipId = conn.relationshipId || conn.id;

    if (hasBendpoints) {
      const src = absBounds.get(conn.sourceId);
      const tgt = absBounds.get(conn.targetId);
      if (src && tgt) {
        const points = conn.bendpoints!.map((bp) => {
          const abs = absoluteBendpoint(bp, { x: src.cx, y: src.cy }, { x: tgt.cx, y: tgt.cy });
          return new Point(abs.x, abs.y);
        });
        try {
          const geo = edge.getGeometry();
          if (geo) {
            const next = geo.clone() as Geometry;
            next.points = points;
            g.getDataModel().setGeometry(edge, next);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!graph) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const scale = Math.max(0.12, Math.min(4, graph.getView().getScale() * delta));
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

  function clientToGraph(e: DragEvent | MouseEvent): { x: number; y: number } {
    if (!graph || !containerEl) return { x: 0, y: 0 };
    try {
      if (typeof (graph as any).getPointForEvent === 'function') {
        const pt = (graph as any).getPointForEvent(e);
        if (pt) return { x: pt.x, y: pt.y };
      }
    } catch {
      /* fall through */
    }
    const rect = containerEl.getBoundingClientRect();
    const view = graph.getView();
    const scale = view.getScale();
    const tr = view.getTranslate();
    const x = (e.clientX - rect.left) / scale - tr.x;
    const y = (e.clientY - rect.top) / scale - tr.y;
    return { x, y };
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('application/x-archi-element')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(e: DragEvent) {
    if (!graph || !ondropelement) return;
    const elementId = e.dataTransfer?.getData('application/x-archi-element');
    if (!elementId) return;
    e.preventDefault();
    const pt = clientToGraph(e);
    let targetDiagramNodeId: string | undefined;
    let targetElementId: string | undefined;
    try {
      const cell = graph.getCellAt?.(pt.x, pt.y);
      if (cell?.isVertex?.()) {
        targetDiagramNodeId = cell.id;
        targetElementId = elementRefByNode.get(cell.id);
      }
    } catch {
      /* ignore */
    }
    ondropelement({
      elementId,
      x: pt.x - 60,
      y: pt.y - 28,
      targetDiagramNodeId,
      targetElementId,
    });
  }
</script>

<div class="canvas-wrapper" class:connect-mode={connectMode}>
  <div class="zoom-toolbar">
    <button type="button" class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
    <button type="button" class="zoom-btn" onclick={resetZoom} title="Fit diagram">⊙</button>
    <button type="button" class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
  </div>
  <div class="canvas-hint">
    {#if connectMode}
      Magic connector: drag from source shape to target · Esc / toolbar to exit
    {:else}
      Click select · Drag move · Drop from explorer · Right-drag pan · Wheel zoom
    {/if}
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
    ondragover={onDragOver}
    ondrop={onDrop}
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
  .canvas-wrapper.connect-mode {
    outline: 2px solid rgba(77, 142, 240, 0.45);
    outline-offset: -2px;
  }
  .graph-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
  }
  :global(.graph-container svg) {
    display: block;
  }
  .canvas-hint {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 90;
    font-size: 10px;
    color: #5a6478;
    background: rgba(15, 17, 23, 0.75);
    padding: 3px 10px;
    border-radius: 12px;
    pointer-events: none;
    white-space: nowrap;
  }
  .connect-mode .canvas-hint {
    color: #93c5fd;
    border: 1px solid rgba(77, 142, 240, 0.35);
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
    font-family: system-ui;
  }
  .zoom-btn:hover {
    background: rgba(77, 142, 240, 0.2);
    color: #4d8ef0;
  }
</style>
