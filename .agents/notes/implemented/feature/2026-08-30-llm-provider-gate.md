# Agent Note: Per-provider enable/disable gate on the LLM request path

Status: implemented

English | [中文](2026-08-30-llm-provider-gate.zh.md)

## Problem

Users wanted to keep a provider registered (its credentials, model list, and adapter route intact) but temporarily unavailable without removing its configuration from `settings.yaml`. The existing `llm/stream` waterfall had no extension point for a user-controlled availability check, and the model catalog (`buildModelCatalog`) did not filter by user preference — a disabled provider's models would still appear in the picker even though requests to it would fail at the adapter boundary.

## Decision

Added `@deepseek-ai/dsh-llm-provider-gate`, a settings-backed gate that stores one array of disabled provider routes under the `llm-provider-gate:` namespace in `~/.dsh/settings.yaml`. The service exposes `disabled()` and `isEnabled()` and registers a global-prepend `llm/stream` listener: any request whose provider is in the disabled set throws `LlmError('PROVIDER_DISABLED')` before any adapter dispatch. The session-controller's `buildModelCatalog` reads the same gate and filters providers out of the catalog's `groups` and `routableProviders`; the `ModelCatalog` shape gained a `disabledProviders` field so the client can surface the "enable a provider" hint.

The web Models settings page binds the gate scope, renders a `Switch` per row, and asks for confirmation before disabling a provider — the page only flips the gate flag, it does not rewrite the stored default, so the user picks the replacement model in the model selector. No new session event is required: the disabled set is configuration, not model-visible input, and the existing `request/header` + `llm/adapters-updated` events already reconstruct the effective route.

The gate is an optional peer of `session-controller` and `ui-settings-models`. Without a mounted gate every provider remains enabled and all code paths degrade to the pre-feature baseline.

## Consequences

The request path now has an additional non-retryable rejection code (`PROVIDER_DISABLED`) that surfaces as a terminal turn failure. The model catalog is tighter — disabled providers never appear in the picker, so their models cannot be accidentally selected. Configuration is durable across restarts and shared across browser tabs because it lives in the single `~/.dsh/settings.yaml` document.

Trade-offs: the default model selection is NOT auto-rebased on catalog load when its provider is disabled — the directory pass-through contract is preserved, and the user is nudged via the confirm flow instead. Discovery probes remain callable on disabled providers so reconfiguration is always possible. Session-local `model/selection` projections that name a disabled provider are not rewritten; they survive in the log and are rejected at request time.

## Alternatives considered

**Per-profile boolean flag inside `llm-pi-ai` / `llm-deepseek` schemas.** Each adapter would own its own on/off bit and re-register its route conditionally. This scatters the decision across adapters and requires every adapter plugin to implement the same logic; the gate keeps the policy in one place and lets adapters remain dumb about availability.

**Client-side localStorage toggle.** Would only hide the provider in the UI; the adapter would still dispatch requests and fail at the credential or network layer. We need request-path enforcement, which requires a host-side gate.

**A dedicated `provider-state` setting namespace per provider.** More granular but much more complex to manage; one shared `disabled` array covers the common case and keeps the schema simple.
