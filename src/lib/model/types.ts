export type ArchiLayer =
  | 'strategy'
  | 'business'
  | 'application'
  | 'technology'
  | 'physical'
  | 'motivation'
  | 'implementation'
  | 'other';

export interface ArchiElement {
  id: string;
  name: string;
  type: string; // e.g. BusinessActor, ApplicationComponent, Node
  layer: ArchiLayer;
  documentation?: string;
  properties?: Record<string, string>;
  /** Containing folder id when known */
  folderId?: string;
}

export interface ArchiRelationship {
  id: string;
  name?: string;
  type: string; // e.g. CompositionRelationship, ServingRelationship
  sourceId: string;
  targetId: string;
  documentation?: string;
  properties?: Record<string, string>;
  folderId?: string;
}

/** Archi-native relative bend-point (start* vs source, end* vs target). */
export interface ArchiBendpoint {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface DiagramConnection {
  id: string;
  relationshipId?: string;
  sourceId: string;
  targetId: string;
  type?: string;
  name?: string;
  bendpoints?: ArchiBendpoint[];
  lineColor?: string;
}

export interface DiagramNode {
  id: string;
  archimateElementId?: string;
  /** For DiagramModelReference nodes */
  modelRefId?: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  fontColor?: string;
  lineColor?: string;
  children?: DiagramNode[];
}

export interface DiagramView {
  id: string;
  name: string;
  documentation?: string;
  viewpoint?: string;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

export interface ArchiFolder {
  id: string;
  name: string;
  type?: string;
  parentId?: string;
}

export interface ArchiModel {
  id: string;
  name: string;
  documentation?: string;
  version?: string;
  elements: Map<string, ArchiElement>;
  relationships: Map<string, ArchiRelationship>;
  views: DiagramView[];
  folders?: ArchiFolder[];
}
