// ArchiMate shape and style constants for maxGraph rendering

/**
 * Map ArchiMate element type → fill colour (hex).
 * Matches the Archi desktop colour palette (defaults).
 */
export const ELEMENT_FILL: Record<string, string> = {
  // Strategy
  Resource: '#f5deaa',
  Capability: '#f5deaa',
  CourseOfAction: '#f5deaa',
  ValueStream: '#f5deaa',

  // Business layer (yellow)
  BusinessActor: '#ffffb5',
  BusinessRole: '#ffffb5',
  BusinessCollaboration: '#ffffb5',
  BusinessInterface: '#ffffb5',
  BusinessProcess: '#ffffb5',
  BusinessFunction: '#ffffb5',
  BusinessInteraction: '#ffffb5',
  BusinessEvent: '#ffffb5',
  BusinessService: '#ffffb5',
  BusinessObject: '#ffffb5',
  Contract: '#ffffb5',
  Representation: '#ffffb5',
  Product: '#ffffb5',

  // Application layer (light blue)
  ApplicationComponent: '#b5ffff',
  ApplicationCollaboration: '#b5ffff',
  ApplicationInterface: '#b5ffff',
  ApplicationFunction: '#b5ffff',
  ApplicationInteraction: '#b5ffff',
  ApplicationProcess: '#b5ffff',
  ApplicationEvent: '#b5ffff',
  ApplicationService: '#b5ffff',
  DataObject: '#b5ffff',

  // Technology layer (light green)
  Node: '#c9e7b7',
  Device: '#c9e7b7',
  SystemSoftware: '#c9e7b7',
  TechnologyCollaboration: '#c9e7b7',
  TechnologyInterface: '#c9e7b7',
  Path: '#c9e7b7',
  CommunicationNetwork: '#c9e7b7',
  TechnologyFunction: '#c9e7b7',
  TechnologyProcess: '#c9e7b7',
  TechnologyInteraction: '#c9e7b7',
  TechnologyEvent: '#c9e7b7',
  TechnologyService: '#c9e7b7',
  Artifact: '#c9e7b7',

  // Physical
  Equipment: '#c9e7b7',
  Facility: '#c9e7b7',
  DistributionNetwork: '#c9e7b7',
  Material: '#c9e7b7',

  // Motivation
  Stakeholder: '#ccccff',
  Driver: '#ccccff',
  Assessment: '#ccccff',
  Goal: '#ccccff',
  Outcome: '#ccccff',
  Principle: '#ccccff',
  Requirement: '#ccccff',
  Constraint: '#ccccff',
  Meaning: '#ccccff',
  Value: '#ccccff',

  // Implementation & Migration
  WorkPackage: '#ffe0e0',
  Deliverable: '#ffe0e0',
  ImplementationEvent: '#ffe0e0',
  Plateau: '#e0ffe0',
  Gap: '#e0ffe0',

  // Notes / structural
  Junction: '#000000',
  AndJunction: '#000000',
  OrJunction: '#ffffff',
  Grouping: '#ffffff',
  DiagramModelNote: '#ffffcc',
  Note: '#ffffcc',
  DiagramModelGroup: '#f0f0f0',
  Group: '#f0f0f0',
  DiagramModelReference: '#e8f0ff',
  DiagramObject: '#ffffff',
};

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
  | 'component';

/** ArchiMate type → coarse maxGraph shape family */
export function shapeKindForType(type: string): ShapeKind {
  const t = type.replace(/^I/, '').replace(/^archimate:/, '');

  if (t === 'AndJunction' || t === 'OrJunction' || t === 'Junction') return 'junction';
  if (t === 'Grouping' || t === 'Group' || t === 'DiagramModelGroup') return 'grouping';
  if (t.includes('Note') || t === 'DiagramModelNote') return 'note';
  if (t.endsWith('Event') || t === 'ImplementationEvent') return 'ellipse';
  if (t.endsWith('Service')) return 'service';
  if (t.includes('Actor') || t === 'Stakeholder') return 'actor';
  if (t.includes('Component')) return 'component';
  if (t === 'Node' || t === 'Device' || t === 'SystemSoftware' || t === 'Equipment') return 'cylinder';
  if (t === 'Path' || t === 'CommunicationNetwork' || t === 'DistributionNetwork') return 'hexagon';
  if (
    t.endsWith('Process') ||
    t.endsWith('Function') ||
    t.endsWith('Interaction') ||
    t === 'Capability' ||
    t === 'ValueStream' ||
    t === 'CourseOfAction' ||
    t === 'WorkPackage' ||
    t === 'Plateau'
  ) {
    return 'rounded';
  }
  if (t === 'Goal' || t === 'Outcome' || t === 'Principle' || t === 'Driver' || t === 'Assessment') {
    return 'rounded';
  }
  if (t === 'Requirement' || t === 'Constraint') return 'rhombus';
  return 'rect';
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
    fontSize: 11,
    fontFamily: 'Inter, system-ui, sans-serif',
    verticalAlign: 'middle',
    align: 'center',
    shadow: false,
    strokeWidth: 1.2,
    labelBackgroundColor: 'none',
    whiteSpace: 'wrap',
    html: 1,
    overflow: 'hidden',
  };

  switch (kind) {
    case 'ellipse':
      return { ...base, shape: 'ellipse', verticalAlign: 'middle' };
    case 'rhombus':
      return { ...base, shape: 'rhombus' };
    case 'hexagon':
      return { ...base, shape: 'hexagon' };
    case 'cylinder':
      return { ...base, shape: 'cylinder', verticalAlign: 'middle' };
    case 'actor':
      return { ...base, shape: 'actor', verticalAlign: 'bottom' };
    case 'rounded':
    case 'service':
      return { ...base, rounded: 1, arcSize: 20, verticalAlign: opts.hasChildren ? 'top' : 'middle' };
    case 'component':
      // 'module' is not a built-in maxGraph shape — use rectangle with thicker stroke
      return {
        ...base,
        shape: 'rectangle',
        strokeWidth: 2,
        verticalAlign: opts.hasChildren ? 'top' : 'middle',
      };
    case 'note':
      // 'note' is not a built-in maxGraph shape — approximate with label/rect
      return {
        ...base,
        shape: 'label',
        fillColor: opts.fillColor || '#ffffcc',
        verticalAlign: 'top',
        align: 'left',
      };
    case 'grouping':
      return {
        ...base,
        dashed: 1,
        dashPattern: '4 3',
        fillColor: 'rgba(255,255,255,0.04)',
        strokeColor: '#888888',
        verticalAlign: 'top',
        align: 'left',
      };
    case 'junction':
      return {
        ...base,
        shape: 'ellipse',
        fillColor: type.includes('Or') ? '#ffffff' : '#000000',
        strokeColor: '#000000',
        strokeWidth: 1.5,
      };
    default:
      return {
        ...base,
        rounded: 0,
        verticalAlign: opts.hasChildren ? 'top' : 'middle',
      };
  }
}

/** Relationship type → edge style fields for maxGraph */
export const RELATIONSHIP_STYLE: Record<string, Record<string, unknown>> = {
  CompositionRelationship: {
    endArrow: 'diamondThin',
    endFill: 1,
    startArrow: 'none',
    endSize: 12,
  },
  AggregationRelationship: {
    endArrow: 'diamondThin',
    endFill: 0,
    startArrow: 'none',
    endSize: 12,
  },
  AssignmentRelationship: {
    endArrow: 'block',
    endFill: 1,
    startArrow: 'oval',
    startFill: 1,
    endSize: 10,
    startSize: 8,
  },
  RealizationRelationship: {
    endArrow: 'block',
    endFill: 0,
    dashed: 1,
    dashPattern: '6 4',
    endSize: 12,
  },
  ServingRelationship: {
    endArrow: 'open',
    endFill: 0,
    endSize: 10,
  },
  AccessRelationship: {
    endArrow: 'open',
    endFill: 0,
    dashed: 1,
    dashPattern: '4 3',
    endSize: 10,
  },
  InfluenceRelationship: {
    endArrow: 'open',
    endFill: 0,
    dashed: 1,
    dashPattern: '2 3',
    endSize: 10,
  },
  TriggeringRelationship: {
    endArrow: 'block',
    endFill: 1,
    endSize: 12,
  },
  FlowRelationship: {
    endArrow: 'open',
    endFill: 0,
    dashed: 1,
    dashPattern: '8 4',
    endSize: 10,
  },
  AssociationRelationship: {
    endArrow: 'none',
    startArrow: 'none',
  },
  SpecializationRelationship: {
    endArrow: 'block',
    endFill: 0,
    endSize: 12,
  },
};

export const DEFAULT_EDGE_STYLE: Record<string, unknown> = {
  endArrow: 'open',
  endFill: 0,
  endSize: 10,
};

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
