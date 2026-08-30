---
description: "User-controlled enable/disable gate for LLM model providers"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-provider-gate

[English](README.md) | 中文

## 概述

`dsh-llm-provider-gate` gives each model provider a user-controlled on/off switch whose disabled state is durable in `~/.dsh/settings.yaml` under the `llm-provider-gate:` section. The gate is enforced on the request path through the `llm/stream` waterfall: requests to a disabled provider are rejected with `LlmError('PROVIDER_DISABLED')` before any adapter dispatch. Model catalogs filter the disabled routes so the picker never shows their models.

Choose this package when you want users to keep providers registered but temporarily unavailable without removing their configuration.

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

Mount the plugin in the host composition alongside the LLM adapters it guards. The service owns no configuration of its own; the user-driven settings section is what controls behavior.

```yaml
- name: '@deepseek-ai/dsh-llm-provider-gate'
```

The web `ui-settings-models` plugin consumes `ctx.settingsScope.bind('llm-provider-gate')` to render a toggle on every provider row, so adding the gate to the bundle automatically surfaces the control without extra wiring.

### 配置初始禁用集

The settings namespace ships with an empty disabled list. If a deployment wants to start with one or more routes off, declare them in the composition entry:

```yaml
- name: '@deepseek-ai/dsh-llm-provider-gate'
  config:
    disabled:
      - acme-gateway
```

User edits replace this base; the stored `llm-provider-gate:` section in `settings.yaml` is the single source of truth while the document is mounted.

| Field | Default | Meaning |
|---|---|---|
| `disabled` | `[]` | Provider routes whose requests are blocked and whose models are hidden from catalogs |

The generated [configuration catalog](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-provider-gate) is the exhaustive source for every accepted field.

### 读取禁用集

`ctx.llmProviderGate.disabled()` returns a detached `ReadonlySet<string>` of currently disabled routes; `ctx.llmProviderGate.isEnabled(provider)` answers the predicate. Both read from the live settings scope, so disabling a route is visible to callers without restart.

The `llm/stream` listener runs with `global: true, prepend: true`, so a request to a disabled provider fails before any other waterfall listener (title generation, checkpointing, retry scheduling) touches it. The thrown `LlmError('PROVIDER_DISABLED')` is non-retryable by default, so the loop surfaces it as a terminal turn failure rather than re-attempting.

<a id="understand-the-implementation"></a>
## 理解实现

The gate owns one `installSettingsSection` registration for the `llm-provider-gate` namespace (schema `{ disabled: string[] }`), and a `llm/stream` waterfall listener that checks the set before delegating. A detached `ReadonlySet` is returned from `disabled()` so consumers can snapshot the routes once per request without holding onto a mutable reference.

The settings section update flow is the same `settings.mutate` path used by every other settings card: optimistic mutation fenced by the latest known revision, conflict recovery re-reads the mirror, and a missing settings provider falls back to the composition entry. The waterfall check reads `isEnabled()` each invocation, so a disabled-then-re-enabled provider is immediately eligible again without reload.

<a id="further-exploration"></a>
## 进一步探索

- [packages/llm/llm/src/index.ts](../../../packages/llm/llm/src/index.ts) — `llm/stream` event contract and `LlmRuntime.stream` waterfall dispatch.
- [packages/settings/settings/src/index.ts](../../../packages/settings/settings/src/index.ts) — `installSettingsSection` wiring contract and the write-recovery semantics the gate follows.
- [packages/api/session-controller/src/catalog.ts](../../../packages/api/session-controller/src/catalog.ts) — `buildModelCatalog`, where the gate's disabled set is subtracted from the model picker output.
- [packages/client/ui-settings-models/src/client/ModelsSection.tsx](../../../packages/client/ui-settings-models/src/client/ModelsSection.tsx) — browser-side toggle rendering and gate-scope subscription.

-----

<a id="model-experience"></a>
## 模型体验

间接通过提供方目录 and the `llm/stream` waterfall: the gate filters which providers appear in catalogs and rejects their routes on the request path, but never touches prompt text, token accounting, or cache keys.

#### KV Cache effect

Provider changes select different cache domains; a disabled provider's models simply never enter a request, so their prefix is never hashed into cache state. Re-enabling the same route reuses whatever cache domain the adapter manages for that provider.

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **No per-provider granularity beyond the route key.** One boolean switch per route; fine-grained model-level disable is not supported.
- **Catalog default model passes through unchanged when its provider is disabled.** The Models page only flips the gate flag; a session created before the disable retains the stale default until the user picks a new one in the model selector. A future enhancement could auto-rebase the default to the first enabled group on every catalog load.
- **Discovery probes are still callable for disabled providers.** A user who wants to reconfigure a disabled provider can run model discovery from its editor row; the gate only blocks streaming requests, not configuration metadata reads. This is intentional so re-enabling is always possible.
- **Session-local model projections are not rewritten.** A durable `model/selection` event that names a disabled provider survives in the log; the request path rejects it, but the projection itself is not normalized.

<a id="dev-note"></a>
### 开发备注

本包是一个轻量的 settings 门控：自身不持有任何请求逻辑，也不注册任何新的 Cordis 事件。`llm/stream` 的 prepend 监听器是唯一的运行时新增行为，它在适配器派发前抛出，因此拒绝会作为 terminal turn 失败出现在会话日志中。gate 有意在提供方被禁用时保持模型目录默认值不变——该契约由 `packages/api/session-controller/tests/session-models.host.spec.ts` 中的现有测试保证。
