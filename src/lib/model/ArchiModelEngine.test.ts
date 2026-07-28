import { describe, it, expect } from 'vitest';
import { ArchiModelEngine } from './ArchiModelEngine';

describe('ArchiModelEngine', () => {
  const engine = new ArchiModelEngine();

  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                 xmlns:archimate="http://www.archimatetool.com/archimate" 
                 name="Test Enterprise Model" id="id-test-model">
  <folder name="Strategy" id="id-folder-strategy">
    <element xsi:type="archimate:Resource" id="id-elem-1" name="Cloud Server Infrastructure"/>
  </folder>
  <folder name="Business" id="id-folder-business">
    <element xsi:type="archimate:BusinessActor" id="id-elem-2" name="Customer Portal User"/>
    <element xsi:type="archimate:BusinessProcess" id="id-elem-3" name="Order Fulfillment Process"/>
  </folder>

  <element xsi:type="archimate:ServingRelationship" id="id-rel-1" source="id-elem-1" target="id-elem-3" name="Serves"/>

  <element xsi:type="archimate:ArchimateDiagramModel" id="id-view-1" name="Default Overview Diagram">
    <child id="id-node-1" archimateElement="id-elem-2" xsi:type="archimate:DiagramObject">
      <bounds x="100" y="150" w="140" h="60"/>
    </child>
    <child id="id-node-2" archimateElement="id-elem-3" xsi:type="archimate:DiagramObject">
      <bounds x="300" y="150" w="140" h="60"/>
    </child>
  </element>
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

  it('correctly parses diagram views and nodes', () => {
    const model = engine.parseXmlModel(sampleXml);
    expect(model.views.length).toBe(1);

    const view = model.views[0];
    expect(view.name).toBe('Default Overview Diagram');
    expect(view.nodes.length).toBe(2);

    const node1 = view.nodes[0];
    expect(node1.name).toBe('Customer Portal User');
    expect(node1.x).toBe(100);
    expect(node1.y).toBe(150);
    expect(node1.width).toBe(140);
    expect(node1.height).toBe(60);
  });
});
