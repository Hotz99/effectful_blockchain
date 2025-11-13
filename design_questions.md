# Design Questions

1. manual type annotations for effect return values of interface only, not in implementations
   agreed ?

2. I want to use effect/Schema everywhere for consistency
   should i refactor the below to use it or is it overkill ?
   how about just the branded types API ?
   afaik effect/Schema is a superset of branded types API in terms of features
   edit: ended up using `Schema.brand()`

````ts
/**
 * Ethereum address - last 20 bytes of Keccak-256 hash of public key
 * Checksummed format with 0x prefix
 *
 * @category Type
 * @since 1.0.0
 */
export type Address = string & { readonly _brand: "Address" };```

3. should we care to test error message contents ?
seems useless since these can change, instead test the error variants for correct semantics

## Event Type Modeling

Current event model uses a generic structure `EventData`:

```ts
export type EventData = Record<string, unknown>

/** Immutable event representation */
export interface Event {
  readonly timestamp: DateTime.Utc
  readonly eventType: string
  readonly data: EventData
}
````

This favors flexibility and rapid iteration — any event type with arbitrary payloads is permitted without changing the type definition. However, this also defers type safety and validation to runtime.

---

**Tradeoff:**

- **Record<string, unknown>**

  - **Pros:** Open-ended, minimal friction for adding events.
  - **Cons:** No compile-time guarantees on payload structure; higher risk of malformed data.

- **Discriminated Union**

  - **Pros:** Precise typing, safe narrowing, full autocomplete for event names and payloads.
  - **Cons:** Closed set — must update the type definition to add events.

---

**Consideration:**
If the event domain is stable or known in advance, a discriminated union improves correctness and tooling support. If the event space is dynamic or user-defined, the current shape offers better extensibility.

**My opinion**: use generic structure; allows for any event (transaction) payload shape.

**Conclusion:**

Blockchains are schema-stable; events are not arbitrary — they're part of the contract between participants and verifiers.
Hence, a discriminated union (or at least a validated event schema) is the right architectural move; each event type implies a known structure and meaning:

```ts
type Event =
  | { type: "user_registered"; data: { user: string; email: string } }
  | { type: "user_login"; data: { user: string; ip: string } }
  | {
      type: "item_purchased"
      data: { user: string; item: string; price: number }
    }
  | { type: "user_logout"; data: { user: string } }
```

---

**`Schema`-based alternative:**

Effect's `Schema` library offers runtime validation + type inference from a single definition:

```ts
import { Schema } from "effect"

const UserRegistered = Schema.TaggedStruct("UserRegistered", {
  user: Schema.String
})

const UserLogin = Schema.TaggedStruct("UserLogin", {
  ip: Schema.String
})

const Event = Schema.Union(UserRegistered, UserLogin)
type Event = typeof Event.Type // inferred discriminated union
```

Benefits:

- Compile-time discriminated union typing
- Runtime validation via `Schema.decodeUnknownSync(Event)`
- Auto-tagging (`_tag` fields)
- Type safety end-to-end (serialization, business logic, persistence)

**When to use Schema:**

- External/untrusted event sources (user input, network, deserialization)
- Persisting events to disk/database with validation
- Cross-boundary communication (like Ethereum ABI decoding)

**When native discriminated unions suffice:**

- All events constructed internally (trusted code)
- No external serialization/deserialization
- Compile-time guarantees are sufficient

**Implementation Decision:**

For this blockchain implementation, we use **Schema-based discriminated unions** for:

- **Consistency with Effect-TS patterns** - Leveraging the Effect ecosystem fully
- **Learning purposes** - Understanding Effect's schema composition and validation
- **Future-proofing** - Ready for external event sources or persistence layers
- **Runtime safety** - Validate events at system boundaries

---

## Explicit vs Inferred Effectful Function Return Value Types

Example:

```ts
// explicit
forceCreateBlock: (state: BlockchainState) => Effect.Effect<BlockchainState>

// inferred
forceCreateBlock: (state: BlockchainState) => { ... }
```

---

**Tradeoff:**

- **Explicit annotation (`Effect.Effect<BlockchainState>`)**

  - **Pros:** Documents intent that this function is effectful.
  - Signals to readers and tooling that errors, environment, or async may be involved.
  - Guards against accidental widening/narrowing of types during refactors.
  - Aids IDE navigation and consistency across codebase.
  - Good in shared APIs or libraries where contract stability matters.
  - **Cons:** Verbose, potential duplication if the type is trivially inferred.

- **Inferred return type**

  - **Pros:** Cleaner, avoids redundancy when the effect type is obvious.
  - Lets TypeScript infer richer types (including inferred error or environment requirements).
  - Good in internal code where signatures are less stable and flexibility is needed.
  - **Cons:** Intent is less visible — the function _looks_ pure until you check the inferred type.
  - Changes in implementation may silently alter the inferred signature.

---

**Consideration:**

- Use **explicit annotation** for exported or shared functions, especially in service/repository layers, where the effect type is part of the external contract.
- Allow **inference** for local helpers or one-off compositions where verbosity outweighs clarity.

---

**Next Step:**
Define team-wide guidelines: explicit return types for public APIs, inferred return types acceptable for local/private functions.

---

## Pure vs Effectful Wrapping

Example:

```ts
getStats: (state: BlockchainState) =>
  Effect.sync(() => { ... })
```

---

**Tradeoff:**

- **Effectful wrapper (`Effect.sync`)**

  - **Pros:** Consistent return type across API surface; every service call yields an `Effect`.
  - Simplifies composition — consumers don’t need to distinguish pure from effectful.
  - Future-proofing: if later logic introduces IO, time, or failure, the type need not change.
  - **Cons:** Adds boilerplate when no actual side effects exist.
  - Can obscure the fact that the function is _mathematically pure_.

- **Direct pure function**

  - **Pros:** Clearer semantics — visibly a pure computation.
  - More lightweight and idiomatic if no effect machinery is required.
  - **Cons:** Consumers must mix pure and effectful calls; composition is less uniform.
  - Later introduction of effectful code forces a breaking type change.

---

**Consideration:**

- If uniform **effectful APIs** are a design goal (e.g., all repo/service functions return `Effect`), then keep the wrapper.
- If **purity vs effect distinction** is important for reasoning, expose this function as pure and lift into an `Effect` only where necessary.

---

**Next Step:**
Decide at architectural level: either enforce “all service functions are effectful” for uniformity, or allow pure returns when no side effects exist and lift selectively.

**My opinion**: uniform effectful functions for consistency.
