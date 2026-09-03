import { findDependencyCycle } from './step-dependency-graph';

describe('findDependencyCycle', () => {
  it('accepts a DAG used by a parallel prep plan', () => {
    const cycle = findDependencyCycle([
      { stepId: '5', dependsOnStepId: '2' },
      { stepId: '5', dependsOnStepId: '3' },
      { stepId: '5', dependsOnStepId: '4' },
      { stepId: '6', dependsOnStepId: '1' },
      { stepId: '6', dependsOnStepId: '5' },
      { stepId: '8', dependsOnStepId: '6' },
      { stepId: '8', dependsOnStepId: '7' },
    ]);
    expect(cycle).toBeNull();
  });

  it('detects a direct cycle', () => {
    const cycle = findDependencyCycle([
      { stepId: 'a', dependsOnStepId: 'b' },
      { stepId: 'b', dependsOnStepId: 'a' },
    ]);
    expect(cycle).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('detects an indirect cycle', () => {
    const cycle = findDependencyCycle([
      { stepId: 'a', dependsOnStepId: 'b' },
      { stepId: 'b', dependsOnStepId: 'c' },
      { stepId: 'c', dependsOnStepId: 'a' },
    ]);
    expect(cycle?.includes('a')).toBe(true);
    expect(cycle?.includes('c')).toBe(true);
  });
});
