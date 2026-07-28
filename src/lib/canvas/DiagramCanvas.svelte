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
  /** Two-click magic connector: first vertex id chosen as source */
  let connectSourceId = $state('');
  let connectStatus = $state('');

  $effect(() => {
    if (!graph) return;
    applyExternalSelection(selectedId);
  });

  $effect(() => {
    if (!graph) return;
    applyConnectMode(connectMode);
    if (!connectMode) {
      connectSourceId = '';
      connectStatus = '';
      clearConnectHighlight();
    } else {
      connectStatus = 'Click the SOURCE element';
    }
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
      // ConnectionHandler drag is unreliable with SelectionHandler; we use two-click mode.
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

      const container = graph.container as HTMLElement;
      container.style.background = '#1a1f2e';
      container.style.width = '100%';
      container.style.height = '100%';

      // Selection (normal mode) + two-click magic connector
      graph.addListener(InternalEvent.CLICK, (_sender: unknown, evt: any) => {
        if (!graph) return;
        let cell = evt?.getProperty?.('cell') as any;
        // Fallback hit-test if click event has no cell (HTML labels / overlay)
        if (!cell) {
          try {
            const nativeEvt = evt?.getProperty?.('event');
            if (nativeEvt) {
              const pt = (graph as any).getPointForEvent?.(nativeEvt, false);
              if (pt) cell = findVertexAt(pt.x, pt.y);
            }
          } catch {
            /* ignore */
          }
        }

        if (connectMode) {
          handleConnectClick(cell);
          try {
            evt?.consume?.();
          } catch {
            /* ignore */
          }
          return;
        }

        // Normal selection fallback if selection model doesn't fire
        if (!cell) {
          if (onselect) onselect({ kind: 'none', id: '' });
        }
      });

      graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
        if (suppressSelect || !graph || !onselect) return;
        if (connectMode) return; // selection handled by connect click path
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
    // Keep ConnectionHandler OFF — two-click path is the reliable UX
    graph.setConnectable(false);
    graph.isCellMovable = (cell: any) => !enabled && !!cell?.isVertex?.();
    // Prevent accidental moves while connecting
    try {
      (graph as any).setCellsMovable?.(!enabled);
    } catch {
      /* optional */
    }
    const container = graph.container as HTMLElement;
    if (container) {
      container.style.cursor = enabled ? 'crosshair' : 'default';
    }
  }

  function clearConnectHighlight() {
    if (!graph) return;
    for (const cell of nodeMap.values()) {
      try {
        const style = { ...(cell.getStyle?.() || graph.getCellStyle?.(cell) || {}) };
        delete (style as any).strokeColor;
        // restore default stroke via model style set only if we marked it
        if ((cell as any)._connectHighlight) {
          graph.setCellStyles?.('strokeColor', (cell as any)._origStroke || '#3d4659', [cell]);
          graph.setCellStyles?.('strokeWidth', 1.5, [cell]);
          (cell as any)._connectHighlight = false;
        }
      } catch {
        /* ignore */
      }
    }
  }

  function highlightConnectSource(nodeId: string) {
    if (!graph) return;
    clearConnectHighlight();
    const cell = nodeMap.get(nodeId);
    if (!cell) return;
    try {
      const st = graph.getCellStyle?.(cell) || {};
      (cell as any)._origStroke = st.strokeColor || '#3d4659';
      (cell as any)._connectHighlight = true;
      graph.setCellStyles?.('strokeColor', '#4d8ef0', [cell]);
      graph.setCellStyles?.('strokeWidth', 3, [cell]);
      suppressSelect = true;
      graph.setSelectionCell(cell);
      suppressSelect = false;
    } catch {
      /* ignore */
    }
  }

  function handleConnectClick(cell: any) {
    if (!onconnectrequest) {
      connectStatus = 'No connect handler wired';
      return;
    }
    if (!cell || !cell.isVertex?.()) {
      // Click empty — reset source
      if (connectSourceId) {
        connectSourceId = '';
        clearConnectHighlight();
        connectStatus = 'Click the SOURCE element';
      }
      return;
    }
    const nodeId = cell.id as string;
    if (!connectSourceId) {
      connectSourceId = nodeId;
      highlightConnectSource(nodeId);
      connectStatus = 'Now click the TARGET element';
      return;
    }
    if (connectSourceId === nodeId) {
      connectStatus = 'Pick a different target (or click empty to cancel source)';
      return;
    }
    // Complete connection request
    const sourceId = connectSourceId;
    const targetId = nodeId;
    connectSourceId = '';
    clearConnectHighlight();
    connectStatus = 'Choose relationship type…';
    onconnectrequest({
      sourceDiagramNodeId: sourceId,
      targetDiagramNodeId: targetId,
      sourceElementId: elementRefByNode.get(sourceId),
      targetElementId: elementRefByNode.get(targetId),
    });
    // Ready for next pair
    connectStatus = 'Click the SOURCE element (or exit connector)';
  }

  /** Hit-test vertex at graph coordinates with small search radius. */
  function findVertexAt(gx: number, gy: number): any | null {
    if (!graph) return null;
    const tryAt = (x: number, y: number) => {
      try {
        const c = graph!.getCellAt(x, y, null, true, false);
        if (c?.isVertex?.()) return c;
      } catch {
        /* ignore */
      }
      return null;
    };
    let cell = tryAt(gx, gy);
    if (cell) return cell;
    for (const d of [4, 8, 12, 16, 24]) {
      for (const [dx, dy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
        [d, d],
        [-d, -d],
        [d, -d],
        [-d, d],
      ]) {
        cell = tryAt(gx + dx, gy + dy);
        if (cell) return cell;
      }
    }
    // Absolute bounds fallback (handles nested/transform quirks)
    const abs = collectAbsoluteBounds(view.nodes);
    let best: { id: string; area: number } | null = null;
    for (const [id, b] of abs) {
      if (gx >= b.x && gx <= b.x + b.width && gy >= b.y && gy <= b.y + b.height) {
        const area = b.width * b.height;
        if (!best || area < best.area) best = { id, area }; // smallest containing = topmost nested
      }
    }
    return best ? nodeMap.get(best.id) ?? null : null;
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
      // false = don't apply grid offset (more accurate hit-test)
      if (typeof (graph as any).getPointForEvent === 'function') {
        const pt = (graph as any).getPointForEvent(e, false);
        if (pt) return { x: pt.x, y: pt.y };
      }
    } catch {
      /* fall through */
    }
    const rect = containerEl.getBoundingClientRect();
    const v = graph.getView();
    const scale = v.getScale();
    const tr = v.getTranslate();
    const panDx = (graph as any).getPanDx?.() || 0;
    const panDy = (graph as any).getPanDy?.() || 0;
    const x = (e.clientX - rect.left - panDx) / scale - tr.x;
    const y = (e.clientY - rect.top - panDy) / scale - tr.y;
    return { x, y };
  }

  function onDragOver(e: DragEvent) {
    // Accept our custom type OR plain text fallback
    const types = e.dataTransfer ? [...e.dataTransfer.types] : [];
    if (
      !types.includes('application/x-archi-element') &&
      !types.includes('text/plain') &&
      !types.includes('Text')
    ) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(e: DragEvent) {
    if (!graph || !ondropelement) return;
    let elementId =
      e.dataTransfer?.getData('application/x-archi-element') ||
      e.dataTransfer?.getData('text/plain') ||
      '';
    elementId = elementId.trim();
    if (!elementId) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = clientToGraph(e);
    let targetDiagramNodeId: string | undefined;
    let targetElementId: string | undefined;
    const cell = findVertexAt(pt.x, pt.y);
    if (cell?.isVertex?.()) {
      targetDiagramNodeId = cell.id;
      targetElementId = elementRefByNode.get(cell.id);
    }
    console.debug('[DiagramCanvas] drop', {
      elementId,
      pt,
      targetDiagramNodeId,
      targetElementId,
    });
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
      {connectStatus || 'Magic connector: click SOURCE, then TARGET · Esc to exit'}
    {:else}
      Click select · Drag move · Drop from explorer onto shape to nest · Right-drag pan
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
