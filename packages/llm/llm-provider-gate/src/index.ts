/**
 * User-controlled enable/disable gate for LLM model providers.
 *
 * The disabled set lives in the `llm-provider-gate` settings section (default:
 * every provider enabled) and is enforced on the request path through the
 * `llm/stream` waterfall: a request targeting a disabled provider is rejected
 * before any adapter dispatch. Model catalogs and pickers read the same set to
 * hide disabled providers and their models.
 *
 * @module @deepseek-ai/dsh-llm-provider-gate
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** User-disabled model provider routes enforced on the request path. */
    llmProviderGate: LlmProviderGate
  }
}

/** Settings namespace carrying the user-disabled provider routes. */
export const LLM_PROVIDER_GATE_SETTINGS_NAMESPACE = 'llm-provider-gate'

/** Stable machine code for a request rejected because its provider is disabled. */
export const PROVIDER_DISABLED_CODE = 'PROVIDER_DISABLED'

/** Stored user preference: provider routes the user turned off. */
export interface LlmProviderGateSettings {
  /** Provider routes whose models are hidden and whose requests are rejected. */
  disabled: string[]
}

/** Schema served to settings clients for the preference. */
export const LLM_PROVIDER_GATE_SETTINGS_SCHEMA: z<LlmProviderGateSettings> = z.object({
  disabled: z.array(z.string()).default([]),
})

/** Optional deployment base for the preference. */
export interface Config {
  /** Initial disabled routes inherited when the user document does not override it. */
  disabled?: string[]
}

/**
 * Owns the user-disabled provider set and rejects disabled requests on the
 * `llm/stream` waterfall. The composition entry remains usable without a
 * settings provider; when one is mounted, its user layer is read live.
 */
export class LlmProviderGate extends Service {
  static Config: z<Config> = z.object({
    disabled: z.array(z.string()).default([]),
  })

  private source: () => LlmProviderGateSettings

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'llmProviderGate')
    const entry: LlmProviderGateSettings = { disabled: config.disabled ?? [] }
    this.source = () => entry
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, LLM_PROVIDER_GATE_SETTINGS_NAMESPACE, LLM_PROVIDER_GATE_SETTINGS_SCHEMA, entry, {
        setSource: (current) => { this.source = current },
        // Consumers re-read the disabled set per request and per catalog build,
        // so no registration-level fact needs rebuilding on a settings change.
        onChange: () => {},
      })
    })
    // A disabled route must be rejected before any other `llm/stream` listener
    // (title generation, checkpoints) starts work on the request. The thrown
    // `LlmError` propagates out of the waterfall as a terminal turn failure.
    ctx.on('llm/stream', (options, next) => {
      if (!this.isEnabled(options.provider)) {
        throw new LlmError(
          `model provider "${options.provider}" is disabled; enable it in the model settings to send requests`,
          PROVIDER_DISABLED_CODE,
        )
      }
      return next()
    }, { global: true, prepend: true })
  }

  /**
   * Read the disabled provider routes.
   * @returns a detached set of disabled provider route ids.
   */
  disabled(): ReadonlySet<string> {
    return new Set(this.source().disabled)
  }

  /**
   * Whether requests to a provider route are allowed.
   * @param provider - the provider route id.
   * @returns false exactly when the user disabled the route.
   */
  isEnabled(provider: string): boolean {
    return !this.disabled().has(provider)
  }
}

export const name = 'llm-provider-gate'
export default LlmProviderGate
