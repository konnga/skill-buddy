import { describe, expect, it } from 'vitest'
import { planAdditiveInstall, planImportSync, targetKey } from './planners.js'

const skill = (name: string, ...installations: [string, string, string?][]) => ({
  name,
  installations: installations.map(([agent, scope, projectRoot]) => ({
    agent,
    scope,
    projectRoot,
  })),
})

describe('planAdditiveInstall', () => {
  const targets = [
    { agent: 'cursor', scope: 'user' },
    { agent: 'codex', scope: 'user' },
  ]

  it('fills only the gaps and never plans overwrites', () => {
    const plan = planAdditiveInstall(
      ['a', 'b'],
      [skill('a', ['claude-code', 'user'], ['cursor', 'user']), skill('b', ['claude-code', 'user'])],
      targets,
    )
    expect(plan.missing).toEqual([])
    expect(plan.installs).toEqual([
      { name: 'a', targets: [{ agent: 'codex', scope: 'user' }] },
      { name: 'b', targets },
    ])
  })

  it('reports members with no local copy as missing', () => {
    const plan = planAdditiveInstall(['ghost'], [], targets)
    expect(plan.missing).toEqual(['ghost'])
    expect(plan.installs).toEqual([])
  })

  it('distinguishes project scopes via projectRoot', () => {
    const plan = planAdditiveInstall(
      ['a'],
      [skill('a', ['cursor', 'project', '/p1'])],
      [{ agent: 'cursor', scope: 'project', projectRoot: '/p2' }],
    )
    expect(plan.installs[0]!.targets).toHaveLength(1)
  })

  it('skips members already everywhere', () => {
    const plan = planAdditiveInstall(['a'], [skill('a', ['cursor', 'user'], ['codex', 'user'])], targets)
    expect(plan.installs).toEqual([])
  })

  it('returns only the fresh targets when a member is partially installed', () => {
    // Underpins temp-apply bookkeeping: rollback must trash only what we added,
    // so the plan must exclude the already-present target from the gap list.
    const plan = planAdditiveInstall(['a'], [skill('a', ['cursor', 'user'])], targets)
    expect(plan.installs).toEqual([{ name: 'a', targets: [{ agent: 'codex', scope: 'user' }] }])
  })

  it('preserves member order so bookkeeping can zip plan gaps to results', () => {
    const plan = planAdditiveInstall(['b', 'a'], [skill('a'), skill('b')], targets)
    expect(plan.installs.map((i) => i.name)).toEqual(['b', 'a'])
  })
})

describe('planImportSync', () => {
  const pair = { source: 'claude-code', target: 'cursor', scope: 'user', synced: [] as string[] }

  it('plans installs for new source skills missing on target', () => {
    const actions = planImportSync([pair], [skill('a', ['claude-code', 'user'])])
    expect(actions).toEqual([{ pairIndex: 0, name: 'a', install: true }])
  })

  it('marks already-present skills as synced without install', () => {
    const actions = planImportSync(
      [pair],
      [skill('a', ['claude-code', 'user'], ['cursor', 'user'])],
    )
    expect(actions).toEqual([{ pairIndex: 0, name: 'a', install: false }])
  })

  it('never re-forces handled skills (deletion respected)', () => {
    const actions = planImportSync(
      [{ ...pair, synced: ['a'] }],
      [skill('a', ['claude-code', 'user'])],
    )
    expect(actions).toEqual([])
  })

  it('ignores skills absent from the source', () => {
    const actions = planImportSync([pair], [skill('b', ['codex', 'user'])])
    expect(actions).toEqual([])
  })
})

describe('targetKey', () => {
  it('treats undefined and empty projectRoot the same', () => {
    expect(targetKey({ agent: 'a', scope: 'user' })).toBe(
      targetKey({ agent: 'a', scope: 'user', projectRoot: undefined }),
    )
  })
})
