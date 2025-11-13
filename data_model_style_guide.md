**Data Model Module Style Guide (Effect-TS)**

Use this as a generative pattern for any data model module. The goal is consistent structure, minimal redundancy, and predictable namespace composition.

---

### 1. Module Header

- Describe the domain in one line.
- List responsibilities: data types, schemas, constructors, guards.
- Include `@since` tag.

```
/**
 * Domain types for <domain>
 * - Purpose summary
 * - Key responsibilities
 * @since 1.0.0
 */
```

---

### 2. Imports

- Always import from `"effect"` (`Schema`, `Data`, `ParseResult`).
- Import external libs only for deterministic transformation (e.g., `ethers`).

---

### 3. Schema Section

Each model type gets its own section:

- JSDoc block summarizing purpose, constraints, and pipeline steps.
- Schema constant named `<Type>Schema`.
- If normalization or validation requires computation, wrap in `Schema.transformOrFail`.

```
const TypeSchema = Schema.String.pipe(Schema.brand("TypeName"))

export const TypeFromString = Schema.transformOrFail(
  Schema.String,
  TypeSchema,
  {
    strict: true,
    decode: (s, _, ast) =>
      ParseResult.try({
        try: () => normalizeAndValidate(s),
        catch: () => new ParseResult.Type(ast, s),
      }),
    encode: ParseResult.succeed,
  }
)
```

---

### 4. Type Alias

Expose the branded type:

```
export type TypeName = typeof TypeFromString.Type
```

---

### 5. Composite Schema

For grouped models:

```
export const AggregateSchema = Schema.Struct({
  fieldA: TypeASchema,
  fieldB: TypeBSchema,
})
export type Aggregate = typeof AggregateSchema.Type
```

---

### 6. Error Definitions

Only if domain-specific failures are expected:

```
export class InvalidTypeError extends Data.TaggedError("InvalidTypeError")<{
  readonly reason: string
}> {}
```

---

### 7. Namespace Exports

Each model type exposes the same minimal interface for uniformity:

```
export const TypeName = {
  Schema: TypeSchema,
  decode: Schema.decode(TypeFromString),
  decodeSync: Schema.decodeSync(TypeFromString),
  make: TypeSchema.make,
  is: Schema.is(TypeSchema),
  Equivalence: Schema.equivalence(TypeSchema),
  toString: Schema.encodeSync(TypeSchema),
}
```

Rules:

- `decode` → effectful (for untrusted input)
- `decodeSync` → throws (used in tests or trusted env)
- `make` → pure constructor for already-validated values
- `is` → runtime guard
- `Equivalence` → structural equality
- `toString` → canonical encoding

---

### 8. Composition / Aggregates

If multiple models combine into a single logical entity:

- Add an aggregate namespace following the same pattern.
- Keep cross-field derivations external (service layer).

---

### 9. Purity Boundary

- Schema modules remain **pure**: no external effects, no randomness, no I/O.
- Any computation requiring environment or effects lives in a service module.

---

**Structure Summary**

```
1. Header doc
2. Imports
3. SCHEMAS
4. TYPE ALIASES
5. COMPOSITES
6. ERRORS
7. NAMESPACES
```

Follow this layout verbatim for all data model modules.
