import type {
  ArchiModel,
  ArchiElement,
  ArchiRelationship,
  DiagramView,
  DiagramNode,
  DiagramConnection,
  ArchiLayer,
  ArchiFolder,
  ArchiBendpoint,
} from './types';

const ARCHIMATE_NS = 'http://www.archimatetool.com/archimate';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

function attr(el: Element, name: string): string {
  return el.getAttribute(name) || '';
}

function stripType(raw: string): string {
  return raw.replace(/^archimate:/, '');
}

function parseProperties(node: Element): Record<string, string> | undefined {
  const props: Record<string, string> = {};
  for (const p of Array.from(node.children)) {
    if (p.localName !== 'property' && p.tagName !== 'property') continue;
    const key = attr(p, 'key');
    if (key) props[key] = attr(p, 'value');
  }
  return Object.keys(props).length ? props : undefined;
}

function parseBounds(node: Element): { x: number; y: number; width: number; height: number } {
  const bounds =
    Array.from(node.children).find((c) => c.localName === 'bounds' || c.tagName === 'bounds') ||
    node.querySelector(':scope > bounds');
  if (!bounds) return { x: 0, y: 0, width: 120, height: 55 };
  const x = parseInt(bounds.getAttribute('x') || '0', 10);
  const y = parseInt(bounds.getAttribute('y') || '0', 10);
  // Real Archi files use width/height; older samples may use w/h
  const width = parseInt(bounds.getAttribute('width') || bounds.getAttribute('w') || '120', 10);
  const height = parseInt(bounds.getAttribute('height') || bounds.getAttribute('h') || '55', 10);
  return { x, y, width, height };
}

function directChildren(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.localName === localName || c.tagName === localName || c.tagName.endsWith(':' + localName),
  );
}

function documentationOf(el: Element): string | undefined {
  const doc = directChildren(el, 'documentation')[0];
  const text = doc?.textContent?.trim();
  return text || undefined;
}

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
      console.warn(
        '[ArchiModelEngine] WASM file not found, falling back to fast XML DOM parser engine.',
        e,
      );
    }
    return false;
  }

  get wasmReady(): boolean {
    return this.isWasmInitialized;
  }

  parseXmlModel(xmlContent: string): ArchiModel {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error(`Invalid XML: ${parseError.textContent?.slice(0, 200) || 'parse error'}`);
    }

    const modelTag = xmlDoc.querySelector('model') || xmlDoc.documentElement;
    const modelId = attr(modelTag, 'id') || 'model-1';
    const modelName = attr(modelTag, 'name') || 'Untitled ArchiModel';
    const documentation = documentationOf(modelTag) || '';
    const version = attr(modelTag, 'version') || '3.2';

    const elements = new Map<string, ArchiElement>();
    const relationships = new Map<string, ArchiRelationship>();
    const views: DiagramView[] = [];
    const folders: ArchiFolder[] = [];

    // Walk all folders + top-level elements for concepts
    const walkFolder = (folderEl: Element, parentFolderId?: string) => {
      const folderId = attr(folderEl, 'id') || `folder-${folders.length}`;
      folders.push({
        id: folderId,
        name: attr(folderEl, 'name') || 'Folder',
        type: stripType(attr(folderEl, 'type') || attr(folderEl, 'xsi:type')),
        parentId: parentFolderId,
      });

      for (const child of Array.from(folderEl.children)) {
        const local = child.localName || child.tagName;
        if (local === 'folder') {
          walkFolder(child, folderId);
          continue;
        }
        if (local !== 'element') continue;

        const id = attr(child, 'id');
        if (!id) continue;
        const rawType = stripType(attr(child, 'xsi:type') || attr(child, 'type') || 'BusinessElement');
        const name = attr(child, 'name') || '';
        const doc = documentationOf(child);
        const properties = parseProperties(child);

        if (rawType.endsWith('Relationship') || rawType.includes('Relationship')) {
          relationships.set(id, {
            id,
            name: name || undefined,
            type: rawType,
            sourceId: attr(child, 'source'),
            targetId: attr(child, 'target'),
            documentation: doc,
            properties,
            folderId,
          });
        } else if (rawType.includes('DiagramModel') || rawType.includes('SketchModel')) {
          views.push(this.parseView(child, elements));
        } else {
          elements.set(id, {
            id,
            name,
            type: rawType,
            layer: this.getElementLayer(rawType),
            documentation: doc,
            properties,
            folderId,
          });
        }
      }
    };

    // Folders under model
    for (const folder of directChildren(modelTag, 'folder')) {
      walkFolder(folder);
    }

    // Top-level elements (some files put relationships / views outside folders)
    for (const child of Array.from(modelTag.children)) {
      const local = child.localName || child.tagName;
      if (local !== 'element') continue;
      const id = attr(child, 'id');
      if (!id) continue;
      if (elements.has(id) || relationships.has(id) || views.some((v) => v.id === id)) continue;

      const rawType = stripType(attr(child, 'xsi:type') || attr(child, 'type') || '');
      if (rawType.endsWith('Relationship') || rawType.includes('Relationship')) {
        relationships.set(id, {
          id,
          name: attr(child, 'name') || undefined,
          type: rawType,
          sourceId: attr(child, 'source'),
          targetId: attr(child, 'target'),
          documentation: documentationOf(child),
          properties: parseProperties(child),
        });
      } else if (rawType.includes('DiagramModel') || rawType.includes('SketchModel')) {
        views.push(this.parseView(child, elements));
      } else if (rawType) {
        elements.set(id, {
          id,
          name: attr(child, 'name') || '',
          type: rawType,
          layer: this.getElementLayer(rawType),
          documentation: documentationOf(child),
          properties: parseProperties(child),
        });
      }
    }

    // Fallback: some models nest views only as element[xsi:type=...] found via deep query
    if (views.length === 0) {
      xmlDoc.querySelectorAll('[id]').forEach((vNode) => {
        const el = vNode as Element;
        const rawVType = stripType(attr(el, 'xsi:type'));
        if (!rawVType.includes('DiagramModel') && !rawVType.includes('SketchModel')) return;
        if (views.some((v) => v.id === attr(el, 'id'))) return;
        views.push(this.parseView(el, elements));
      });
    }

    return {
      id: modelId,
      name: modelName,
      documentation,
      version,
      elements,
      relationships,
      views,
      folders,
    };
  }

  private parseView(vNode: Element, elements: Map<string, ArchiElement>): DiagramView {
    const vId = attr(vNode, 'id') || '';
    const vName = attr(vNode, 'name') || 'Diagram View';
    const vDoc = documentationOf(vNode);
    const viewpoint = attr(vNode, 'viewpoint') || undefined;
    const connections: DiagramConnection[] = [];

    const parseNode = (cNode: Element): DiagramNode => {
      const cId = attr(cNode, 'id') || '';
      const elemRef = attr(cNode, 'archimateElement') || undefined;
      const modelRef = attr(cNode, 'model') || undefined;
      const rawType = stripType(attr(cNode, 'xsi:type') || 'DiagramObject');
      const cName =
        attr(cNode, 'name') ||
        (elemRef ? elements.get(elemRef)?.name : undefined) ||
        (modelRef ? `View ref` : '') ||
        '';
      const { x, y, width, height } = parseBounds(cNode);

      // Direct nested diagram children only
      const nested: DiagramNode[] = [];
      for (const nestedEl of directChildren(cNode, 'child')) {
        nested.push(parseNode(nestedEl));
      }

      // Connections originating from this node
      for (const sc of directChildren(cNode, 'sourceConnection')) {
        const bendpoints: ArchiBendpoint[] = [];
        for (const bp of directChildren(sc, 'bendpoint')) {
          bendpoints.push({
            startX: parseFloat(bp.getAttribute('startX') || '0'),
            startY: parseFloat(bp.getAttribute('startY') || '0'),
            endX: parseFloat(bp.getAttribute('endX') || '0'),
            endY: parseFloat(bp.getAttribute('endY') || '0'),
          });
        }
        connections.push({
          id: attr(sc, 'id') || '',
          relationshipId: attr(sc, 'archimateRelationship') || undefined,
          sourceId: attr(sc, 'source') || cId,
          targetId: attr(sc, 'target') || '',
          name: attr(sc, 'name') || undefined,
          type: stripType(attr(sc, 'xsi:type') || 'Connection') || undefined,
          bendpoints: bendpoints.length ? bendpoints : undefined,
          lineColor: attr(sc, 'lineColor') || undefined,
        });
      }

      return {
        id: cId,
        archimateElementId: elemRef,
        modelRefId: modelRef,
        name: cName,
        type: rawType,
        x,
        y,
        width,
        height,
        fillColor: attr(cNode, 'fillColor') || undefined,
        fontColor: attr(cNode, 'fontColor') || undefined,
        lineColor: attr(cNode, 'lineColor') || undefined,
        children: nested.length ? nested : undefined,
      };
    };

    const nodes: DiagramNode[] = [];
    for (const cNode of directChildren(vNode, 'child')) {
      nodes.push(parseNode(cNode));
    }

    return {
      id: vId,
      name: vName,
      documentation: vDoc,
      viewpoint,
      nodes,
      connections,
    };
  }

  /**
   * Serialize model to Archi-compatible .archimate XML (best-effort round-trip for read views).
   */
  serializeXmlModel(model: ArchiModel): string {
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<archimate:model xmlns:xsi="${XSI_NS}" xmlns:archimate="${ARCHIMATE_NS}" name="${esc(model.name)}" id="${esc(model.id)}" version="${esc(model.version || '4.0.0')}">`,
    );
    if (model.documentation) {
      lines.push(`  <documentation>${esc(model.documentation)}</documentation>`);
    }

    // Elements by layer folders
    const byLayer = new Map<string, ArchiElement[]>();
    for (const el of model.elements.values()) {
      const list = byLayer.get(el.layer) || [];
      list.push(el);
      byLayer.set(el.layer, list);
    }
    for (const [layer, els] of byLayer) {
      const folderId = `folder-${layer}`;
      lines.push(
        `  <folder name="${esc(layer.charAt(0).toUpperCase() + layer.slice(1))}" id="${folderId}" type="${esc(layer)}">`,
      );
      for (const el of els) {
        lines.push(
          `    <element xsi:type="archimate:${esc(el.type)}" id="${esc(el.id)}" name="${esc(el.name)}"/>`,
        );
      }
      lines.push('  </folder>');
    }

    // Relationships
    lines.push('  <folder name="Relations" id="folder-relations" type="relations">');
    for (const rel of model.relationships.values()) {
      lines.push(
        `    <element xsi:type="archimate:${esc(rel.type)}" id="${esc(rel.id)}" name="${esc(rel.name || '')}" source="${esc(rel.sourceId)}" target="${esc(rel.targetId)}"/>`,
      );
    }
    lines.push('  </folder>');

    // Views
    lines.push('  <folder name="Views" id="folder-views" type="diagrams">');
    for (const view of model.views) {
      lines.push(
        `    <element xsi:type="archimate:ArchimateDiagramModel" id="${esc(view.id)}" name="${esc(view.name)}"${view.viewpoint ? ` viewpoint="${esc(view.viewpoint)}"` : ''}>`,
      );

      const writeNode = (node: DiagramNode, indent: string) => {
        const type = node.type.includes(':') ? node.type : `archimate:${node.type}`;
        const parts = [
          `${indent}<child xsi:type="${esc(type)}" id="${esc(node.id)}"`,
          node.name ? ` name="${esc(node.name)}"` : '',
          node.archimateElementId ? ` archimateElement="${esc(node.archimateElementId)}"` : '',
          node.modelRefId ? ` model="${esc(node.modelRefId)}"` : '',
          node.fillColor ? ` fillColor="${esc(node.fillColor)}"` : '',
          node.fontColor ? ` fontColor="${esc(node.fontColor)}"` : '',
          node.lineColor ? ` lineColor="${esc(node.lineColor)}"` : '',
          '>',
        ];
        lines.push(parts.join(''));
        lines.push(
          `${indent}  <bounds x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>`,
        );
        // Connections from this node
        for (const conn of view.connections.filter((c) => c.sourceId === node.id)) {
          lines.push(
            `${indent}  <sourceConnection xsi:type="archimate:Connection" id="${esc(conn.id)}" source="${esc(conn.sourceId)}" target="${esc(conn.targetId)}"${conn.relationshipId ? ` archimateRelationship="${esc(conn.relationshipId)}"` : ''}${conn.lineColor ? ` lineColor="${esc(conn.lineColor)}"` : ''}>`,
          );
          for (const bp of conn.bendpoints || []) {
            lines.push(
              `${indent}    <bendpoint startX="${bp.startX}" startY="${bp.startY}" endX="${bp.endX}" endY="${bp.endY}"/>`,
            );
          }
          lines.push(`${indent}  </sourceConnection>`);
        }
        for (const child of node.children || []) {
          writeNode(child, indent + '  ');
        }
        lines.push(`${indent}</child>`);
      };

      for (const node of view.nodes) {
        writeNode(node, '      ');
      }
      lines.push('    </element>');
    }
    lines.push('  </folder>');
    lines.push('</archimate:model>');
    return lines.join('\n');
  }

  getElementLayer(elementType: string): ArchiLayer {
    const t = elementType.toLowerCase().replace(/^i/, '');
    if (
      t.includes('business') ||
      t === 'product' ||
      t === 'contract' ||
      t === 'representation'
    ) {
      return 'business';
    }
    if (t.includes('application') || t === 'dataobject') return 'application';
    if (
      t.includes('technology') ||
      t === 'node' ||
      t === 'device' ||
      t === 'systemsoftware' ||
      t === 'path' ||
      t === 'communicationnetwork' ||
      t === 'artifact'
    ) {
      return 'technology';
    }
    if (
      t.includes('physical') ||
      t === 'facility' ||
      t === 'equipment' ||
      t === 'distributionnetwork' ||
      t === 'material'
    ) {
      return 'physical';
    }
    if (
      t.includes('strategy') ||
      t === 'capability' ||
      t === 'resource' ||
      t === 'courseofaction' ||
      t === 'valuestream'
    ) {
      return 'strategy';
    }
    if (
      t.includes('motivation') ||
      t === 'goal' ||
      t === 'driver' ||
      t === 'requirement' ||
      t === 'constraint' ||
      t === 'principle' ||
      t === 'outcome' ||
      t === 'assessment' ||
      t === 'stakeholder' ||
      t === 'meaning' ||
      t === 'value'
    ) {
      return 'motivation';
    }
    if (
      t.includes('implementation') ||
      t === 'workpackage' ||
      t === 'deliverable' ||
      t === 'plateau' ||
      t === 'gap' ||
      t === 'implementationevent'
    ) {
      return 'implementation';
    }
    return 'other';
  }
}
