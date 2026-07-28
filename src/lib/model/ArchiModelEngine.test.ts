import { describe, it, expect } from 'vitest';
import { ArchiModelEngine } from './ArchiModelEngine';
import { absoluteBendpoint, shapeKindForType, formatTypeName, RELATIONSHIP_STYLE } from '../canvas/archi-styles';

describe('ArchiModelEngine', () => {
  const engine = new ArchiModelEngine();

  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:archimate="http://www.archimatetool.com/archimate"
                 name="Test Enterprise Model" id="id-test-model">
  <folder name="Strategy" id="id-folder-strategy" type="strategy">
    <element xsi:type="archimate:Resource" id="id-elem-1" name="Cloud Server Infrastructure"/>
  </folder>
  <folder name="Business" id="id-folder-business" type="business">
    <element xsi:type="archimate:BusinessActor" id="id-elem-2" name="Customer Portal User"/>
    <element xsi:type="archimate:BusinessProcess" id="id-elem-3" name="Order Fulfillment Process"/>
  </folder>
  <folder name="Relations" id="id-folder-rel" type="relations">
    <element xsi:type="archimate:ServingRelationship" id="id-rel-1" source="id-elem-1" target="id-elem-3" name="Serves"/>
  </folder>
  <folder name="Views" id="id-folder-views" type="diagrams">
    <element xsi:type="archimate:ArchimateDiagramModel" id="id-view-1" name="Default Overview Diagram">
      <child id="id-node-1" archimateElement="id-elem-2" xsi:type="archimate:DiagramObject">
        <bounds x="100" y="150" w="140" h="60"/>
        <sourceConnection xsi:type="archimate:Connection" id="id-conn-1" source="id-node-1" target="id-node-2" archimateRelationship="id-rel-1">
          <bendpoint startX="-20" startY="40" endX="20" endY="40"/>
        </sourceConnection>
      </child>
      <child id="id-node-2" archimateElement="id-elem-3" xsi:type="archimate:DiagramObject">
        <bounds x="300" y="150" width="140" height="60"/>
      </child>
      <child id="id-parent" name="Container" xsi:type="archimate:DiagramObject" fillColor="#ffff80">
        <bounds x="20" y="20" width="440" height="200"/>
        <child id="id-nested" archimateElement="id-elem-1" xsi:type="archimate:DiagramObject">
          <bounds x="40" y="50" width="120" height="55"/>
        </child>
      </child>
    </element>
  </folder>
</archimate:model>`;

  it('correctly parses model metadata and elements', () => {
    const model = engine.parseXmlModel(sampleXml);
    expect(model.name).toBe('Test Enterprise Model');
    expect(model.id).toBe('id-test-model');
    expect(model.elements.size).toBe(3);

    const resourceElem = model.elements.get('id-elem-1');
    expect(resourceElem?.name).toBe('Cloud Server Infrastructure');
    expect(resourceElem?.layer).toBe('strategy');

    const actorElem = model.elements.get('id-elem-2');
    expect(actorElem?.name).toBe('Customer Portal User');
    expect(actorElem?.layer).toBe('business');
  });

  it('correctly parses relationships', () => {
    const model = engine.parseXmlModel(sampleXml);
    expect(model.relationships.size).toBe(1);

    const rel = model.relationships.get('id-rel-1');
    expect(rel?.type).toBe('ServingRelationship');
    expect(rel?.sourceId).toBe('id-elem-1');
    expect(rel?.targetId).toBe('id-elem-3');
  });

  it('correctly parses diagram views, nodes, width/height and w/h bounds', () => {
    const model = engine.parseXmlModel(sampleXml);
    expect(model.views.length).toBe(1);

    const view = model.views[0];
    expect(view.name).toBe('Default Overview Diagram');
    expect(view.nodes.length).toBe(3);

    const node1 = view.nodes[0];
    expect(node1.name).toBe('Customer Portal User');
    expect(node1.x).toBe(100);
    expect(node1.y).toBe(150);
    expect(node1.width).toBe(140);
    expect(node1.height).toBe(60);

    // width/height attributes
    const node2 = view.nodes[1];
    expect(node2.width).toBe(140);
    expect(node2.height).toBe(60);
  });

  it('parses nested diagram children without flattening', () => {
    const model = engine.parseXmlModel(sampleXml);
    const parent = model.views[0].nodes.find((n) => n.id === 'id-parent');
    expect(parent).toBeTruthy();
    expect(parent!.children?.length).toBe(1);
    expect(parent!.children![0].id).toBe('id-nested');
    expect(parent!.children![0].x).toBe(40);
    expect(parent!.children![0].archimateElementId).toBe('id-elem-1');
    // Nested must not appear as top-level
    expect(model.views[0].nodes.some((n) => n.id === 'id-nested')).toBe(false);
  });

  it('parses bendpoints on connections', () => {
    const model = engine.parseXmlModel(sampleXml);
    expect(model.views[0].connections.length).toBe(1);
    const conn = model.views[0].connections[0];
    expect(conn.relationshipId).toBe('id-rel-1');
    expect(conn.bendpoints?.length).toBe(1);
    expect(conn.bendpoints![0]).toEqual({
      startX: -20,
      startY: 40,
      endX: 20,
      endY: 40,
    });
  });

  it('round-trips serialize → parse for core structure', () => {
    const model = engine.parseXmlModel(sampleXml);
    const xml = engine.serializeXmlModel(model);
    const again = engine.parseXmlModel(xml);
    expect(again.name).toBe(model.name);
    expect(again.elements.size).toBe(model.elements.size);
    expect(again.relationships.size).toBe(model.relationships.size);
    expect(again.views.length).toBe(model.views.length);
    expect(again.views[0].nodes.length).toBe(model.views[0].nodes.length);
    expect(again.views[0].connections.length).toBe(model.views[0].connections.length);
  });

  it('parses real-world Archisurance sample when available', async () => {
    // Optional: load from desktop Archi test fixtures via relative path in Node
    try {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const path = resolve(
        '/mnt/k/repo/archi/tests/org.opengroup.archimate.xmlexchange.tests/testdata/Archisurance.archimate',
      );
      const xml = readFileSync(path, 'utf8');
      const model = engine.parseXmlModel(xml);
      expect(model.elements.size).toBeGreaterThan(50);
      expect(model.views.length).toBeGreaterThan(5);
      const withNest = model.views.find((v) => v.nodes.some((n) => (n.children?.length || 0) > 0));
      expect(withNest).toBeTruthy();
      const withBp = model.views.find((v) => v.connections.some((c) => (c.bendpoints?.length || 0) > 0));
      expect(withBp).toBeTruthy();
    } catch (e: any) {
      if (e?.code === 'ENOENT') return; // skip if fixture not mounted
      throw e;
    }
  });
});

describe('archi-styles helpers', () => {
  it('maps ArchiMate types to shape kinds', () => {
    expect(shapeKindForType('BusinessProcess')).toBe('rounded');
    expect(shapeKindForType('BusinessEvent')).toBe('ellipse');
    expect(shapeKindForType('ApplicationComponent')).toBe('component');
    expect(shapeKindForType('AndJunction')).toBe('junction');
    expect(shapeKindForType('Grouping')).toBe('grouping');
    expect(shapeKindForType('BusinessService')).toBe('service');
    expect(shapeKindForType('DataObject')).toBe('object');
  });

  it('formats type names for UI', () => {
    expect(formatTypeName('BusinessActor')).toBe('Business Actor');
    expect(formatTypeName('ServingRelationship')).toBe('Serving');
  });

  it('places composition diamond at the source (Archi/figure convention)', () => {
    const c = RELATIONSHIP_STYLE.CompositionRelationship;
    expect(c.startArrow).toBe('diamond');
    expect(c.startFill).toBe(true);
    expect(c.endArrow).toBe('none');
  });

  it('converts relative bendpoints to absolute points', () => {
    const pt = absoluteBendpoint(
      { startX: -100, startY: 0, endX: 100, endY: 0 },
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    );
    // (0 + -100 + 200 + 100) / 2 = 100
    expect(pt.x).toBe(100);
    expect(pt.y).toBe(0);
  });
});
