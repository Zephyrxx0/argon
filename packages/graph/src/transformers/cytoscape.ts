import type {
  CytoscapeElements,
  CytoscapeNodeData,
  CytoscapeEdgeData,
  DualPayload,
} from '../queries/types';

export type {
  CytoscapeElements,
  CytoscapeNodeData,
  CytoscapeEdgeData,
  DualPayload,
};

interface RawFalkorNode {
  id: number | string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface RawFalkorEdge {
  id: number | string;
  relationshipType: string;
  sourceId: number | string;
  destinationId: number | string;
  properties: Record<string, unknown>;
}

interface RawFalkorPath {
  nodes: RawFalkorNode[];
  edges: RawFalkorEdge[];
}

function isFalkorNode(val: unknown): val is RawFalkorNode {
  return (
    val !== null &&
    typeof val === 'object' &&
    'labels' in val &&
    Array.isArray((val as any).labels) &&
    'properties' in val &&
    typeof (val as any).properties === 'object' &&
    'id' in val
  );
}

function isFalkorEdge(val: unknown): val is RawFalkorEdge {
  return (
    val !== null &&
    typeof val === 'object' &&
    'relationshipType' in val &&
    typeof (val as any).relationshipType === 'string' &&
    'sourceId' in val &&
    'destinationId' in val &&
    'id' in val
  );
}

function isFalkorPath(val: unknown): val is RawFalkorPath {
  return (
    val !== null &&
    typeof val === 'object' &&
    'nodes' in val &&
    Array.isArray((val as any).nodes) &&
    'edges' in val &&
    Array.isArray((val as any).edges)
  );
}

function deriveCanonicalId(node: RawFalkorNode): string {
  const props = node.properties ?? {};
  if (typeof props.id === 'string' && props.id.length > 0) return props.id;
  if (typeof props.name === 'string' && props.name.length > 0) return props.name;
  if (typeof props.path === 'string' && props.path.length > 0) return props.path;
  if (typeof props.number === 'number' || typeof props.number === 'string') return `PR-${props.number}`;
  return String(node.id);
}

function deriveNodeLabel(node: RawFalkorNode): string {
  const props = node.properties ?? {};
  if (typeof props.title === 'string' && props.title.length > 0) return props.title;
  if (typeof props.name === 'string' && props.name.length > 0) return props.name;
  if (typeof props.path === 'string' && props.path.length > 0) return props.path;
  if (typeof props.display_name === 'string' && props.display_name.length > 0) return props.display_name;
  if (typeof props.number === 'number' || typeof props.number === 'string') return `PR #${props.number}`;
  if (typeof props.id === 'string' && props.id.length > 0) return props.id;
  return String(node.id);
}

export function toCytoscapeElements<T = unknown[]>(rawRecords: T): DualPayload<T> {
  const nodes: Array<{ data: CytoscapeNodeData }> = [];
  const edges: Array<{ data: CytoscapeEdgeData }> = [];

  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const internalIdToCanonical = new Map<string, string>();
  const primaryIdsList: string[] = [];

  function addNode(data: CytoscapeNodeData): void {
    if (!seenNodeIds.has(data.id)) {
      seenNodeIds.add(data.id);
      nodes.push({ data });
    }
  }

  function addEdge(data: CytoscapeEdgeData): void {
    if (!seenEdgeIds.has(data.id)) {
      // Ensure source and target nodes exist in Cytoscape to prevent runtime renderer errors
      if (!seenNodeIds.has(data.source)) {
        addNode({
          id: data.source,
          label: data.source,
          type: 'Unknown',
          properties: {},
        });
      }
      if (!seenNodeIds.has(data.target)) {
        addNode({
          id: data.target,
          label: data.target,
          type: 'Unknown',
          properties: {},
        });
      }
      seenEdgeIds.add(data.id);
      edges.push({ data });
    }
  }

  const rawArray = Array.isArray(rawRecords) ? rawRecords : [rawRecords];

  // Helper to extract Falkor nodes, edges, and paths
  const discoveredNodes: RawFalkorNode[] = [];
  const discoveredEdges: RawFalkorEdge[] = [];

  function inspectValue(val: unknown, isTopLevel = false): void {
    if (!val || typeof val !== 'object') return;

    if (Array.isArray(val)) {
      for (const item of val) {
        inspectValue(item, isTopLevel);
      }
      return;
    }

    if (isFalkorPath(val)) {
      for (const n of val.nodes) discoveredNodes.push(n);
      for (const e of val.edges) discoveredEdges.push(e);
      return;
    }

    if (isFalkorNode(val)) {
      discoveredNodes.push(val);
      if (isTopLevel) {
        primaryIdsList.push(deriveCanonicalId(val));
      }
      return;
    }

    if (isFalkorEdge(val)) {
      discoveredEdges.push(val);
      return;
    }

    // Tabular record (plain object)
    const record = val as Record<string, unknown>;

    // Check for specific tabular query shapes
    // 1. Constraining decisions row: { id, title, status, component, sourceUrl }
    if (typeof record.id === 'string' && typeof record.title === 'string' && typeof record.component === 'string') {
      const decisionId = record.id;
      const compId = record.component;
      if (isTopLevel) primaryIdsList.push(decisionId);

      addNode({
        id: decisionId,
        label: record.title,
        type: 'Decision',
        properties: { ...record },
      });
      addNode({
        id: compId,
        label: compId,
        type: 'Component',
        properties: { name: compId },
      });
      addEdge({
        id: `${decisionId}->GOVERNS->${compId}`,
        source: decisionId,
        target: compId,
        label: 'GOVERNS',
        properties: {},
      });
    }

    // 2. Risk ranking row: { component, score }
    else if (typeof record.component === 'string' && typeof record.score === 'number' && !record.authorId) {
      const compId = record.component;
      if (isTopLevel) primaryIdsList.push(compId);
      addNode({
        id: compId,
        label: compId,
        type: 'Component',
        properties: { score: record.score },
      });
    }

    // 3. Who knows row: { component, authorId, authorName, authoredCount, reviewerId, ... }
    else if (typeof record.component === 'string' && ('authoredCount' in record || 'reviewedCount' in record)) {
      const compId = record.component;
      if (isTopLevel) primaryIdsList.push(compId);
      addNode({
        id: compId,
        label: compId,
        type: 'Component',
        properties: { name: compId },
      });

      if (typeof record.authorId === 'string' && record.authorId.length > 0) {
        const authorId = record.authorId;
        addNode({
          id: authorId,
          label: (record.authorName as string) ?? authorId,
          type: 'Person',
          properties: { id: authorId, display_name: record.authorName },
        });
        addEdge({
          id: `${authorId}->AUTHORED_FOR->${compId}`,
          source: authorId,
          target: compId,
          label: 'AUTHORED_FOR',
          properties: { count: record.authoredCount },
        });
      }

      if (typeof record.reviewerId === 'string' && record.reviewerId.length > 0) {
        const reviewerId = record.reviewerId;
        addNode({
          id: reviewerId,
          label: (record.reviewerName as string) ?? reviewerId,
          type: 'Person',
          properties: { id: reviewerId, display_name: record.reviewerName },
        });
        addEdge({
          id: `${reviewerId}->REVIEWED_FOR->${compId}`,
          source: reviewerId,
          target: compId,
          label: 'REVIEWED_FOR',
          properties: { count: record.reviewedCount },
        });
      }
    }

    // 4. Component overview row: { name, fileCount, decisionCount, dependencies }
    else if (typeof record.name === 'string' && Array.isArray(record.dependencies)) {
      const compId = record.name;
      if (isTopLevel) primaryIdsList.push(compId);
      addNode({
        id: compId,
        label: compId,
        type: 'Component',
        properties: { ...record },
      });
      for (const dep of record.dependencies as string[]) {
        if (typeof dep === 'string') {
          addNode({
            id: dep,
            label: dep,
            type: 'Component',
            properties: { name: dep },
          });
          addEdge({
            id: `${compId}->DEPENDS_ON->${dep}`,
            source: compId,
            target: dep,
            label: 'DEPENDS_ON',
            properties: {},
          });
        }
      }
    }

    // Inspect nested values of this record for graph nodes/edges
    for (const [key, nested] of Object.entries(record)) {
      inspectValue(nested, isTopLevel && (key === 'node' || key === 'decision' || key === 'f' || key === 'c' || key === 'src' || key === 'tgt'));
    }
  }

  for (const record of rawArray) {
    inspectValue(record, true);
  }

  // Pass 1: Process discovered FalkorDB nodes
  for (const node of discoveredNodes) {
    const canonicalId = deriveCanonicalId(node);
    internalIdToCanonical.set(String(node.id), canonicalId);

    const type = node.labels && node.labels.length > 0 ? node.labels[0] : 'Unknown';
    const label = deriveNodeLabel(node);

    addNode({
      id: canonicalId,
      label,
      type,
      properties: node.properties ?? {},
    });
  }

  // Pass 2: Process discovered FalkorDB edges
  for (const edge of discoveredEdges) {
    const source = internalIdToCanonical.get(String(edge.sourceId)) ?? String(edge.sourceId);
    const target = internalIdToCanonical.get(String(edge.destinationId)) ?? String(edge.destinationId);
    const relType = edge.relationshipType || 'RELATED';
    const edgeId = edge.id !== undefined && edge.id !== null
      ? String(edge.id)
      : `${source}->${relType}->${target}`;

    addEdge({
      id: edgeId,
      source,
      target,
      label: relType,
      properties: edge.properties ?? {},
    });
  }

  const uniquePrimaryIds = Array.from(new Set(primaryIdsList));

  return {
    raw: rawRecords,
    graph: {
      nodes,
      edges,
    },
    evidence: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      primaryIds: uniquePrimaryIds,
    },
  };
}
