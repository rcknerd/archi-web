/** What is currently selected in the workbench (explorer or canvas). */
export type SelectionKind = 'element' | 'relationship' | 'diagram-node' | 'view' | 'none';

export interface Selection {
  kind: SelectionKind;
  /** Concept or diagram object id */
  id: string;
  /** For diagram nodes, the linked ArchiMate element id if any */
  elementId?: string;
  /** Diagram node id when selection originates from the canvas */
  diagramNodeId?: string;
  /** View id when a view is selected */
  viewId?: string;
}

export const EMPTY_SELECTION: Selection = { kind: 'none', id: '' };
