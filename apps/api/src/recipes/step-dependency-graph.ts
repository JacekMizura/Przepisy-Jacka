export type StepDependencyEdge = {
  stepId: string;
  dependsOnStepId: string;
};

export function findDependencyCycle(
  edges: StepDependencyEdge[],
): string[] | null {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(edge.stepId);
    nodes.add(edge.dependsOnStepId);
    const next = adjacency.get(edge.stepId) ?? [];
    next.push(edge.dependsOnStepId);
    adjacency.set(edge.stepId, next);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(node: string): string[] | null {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return stack.slice(Math.max(0, start)).concat(node);
    }
    if (visited.has(node)) {
      return null;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

export function uniqueIds(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
