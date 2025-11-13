Integrating a **vanilla (non-effect-aware)** library such as **ethers.js** into an **Effect-TS** system involves _lifting_ its imperative, promise-based, or side-effectful operations into the **Effect** runtime in a controlled, typed, and referentially transparent way.

Below is the canonical approach, step-by-step.

---

## 1. Identify purity boundaries

`Ethers.js` mixes:

- **Pure** components (e.g., ABI encoding, key derivation, hash utils)
- **Effectful** operations (e.g., network calls, provider I/O, wallet signing)

Pure `ethers` utilities (e.g., `ethers.utils.keccak256`, `ethers.SigningKey`) must be wrapped with `Effect.Succeed()`. Then wrap the operations that involve side effects or I/O with the appropriate variants (`Effect.sync()`, etc.).

When lifting vanilla JavaScript logic into Effect, we must treat every ordinary function call as **potentially unsafe**, since JS has no checked-exception system — there’s no syntax or type-level guarantee that a function won’t throw. Any runtime code can throw arbitrarily (e.g., due to malformed inputs, library bugs, or unexpected states).

That means:

- Wrap imperative or side-effecting code (`crypto`, `fs`, `ethers`, etc.) with `Effect.try`, `Effect.tryPromise`, or similar constructors.
- Map thrown or rejected errors into **typed domain errors** (`Errors.KeyGenerationError`, etc.).
- Expose only pure, referentially transparent `Effect` values from our service layer.

This converts an untyped, exception-prone runtime into a predictable, composable effect system where all failure paths are explicit and typed.

---

## 2. Wrap promise-returning calls with `Effect.promise`

```ts
import { Effect } from "effect"
import { ethers } from "ethers"

const getBalance = (address: string, provider: ethers.JsonRpcProvider) =>
  Effect.promise(() => provider.getBalance(address))
```

`Effect.promise` converts any `Promise<T>` into an `Effect<never, unknown, T>` safely.

If the promise can reject with a specific type, wrap it explicitly:

```ts
const getBalance = (address: string, provider: ethers.JsonRpcProvider) =>
  Effect.tryPromise({
    try: () => provider.getBalance(address),
    catch: (err) => new Error(`RPC failed: ${String(err)}`)
  })
```

---

## 3. Wrap synchronous but impure functions with `Effect.sync`

For deterministic but potentially unsafe actions (e.g., reading from disk, random, etc.):

```ts
const newWallet = Effect.sync(() => ethers.Wallet.createRandom())
```

---

## 4. Model the dependency via a Layer (optional but idiomatic)

If the integration will be reused across modules, expose it as a **service**:

```ts
import { Context, Layer } from "effect"

class Ethers extends Context.Tag("Ethers")<
  Ethers,
  { provider: ethers.JsonRpcProvider }
>() {}

const makeEthers = (url: string) =>
  Layer.succeed(Ethers, { provider: new ethers.JsonRpcProvider(url) })
```

Then consume it:

```ts
const getNetwork = Effect.flatMap(Ethers, ({ provider }) =>
  Effect.promise(() => provider.getNetwork())
)
```

and provide it:

```ts
Effect.runPromise(
  getNetwork.pipe(
    Effect.provide(makeEthers("https://mainnet.infura.io/v3/..."))
  )
)
```

---

## 5. Handle callbacks or event emitters with `Effect.async`

For subscriptions or watch functions:

```ts
const onBlock = (provider: ethers.JsonRpcProvider) =>
  Effect.async<never, never, ethers.Block>((resume) => {
    provider.on("block", (block) => resume(Effect.succeed(block)))
  })
```

This integrates continuous event streams safely into the `EffectTS` runtime.

---

## Summary

| Type of Ethers Operation | Effect Integration Tool         | Example                        |
| ------------------------ | ------------------------------- | ------------------------------ |
| Pure computation         | `Effect.succeed`                | `ethers.utils.keccak256(data)` |
| Promise-based I/O        | `Effect.promise` / `tryPromise` | `provider.getBalance(addr)`    |
| Synchronous unsafe       | `Effect.sync`                   | `Wallet.createRandom()`        |
| Event / callback API     | `Effect.async`                  | `provider.on("block", …)`      |
| Reusable environment     | `Layer` + `Context.Tag`         | Provider or signer injection   |

---

### In short:

- Wrap async → `Effect.promise`
- Wrap sync impure → `Effect.sync`
- Wrap streams → `Effect.async`
- Inject dependencies via `Layer`
- Leave pure code pure

That pattern turns **ethers.js** into a fully typed, referentially transparent Effect-TS integration while preserving composability, failure semantics, and resource control.
