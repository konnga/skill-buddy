import { describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from '../platforms.js'
import { ClaudeCodeAdapter } from './claude-code-adapter.js'
import { CodexAdapter } from './codex-adapter.js'
import { createPlatformAdapter } from './factory.js'
import { DoubaoAdapter } from './doubao-adapter.js'
import { LingxiAdapter } from './lingxi-adapter.js'
import { HermesAdapter } from './hermes-adapter.js'
import { OmpAdapter } from './omp-adapter.js'
import { PlatformAdapter } from './platform-adapter.js'
import { PiAdapter } from './pi-adapter.js'

describe('createPlatformAdapter', () => {
  it('selects dedicated adapters for special platforms', () => {
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'claude-code')!)).toBeInstanceOf(
      ClaudeCodeAdapter,
    )
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'codex')!)).toBeInstanceOf(
      CodexAdapter,
    )
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'pi')!)).toBeInstanceOf(
      PiAdapter,
    )
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'omp')!)).toBeInstanceOf(
      OmpAdapter,
    )
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'doubao')!)).toBeInstanceOf(
      DoubaoAdapter,
    )
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'wps-lingxi')!)).toBeInstanceOf(
      LingxiAdapter,
    )
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'hermes')!)).toBeInstanceOf(
      HermesAdapter,
    )
  })

  it('uses the generic adapter for ordinary platforms', () => {
    expect(createPlatformAdapter(BUILTIN_PLATFORMS.find((p) => p.id === 'cursor')!)).toBeInstanceOf(
      PlatformAdapter,
    )
  })
})
