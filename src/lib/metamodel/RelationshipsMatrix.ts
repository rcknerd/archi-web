/**
 * ArchiMate 3.2 relationships matrix — port of Archi's RelationshipsMatrix
 * (com.archimatetool.model.util.RelationshipsMatrix) driven by the same XML files.
 */

import relationshipsXml from './relationships.xml?raw';
import relationshipsKeysXml from './relationships-keys.xml?raw';

/** All ArchiMate relationship type names (without package prefix). */
export const RELATIONSHIP_TYPES = [
  'CompositionRelationship',
  'AggregationRelationship',
  'AssignmentRelationship',
  'RealizationRelationship',
  'ServingRelationship',
  'AccessRelationship',
  'InfluenceRelationship',
  'TriggeringRelationship',
  'FlowRelationship',
  'SpecializationRelationship',
  'AssociationRelationship',
] as const;

export type RelationshipTypeName = (typeof RELATIONSHIP_TYPES)[number];

/** Preferred order for nested-relation dialogs (structural first, like Archi). */
export const NESTING_PREFERRED_ORDER: RelationshipTypeName[] = [
  'CompositionRelationship',
  'AggregationRelationship',
  'AssignmentRelationship',
  'RealizationRelationship',
  'SpecializationRelationship',
  'ServingRelationship',
  'AccessRelationship',
  'InfluenceRelationship',
  'TriggeringRelationship',
  'FlowRelationship',
  'AssociationRelationship',
];

const KEY_TO_REL: Record<string, RelationshipTypeName> = {
  a: 'AccessRelationship',
  c: 'CompositionRelationship',
  f: 'FlowRelationship',
  g: 'AggregationRelationship',
  i: 'AssignmentRelationship',
  n: 'InfluenceRelationship',
  o: 'AssociationRelationship',
  r: 'RealizationRelationship',
  s: 'SpecializationRelationship',
  t: 'TriggeringRelationship',
  v: 'ServingRelationship',
};

function cleanType(t: string): string {
  return t.replace(/^archimate:/, '').replace(/^I/, '');
}

function parseKeysFromXml(xml: string): Map<string, RelationshipTypeName> {
  // Prefer static KEY_TO_REL; also parse XML for fidelity
  const map = new Map<string, RelationshipTypeName>(Object.entries(KEY_TO_REL) as [string, RelationshipTypeName][]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  doc.querySelectorAll('key').forEach((el) => {
    const ch = el.getAttribute('char');
    const rel = el.getAttribute('relationship') as RelationshipTypeName | null;
    if (ch && rel) map.set(ch, rel);
  });
  return map;
}

type Matrix = Map<string, Map<string, Set<RelationshipTypeName>>>;

function parseMatrix(xml: string, keyMap: Map<string, RelationshipTypeName>): Matrix {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const matrix: Matrix = new Map();

  doc.querySelectorAll('source').forEach((sourceEl) => {
    const sourceConcept = sourceEl.getAttribute('concept');
    if (!sourceConcept) return;
    const targets = matrix.get(sourceConcept) ?? new Map<string, Set<RelationshipTypeName>>();
    sourceEl.querySelectorAll('target').forEach((targetEl) => {
      const targetConcept = targetEl.getAttribute('concept');
      const relChars = targetEl.getAttribute('relations') || '';
      if (!targetConcept) return;
      const set = new Set<RelationshipTypeName>();
      for (const ch of relChars) {
        const rel = keyMap.get(ch);
        if (rel) set.add(rel);
      }
      targets.set(targetConcept, set);
    });
    matrix.set(sourceConcept, targets);
  });

  return matrix;
}

class RelationshipsMatrixImpl {
  private keyMap: Map<string, RelationshipTypeName>;
  private matrix: Matrix;
  private loaded = false;

  constructor() {
    this.keyMap = parseKeysFromXml(relationshipsKeysXml);
    this.matrix = parseMatrix(relationshipsXml, this.keyMap);
    this.loaded = true;
  }

  get isReady(): boolean {
    return this.loaded;
  }

  /**
   * Valid relationship types from source element type → target element type.
   * Types are ArchiMate concept names e.g. BusinessActor, ApplicationComponent.
   */
  getValidRelationships(sourceType: string, targetType: string): RelationshipTypeName[] {
    const s = cleanType(sourceType);
    const t = cleanType(targetType);
    const targets = this.matrix.get(s);
    if (!targets) return [];
    const set = targets.get(t);
    if (!set) return [];
    // Stable order matching RELATIONSHIP_TYPES
    return RELATIONSHIP_TYPES.filter((r) => set.has(r));
  }

  isValidRelationship(sourceType: string, targetType: string, relationshipType: string): boolean {
    const rel = cleanType(relationshipType) as RelationshipTypeName;
    return this.getValidRelationships(sourceType, targetType).includes(rel);
  }

  /** Whether this source type can start the given relationship to anything. */
  isValidRelationshipStart(sourceType: string, relationshipType: string): boolean {
    const s = cleanType(sourceType);
    const rel = cleanType(relationshipType) as RelationshipTypeName;
    const targets = this.matrix.get(s);
    if (!targets) return false;
    for (const set of targets.values()) {
      if (set.has(rel)) return true;
    }
    return false;
  }

  /**
   * Relations suitable for nesting parent→child (prefer structural).
   * Returns both parent→child and reverse child→parent options with direction flag.
   */
  getNestingOptions(
    parentType: string,
    childType: string,
  ): Array<{ relationshipType: RelationshipTypeName; direction: 'parent-to-child' | 'child-to-parent' }> {
    const forward = this.getValidRelationships(parentType, childType);
    const reverse = this.getValidRelationships(childType, parentType);

    const structural = new Set([
      'CompositionRelationship',
      'AggregationRelationship',
      'AssignmentRelationship',
      'RealizationRelationship',
      'SpecializationRelationship',
    ]);

    const out: Array<{ relationshipType: RelationshipTypeName; direction: 'parent-to-child' | 'child-to-parent' }> =
      [];

    // Prefer structural forward first
    for (const r of NESTING_PREFERRED_ORDER) {
      if (forward.includes(r) && structural.has(r)) {
        out.push({ relationshipType: r, direction: 'parent-to-child' });
      }
    }
    for (const r of NESTING_PREFERRED_ORDER) {
      if (reverse.includes(r) && structural.has(r)) {
        out.push({ relationshipType: r, direction: 'child-to-parent' });
      }
    }
    // Then remaining
    for (const r of NESTING_PREFERRED_ORDER) {
      if (forward.includes(r) && !out.some((o) => o.relationshipType === r && o.direction === 'parent-to-child')) {
        out.push({ relationshipType: r, direction: 'parent-to-child' });
      }
    }
    for (const r of NESTING_PREFERRED_ORDER) {
      if (reverse.includes(r) && !out.some((o) => o.relationshipType === r && o.direction === 'child-to-parent')) {
        out.push({ relationshipType: r, direction: 'child-to-parent' });
      }
    }

    return out;
  }

  /** Human label for a relationship type. */
  label(relationshipType: string): string {
    return cleanType(relationshipType)
      .replace(/Relationship$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
  }
}

/** Singleton matrix instance (parses XML once). */
export const RelationshipsMatrix = new RelationshipsMatrixImpl();
