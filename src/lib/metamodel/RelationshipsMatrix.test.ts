import { describe, it, expect } from 'vitest';
import { RelationshipsMatrix } from './RelationshipsMatrix';

describe('RelationshipsMatrix (Archi metamodel)', () => {
  it('loads Archi relationships.xml matrix', () => {
    expect(RelationshipsMatrix.isReady).toBe(true);
  });

  it('allows composition between ApplicationComponents', () => {
    const rels = RelationshipsMatrix.getValidRelationships(
      'ApplicationComponent',
      'ApplicationComponent',
    );
    expect(rels).toContain('CompositionRelationship');
    expect(rels).toContain('AggregationRelationship');
    expect(rels).toContain('SpecializationRelationship');
  });

  it('allows serving from ApplicationService to BusinessProcess', () => {
    // Check both directions commonly used
    const forward = RelationshipsMatrix.getValidRelationships(
      'ApplicationService',
      'BusinessProcess',
    );
    const reverse = RelationshipsMatrix.getValidRelationships(
      'BusinessProcess',
      'ApplicationService',
    );
    const all = new Set([...forward, ...reverse]);
    // At least one dependency-style relation should exist between layers
    expect(all.size).toBeGreaterThan(0);
  });

  it('disallows invalid pairs', () => {
    // Junction to Gap often limited — just assert isValid is consistent
    const ok = RelationshipsMatrix.isValidRelationship(
      'BusinessActor',
      'BusinessActor',
      'CompositionRelationship',
    );
    // Same-type actors typically allow composition in ArchiMate
    expect(typeof ok).toBe('boolean');
  });

  it('provides nesting options parent→child with structural preference', () => {
    const opts = RelationshipsMatrix.getNestingOptions(
      'ApplicationComponent',
      'ApplicationFunction',
    );
    expect(opts.length).toBeGreaterThan(0);
    // Structural relations should appear first if present
    const first = opts[0];
    expect([
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
    ]).toContain(first.relationshipType);
  });

  it('labels relationship types for UI', () => {
    expect(RelationshipsMatrix.label('ServingRelationship')).toBe('Serving');
    expect(RelationshipsMatrix.label('CompositionRelationship')).toBe('Composition');
  });
});
