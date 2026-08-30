/**
 * Package-owned invariant companion for the LLM provider gate.
 *
 * The service owns no independent event relationship: the `llm/stream` guard
 * rejects disabled requests in the same dispatcher consumers observe, and the
 * disabled set is validated by the settings schema before `disabled()` can
 * return it. The empty installer keeps that absence explicit in composed
 * invariant sets.
 *
 * @module @deepseek-ai/dsh-llm-provider-gate/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-provider-gate'

/** Cordis companion plugin name. */
export const name = 'llm-provider-gate-invariant'
/** Services required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: the guard and the settings schema own every relationship. */
const install: InvariantInstaller = () => {}

/**
 * Register the intentionally empty invariant contribution.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
