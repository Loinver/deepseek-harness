/** Provider gate settings layering and the `llm/stream` request guard. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmError, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import LlmProviderGate, {
  LLM_PROVIDER_GATE_SETTINGS_NAMESPACE,
  PROVIDER_DISABLED_CODE,
} from '../src/index.ts'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

/** A `llm/stream` dispatch indistinguishable from the one `LlmRuntime.stream` makes. */
function streamRequest(provider: string): GenerateOptions {
  return { provider, model: 'test-model', messages: [] }
}

/** Dispatch one `llm/stream` waterfall; reports whether the guarded inner call ran. */
function dispatch(ctx: Context, _options: GenerateOptions): { delegated: boolean } {
  const outcome = { delegated: false }
  ctx.waterfall({} as LlmRuntime, 'llm/stream', _options, () => {
    outcome.delegated = true
    return (async function* () {})()
  })
  return outcome
}

async function boot(config: { disabled?: string[] } = {}): Promise<{
  ctx: Context
  settingsFiber: Context['fiber']
  gate: LlmProviderGate
}> {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  await ctx.plugin(LlmProviderGate, config)
  return { ctx, settingsFiber, gate: ctx.llmProviderGate }
}

describe('LlmProviderGate', () => {
  it('enables every provider by default and delegates guarded streams', async () => {
    const bench = await boot()
    expect(bench.gate.disabled()).toEqual(new Set())
    expect(bench.gate.isEnabled('deepseek-official')).toBe(true)
    expect(dispatch(bench.ctx, streamRequest('deepseek-official')).delegated).toBe(true)
    await bench.ctx.fiber.dispose()
  })

  it('rejects streams to a user-disabled provider with PROVIDER_DISABLED', async () => {
    const bench = await boot()
    await bench.settingsFiber.ctx.settings.replace(LLM_PROVIDER_GATE_SETTINGS_NAMESPACE, {
      disabled: ['acme-gateway', 'deepseek-official'],
    })
    expect(bench.gate.disabled()).toEqual(new Set(['acme-gateway', 'deepseek-official']))
    expect(bench.gate.isEnabled('acme-gateway')).toBe(false)
    try {
      dispatch(bench.ctx, streamRequest('acme-gateway'))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError)
      expect((error as LlmError).code).toBe(PROVIDER_DISABLED_CODE)
      expect((error as LlmError).message).toContain('acme-gateway')
    }
    await bench.ctx.fiber.dispose()
  })

  it('vetoed requests stay invisible to later waterfall listeners', async () => {
    const bench = await boot()
    await bench.settingsFiber.ctx.settings.replace(LLM_PROVIDER_GATE_SETTINGS_NAMESPACE, {
      disabled: ['acme-gateway'],
    })
    let downstream = 0
    bench.ctx.on('llm/stream', (_options, next) => {
      downstream += 1
      return next()
    }, { global: true })
    expect(() => dispatch(bench.ctx, streamRequest('acme-gateway'))).toThrow(LlmError)
    expect(downstream).toBe(0)
    expect(dispatch(bench.ctx, streamRequest('deepseek-official')).delegated).toBe(true)
    expect(downstream).toBe(1)
    await bench.ctx.fiber.dispose()
  })

  it('resumes delegation when the user re-enables the provider', async () => {
    const bench = await boot()
    await bench.settingsFiber.ctx.settings.replace(LLM_PROVIDER_GATE_SETTINGS_NAMESPACE, {
      disabled: ['acme-gateway'],
    })
    expect(bench.gate.isEnabled('acme-gateway')).toBe(false)
    await bench.settingsFiber.ctx.settings.replace(LLM_PROVIDER_GATE_SETTINGS_NAMESPACE, { disabled: [] })
    expect(bench.gate.isEnabled('acme-gateway')).toBe(true)
    expect(dispatch(bench.ctx, streamRequest('acme-gateway')).delegated).toBe(true)
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the settings provider detaches', async () => {
    const bench = await boot({ disabled: ['acme-gateway'] })
    await bench.settingsFiber.ctx.settings.replace(LLM_PROVIDER_GATE_SETTINGS_NAMESPACE, { disabled: [] })
    expect(bench.gate.isEnabled('acme-gateway')).toBe(true)
    await bench.settingsFiber.dispose()
    expect(bench.gate.isEnabled('acme-gateway')).toBe(false)
    expect(() => dispatch(bench.ctx, streamRequest('acme-gateway'))).toThrow(LlmError)
    await bench.ctx.fiber.dispose()
  })
})
