import type { ArchiModel, ArchiElement, ArchiRelationship, DiagramView, DiagramNode, DiagramConnection, ArchiLayer } from './types';

export class ArchiModelEngine {
  private isWasmInitialized = false;

  async initWasm(): Promise<boolean> {
    try {
      const response = await fetch('/wasm/archi_model.wasm');
      if (response.ok) {
        this.isWasmInitialized = true;
        console.log('[ArchiModelEngine] WASM runtime loaded successfully.');
        return true;
      }
    } catch (e) {
      console.warn('[ArchiModelEngine] WASM file not found, falling back to fast XML DOM parser engine.', e);
    }
    return false;
  }

  parseXmlModel(xmlContent: string): ArchiModel {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const modelTag = xmlDoc.querySelector('model') || xmlDoc.documentElement;
    const modelId = modelTag.getAttribute('id') || 'model-1';
    const modelName = modelTag.getAttribute('name') || 'Untitled ArchiModel';
    const documentation = modelTag.querySelector('documentation')?.textContent || '';

    const elements = new Map<string, ArchiElement>();
    const relationships = new Map<string, ArchiRelationship>();
    const views: DiagramView[] = [];

    // Parse Elements (folder / element nodes)
    const elementNodes = xmlDoc.querySelectorAll('element[id]');
    elementNodes.forEach((node) => {
      const id = node.getAttribute('id') || '';
      const type = node.getAttribute('xsi:type') || node.getAttribute('type') || 'BusinessElement';
      const name = node.getAttribute('name') || '';
      const doc = node.querySelector('documentation')?.textContent || undefined;
      const rawType = type.replace(/^archimate:/, '');

      // Distinguish relationships from elements
      if (rawType.endsWith('Relationship') || rawType.includes('Relationship')) {
        const sourceId = node.getAttribute('source') || '';
        const targetId = node.getAttribute('target') || '';
        relationships.set(id, {
          id,
          name,
          type: rawType,
          sourceId,
          targetId,
          documentation: doc
        });
      } else if (rawType.includes('DiagramModel') || rawType.includes('SketchModel')) {
        // Skip — diagram views are parsed separately below
      } else {
        elements.set(id, {
          id,
          name,
          type: rawType,
          layer: this.getElementLayer(rawType),
          documentation: doc
        });
      }
    });

    // Parse Diagram Views
    // Find all diagram view elements by checking xsi:type attribute contains DiagramModel
    const viewNodes = xmlDoc.querySelectorAll('[id]');
    viewNodes.forEach((vNode: Element) => {
      const rawVType = (vNode.getAttribute('xsi:type') || '').replace(/^archimate:/, '');
      if (!rawVType.includes('DiagramModel') && !rawVType.includes('SketchModel')) return;
      const vId = vNode.getAttribute('id') || '';
      const vName = vNode.getAttribute('name') || 'Diagram View';
      const vDoc = vNode.querySelector('documentation')?.textContent || undefined;

      const nodes: DiagramNode[] = [];
      const connections: DiagramConnection[] = [];

      // Parse child diagram objects
      const childNodes = vNode.querySelectorAll('child');
      childNodes.forEach((cNode) => {
        const cId = cNode.getAttribute('id') || '';
        const elemRef = cNode.getAttribute('archimateElement') || '';
        const cName = cNode.getAttribute('name') || elements.get(elemRef)?.name || '';
        const cType = cNode.getAttribute('xsi:type') || 'DiagramObject';

        const bounds = cNode.querySelector('bounds');
        const x = parseInt(bounds?.getAttribute('x') || '0', 10);
        const y = parseInt(bounds?.getAttribute('y') || '0', 10);
        const width = parseInt(bounds?.getAttribute('w') || '120', 10);
        const height = parseInt(bounds?.getAttribute('h') || '55', 10);

        nodes.push({
          id: cId,
          archimateElementId: elemRef,
          name: cName,
          type: cType,
          x,
          y,
          width,
          height,
          fillColor: cNode.getAttribute('fillColor') || undefined,
          fontColor: cNode.getAttribute('fontColor') || undefined
        });

        // Parse connections attached to this object
        const sourceConnections = cNode.querySelectorAll('sourceConnection');
        sourceConnections.forEach((sc) => {
          connections.push({
            id: sc.getAttribute('id') || '',
            relationshipId: sc.getAttribute('archimateRelationship') || undefined,
            sourceId: cId,
            targetId: sc.getAttribute('target') || '',
            name: sc.getAttribute('name') || undefined,
            type: sc.getAttribute('xsi:type') || undefined
          });
        });
      });

      views.push({
        id: vId,
        name: vName,
        documentation: vDoc,
        nodes,
        connections
      });
    });

    return {
      id: modelId,
      name: modelName,
      documentation,
      version: '3.2',
      elements,
      relationships,
      views
    };
  }

  getElementLayer(elementType: string): ArchiLayer {
    const t = elementType.toLowerCase();
    if (t.includes('business')) return 'business';
    if (t.includes('application')) return 'application';
    if (t.includes('technology') || t.includes('node') || t.includes('device') || t.includes('network')) return 'technology';
    if (t.includes('physical') || t.includes('facility') || t.includes('equipment')) return 'physical';
    if (t.includes('strategy') || t.includes('capability') || t.includes('resource')) return 'strategy';
    if (t.includes('motivation') || t.includes('goal') || t.includes('driver') || t.includes('requirement')) return 'motivation';
    if (t.includes('implementation') || t.includes('workpackage') || t.includes('deliverable')) return 'implementation';
    return 'other';
  }
}
