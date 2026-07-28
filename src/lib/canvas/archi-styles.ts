// ArchiMate shape/style helpers — colours match Archi desktop defaults
// (AbstractArchimateElementUIProvider) and relationship ends match Archi connection figures.

/** Archi desktop default fill colours (RGB from AbstractArchimateElementUIProvider). */
export const LAYER_FILL = {
  business: '#ffffb5', // 255,255,181
  application: '#b5ffff', // 181,255,255
  technology: '#c9e7b7', // 201,231,183
  physical: '#c9e7b7',
  motivation: '#ccccff', // 204,204,255
  strategy: '#f5deaa', // 245,222,170
  implementation: '#ffe0e0', // 255,224,224
  other: '#ffffff',
} as const;

/**
 * Map ArchiMate element type → fill colour (hex).
 * Matches Archi desktop default palette.
 */
export const ELEMENT_FILL: Record<string, string> = {
  // Strategy
  Resource: LAYER_FILL.strategy,
  Capability: LAYER_FILL.strategy,
  CourseOfAction: LAYER_FILL.strategy,
  ValueStream: LAYER_FILL.strategy,

  // Business
  BusinessActor: LAYER_FILL.business,
  BusinessRole: LAYER_FILL.business,
  BusinessCollaboration: LAYER_FILL.business,
  BusinessInterface: LAYER_FILL.business,
  BusinessProcess: LAYER_FILL.business,
  BusinessFunction: LAYER_FILL.business,
  BusinessInteraction: LAYER_FILL.business,
  BusinessEvent: LAYER_FILL.business,
  BusinessService: LAYER_FILL.business,
  BusinessObject: LAYER_FILL.business,
  Contract: LAYER_FILL.business,
  Representation: LAYER_FILL.business,
  Product: LAYER_FILL.business,

  // Application
  ApplicationComponent: LAYER_FILL.application,
  ApplicationCollaboration: LAYER_FILL.application,
  ApplicationInterface: LAYER_FILL.application,
  ApplicationFunction: LAYER_FILL.application,
  ApplicationInteraction: LAYER_FILL.application,
  ApplicationProcess: LAYER_FILL.application,
  ApplicationEvent: LAYER_FILL.application,
  ApplicationService: LAYER_FILL.application,
  DataObject: LAYER_FILL.application,

  // Technology
  Node: LAYER_FILL.technology,
  Device: LAYER_FILL.technology,
  SystemSoftware: LAYER_FILL.technology,
  TechnologyCollaboration: LAYER_FILL.technology,
  TechnologyInterface: LAYER_FILL.technology,
  Path: LAYER_FILL.technology,
  CommunicationNetwork: LAYER_FILL.technology,
  TechnologyFunction: LAYER_FILL.technology,
  TechnologyProcess: LAYER_FILL.technology,
  TechnologyInteraction: LAYER_FILL.technology,
  TechnologyEvent: LAYER_FILL.technology,
  TechnologyService: LAYER_FILL.technology,
  Artifact: LAYER_FILL.technology,

  // Physical
  Equipment: LAYER_FILL.technology,
  Facility: LAYER_FILL.technology,
  DistributionNetwork: LAYER_FILL.technology,
  Material: LAYER_FILL.technology,

  // Motivation
  Stakeholder: LAYER_FILL.motivation,
  Driver: LAYER_FILL.motivation,
  Assessment: LAYER_FILL.motivation,
  Goal: LAYER_FILL.motivation,
  Outcome: LAYER_FILL.motivation,
  Principle: LAYER_FILL.motivation,
  Requirement: LAYER_FILL.motivation,
  Constraint: LAYER_FILL.motivation,
  Meaning: LAYER_FILL.motivation,
  Value: LAYER_FILL.motivation,

  // Implementation & Migration
  WorkPackage: LAYER_FILL.implementation,
  Deliverable: LAYER_FILL.implementation,
  ImplementationEvent: LAYER_FILL.implementation,
  Plateau: '#e0ffe0',
  Gap: '#e0ffe0',

  Junction: '#000000',
  AndJunction: '#000000',
  OrJunction: '#ffffff',
  Grouping: '#ffffff',
  DiagramModelNote: '#ffffcc',
  Note: '#ffffcc',
  DiagramModelGroup: '#f5f5f5',
  Group: '#f5f5f5',
  DiagramModelReference: '#e8f0ff',
  DiagramObject: '#ffffff',
  Location: '#edcfe2',
};

/** Human-readable type label (Archi-style). */
export function formatTypeName(type: string): string {
  const t = type.replace(/^I/, '').replace(/^archimate:/, '').replace(/Relationship$/, '');
  return t.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export type ShapeKind =
  | 'rect'
  | 'rounded'
  | 'ellipse'
  | 'rhombus'
  | 'hexagon'
  | 'cylinder'
  | 'actor'
  | 'note'
  | 'grouping'
  | 'junction'
  | 'service'
  | 'component'
  | 'object';

/** ArchiMate type → coarse maxGraph shape family (aligned with Archi figure categories). */
export function shapeKindForType(type: string): ShapeKind {
  const t = type.replace(/^I/, '').replace(/^archimate:/, '');

  if (t === 'AndJunction' || t === 'OrJunction' || t === 'Junction') return 'junction';
  if (t === 'Grouping' || t === 'Group' || t === 'DiagramModelGroup') return 'grouping';
  if (t.includes('Note') || t === 'DiagramModelNote') return 'note';
  if (t.endsWith('Event') || t === 'ImplementationEvent') return 'ellipse';
  if (t.endsWith('Service')) return 'service';
  if (t.includes('Actor') || t === 'Stakeholder') return 'actor';
  if (t.includes('Component')) return 'component';
  if (
    t === 'Node' ||
    t === 'Device' ||
    t === 'SystemSoftware' ||
    t === 'Equipment' ||
    t === 'Facility'
  ) {
    return 'cylinder';
  }
  if (t === 'Path' || t === 'CommunicationNetwork' || t === 'DistributionNetwork') return 'hexagon';
  // Passive structure objects → square box
  if (
    t.endsWith('Object') ||
    t === 'Contract' ||
    t === 'Representation' ||
    t === 'Artifact' ||
    t === 'Material' ||
    t === 'Product' ||
    t === 'Deliverable' ||
    t === 'DataObject' ||
    t === 'Meaning' ||
    t === 'Value'
  ) {
    return 'object';
  }
  // Behaviour → rounded
  if (
    t.endsWith('Process') ||
    t.endsWith('Function') ||
    t.endsWith('Interaction') ||
    t === 'Capability' ||
    t === 'ValueStream' ||
    t === 'CourseOfAction' ||
    t === 'WorkPackage' ||
    t === 'Plateau' ||
    t === 'BusinessRole' ||
    t.includes('Collaboration') ||
    t.includes('Interface')
  ) {
    return 'rounded';
  }
  if (t === 'Goal' || t === 'Outcome' || t === 'Principle' || t === 'Driver' || t === 'Assessment') {
    return 'rounded';
  }
  if (t === 'Requirement' || t === 'Constraint') return 'rhombus';
  return 'rect';
}

/** Corner icon glyph approximating Archi iconography (top-right badge). */
export function iconGlyphForType(type: string): string {
  const t = type.replace(/^I/, '').replace(/^archimate:/, '');
  if (t.includes('Actor') || t === 'Stakeholder') return '👤';
  if (t.includes('Role')) return '🎭';
  if (t.includes('Component')) return '⊞';
  if (t.endsWith('Service')) return '⬡';
  if (t.endsWith('Process')) return '➜';
  if (t.endsWith('Function')) return '⧉';
  if (t.endsWith('Event')) return '⚡';
  if (t.endsWith('Object') || t === 'DataObject' || t === 'Artifact' || t === 'Contract') return '▭';
  if (t === 'Node' || t === 'Device' || t === 'Equipment' || t === 'SystemSoftware') return '▣';
  if (t === 'Goal') return '◎';
  if (t === 'Requirement' || t === 'Constraint') return '◇';
  if (t === 'Capability' || t === 'Resource') return '◆';
  if (t === 'Grouping' || t === 'Group') return '⬚';
  if (t.includes('Interface')) return '○';
  if (t.includes('Collaboration')) return '⚭';
  if (t === 'WorkPackage') return '▸';
  if (t === 'Material' || t === 'Product') return '▭';
  return '■';
}

/** Build maxGraph CellStyle fields for an ArchiMate type */
export function styleForElementType(
  type: string,
  opts: { fillColor: string; fontColor: string; strokeColor: string; hasChildren?: boolean },
): Record<string, unknown> {
  const kind = shapeKindForType(type);
  const base: Record<string, unknown> = {
    fillColor: opts.fillColor,
    fontColor: opts.fontColor,
    strokeColor: opts.strokeColor,
    fontSize: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontStyle: 0,
    verticalAlign: 'middle',
    align: 'center',
    shadow: false,
    strokeWidth: 1.5,
    labelBackgroundColor: 'none',
    whiteSpace: 'wrap',
    html: 1,
    overflow: 'hidden',
    // Spacing so text doesn't hug the border
    spacing: 4,
    spacingTop: 2,
    spacingBottom: 2,
    spacingLeft: 6,
    spacingRight: 18, // room for corner icon
  };

  switch (kind) {
    case 'ellipse':
      return { ...base, shape: 'ellipse', verticalAlign: 'middle', spacingRight: 6 };
    case 'rhombus':
      return { ...base, shape: 'rhombus', spacingRight: 6 };
    case 'hexagon':
      return { ...base, shape: 'hexagon', spacingRight: 6 };
    case 'cylinder':
      return { ...base, shape: 'cylinder', verticalAlign: 'middle', spacingRight: 6 };
    case 'actor':
      return { ...base, shape: 'actor', verticalAlign: 'bottom', spacingRight: 6 };
    case 'rounded':
    case 'service':
      return {
        ...base,
        rounded: true,
        arcSize: 28,
        verticalAlign: opts.hasChildren ? 'top' : 'middle',
      };
    case 'component':
      // Archi Application Component: rectangle with left "component" bars (approximated)
      return {
        ...base,
        shape: 'rectangle',
        strokeWidth: 1.5,
        verticalAlign: opts.hasChildren ? 'top' : 'middle',
      };
    case 'object':
      return {
        ...base,
        shape: 'rectangle',
        rounded: false,
        verticalAlign: opts.hasChildren ? 'top' : 'middle',
      };
    case 'note':
      return {
        ...base,
        shape: 'label',
        fillColor: opts.fillColor || '#ffffcc',
        verticalAlign: 'top',
        align: 'left',
        spacingRight: 6,
      };
    case 'grouping':
      return {
        ...base,
        dashed: true,
        dashPattern: '6 4',
        fillColor: 'rgba(255,255,255,0.03)',
        strokeColor: '#7a8499',
        strokeWidth: 1.2,
        verticalAlign: 'top',
        align: 'left',
        fontColor: '#8892a4',
        fontSize: 11,
        spacingRight: 6,
      };
    case 'junction':
      return {
        ...base,
        shape: 'ellipse',
        fillColor: type.includes('Or') ? '#ffffff' : '#111111',
        strokeColor: '#111111',
        strokeWidth: 1.5,
        spacing: 0,
        spacingRight: 0,
      };
    default:
      return {
        ...base,
        rounded: false,
        verticalAlign: opts.hasChildren ? 'top' : 'middle',
      };
  }
}

/**
 * Build HTML label with Archi-style corner icon + name.
 * Type badge is small so the element name stays primary (Archi UX).
 */
export function buildElementLabel(name: string, type: string, isJunction = false): string {
  if (isJunction) return '';
  const safeName = (name || 'Untitled').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const glyph = iconGlyphForType(type);
  const typeLabel = formatTypeName(type);
  return (
    `<div style="position:relative;width:100%;height:100%;box-sizing:border-box;padding:4px 14px 4px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">` +
    `<div style="position:absolute;top:2px;right:3px;font-size:10px;line-height:1;opacity:0.85;" title="${typeLabel}">${glyph}</div>` +
    `<div style="font-size:12px;font-weight:600;color:#111;text-align:center;line-height:1.25;word-break:break-word;max-width:100%;">${safeName}</div>` +
    `</div>`
  );
}

/**
 * ArchiMate relationship styles.
 * Note: Composition/Aggregation diamond is at the *source* (whole) end in Archi,
 * matching CompositionConnectionFigure / AggregationConnectionFigure.
 */
export const RELATIONSHIP_STYLE: Record<string, Record<string, unknown>> = {
  CompositionRelationship: {
    startArrow: 'diamond',
    startFill: true,
    startSize: 12,
    endArrow: 'none',
  },
  AggregationRelationship: {
    startArrow: 'diamond',
    startFill: false,
    startSize: 12,
    endArrow: 'none',
  },
  AssignmentRelationship: {
    startArrow: 'oval',
    startFill: true,
    startSize: 8,
    endArrow: 'block',
    endFill: true,
    endSize: 10,
  },
  RealizationRelationship: {
    endArrow: 'block',
    endFill: false,
    endSize: 12,
    dashed: true,
    dashPattern: '6 4',
  },
  ServingRelationship: {
    endArrow: 'open',
    endFill: false,
    endSize: 12,
  },
  AccessRelationship: {
    endArrow: 'open',
    endFill: false,
    endSize: 10,
    dashed: true,
    dashPattern: '4 3',
  },
  InfluenceRelationship: {
    endArrow: 'open',
    endFill: false,
    endSize: 10,
    dashed: true,
    dashPattern: '2 3',
  },
  TriggeringRelationship: {
    endArrow: 'block',
    endFill: true,
    endSize: 12,
  },
  FlowRelationship: {
    endArrow: 'open',
    endFill: false,
    endSize: 10,
    dashed: true,
    dashPattern: '8 4',
  },
  AssociationRelationship: {
    endArrow: 'none',
    startArrow: 'none',
  },
  SpecializationRelationship: {
    endArrow: 'block',
    endFill: false,
    endSize: 14,
  },
};

export const DEFAULT_EDGE_STYLE: Record<string, unknown> = {
  endArrow: 'open',
  endFill: false,
  endSize: 10,
};

/** Shared base for all edges — Manhattan routing avoids crossing nodes better. */
export function baseEdgeStyle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    edgeStyle: 'manhattanEdgeStyle',
    rounded: true,
    orthogonalLoop: true,
    jettySize: 'auto',
    strokeWidth: 1.4,
    strokeColor: '#4a5568',
    fontSize: 10,
    fontColor: '#6b7280',
    fontFamily: 'Inter, system-ui, sans-serif',
    labelBackgroundColor: 'rgba(26,31,46,0.85)',
    ...overrides,
  };
}

/** Convert Archi relative bendpoint → absolute canvas point */
export function absoluteBendpoint(
  bp: { startX: number; startY: number; endX: number; endY: number },
  sourceCenter: { x: number; y: number },
  targetCenter: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (sourceCenter.x + bp.startX + targetCenter.x + bp.endX) / 2,
    y: (sourceCenter.y + bp.startY + targetCenter.y + bp.endY) / 2,
  };
}
