/**
 * PATRICIA Trie — Pure Model & Schema
 *
 * Ethereum-style Merkle-Patricia Trie (hexary nibble-based) implementation.
 *
 * This module contains:
 * - Entity schemas (PatriciaNode, PatriciaTrie) with node kinds
 * - Pure constructors for branch/extension/leaf nodes
 * - Semantic nibble-based path representation (NOT compact encoding)
 * - No side effects, no async logic, no logging
 *
 * ## Formal Constraints
 *
 * ### Key / Nibble Representation
 * - Keys are represented as nibble arrays: `nibbles: readonly number[]` where each element is an integer between 0 and 15 inclusive.
 * - Internal representation uses these nibble arrays (not string keys) to traverse the trie.
 *
 * ### Node Kinds and Path Segmentation
 * - `kind` ∈ { "branch", "extension", "leaf" }.
 *   - For `kind = "extension"`: the node has exactly one child and `value = None`, nibbles.length ≥ 1.
 *   - For `kind = "leaf"`: the node has no children (`children.size = 0`) and `value = Some(v)`.
 *   - For `kind = "branch"`: the node may have 0 to 16 children and `value` may be `Some(v)` or `None`, nibbles is empty array.
 *
 * ### Path Sharing / Compression
 * - No branch node should have exactly one non‑null child (violates path compression).
 * - Extension nodes must have `nibbles.length ≥ 1`.
 * - Sequences of nodes with single children must be compressed into one extension node.
 *
 * ### Children Keys and Traversal
 * - `children` is a map from single‐nibble keys to child nodes.
 * - Child map keys must be strings that represent one nibble: "0" … "9", "a" … "f".
 * - Traversal: consume the first nibble of the remaining key path, look up `children[nibble]`, continue with remaining nibble array.
 *
 * ### Value Existence and Consistency
 * - Only leaf nodes (and branch nodes when exactly matching a key) carry meaningful `value`.
 * - Extension nodes always have `value = None`.
 *
 * @module PatriciaTrie
 * @since 0.2.0
 */

import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Equivalence from "effect/Equivalence";
import * as Array from "effect/Array";

const PatriciaNodeKeySchema = Schema.String;

export type PatriciaNodeKey = typeof PatriciaNodeKeySchema.Type;

const NibblesSchema = Schema.Array(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 15))
);

export type Nibbles = typeof NibblesSchema.Type;

// ============================================================================
// PATRICIA NODE TYPES & SCHEMAS
// ============================================================================

// Base fields for each node type
const leafFields = {
  _tag: Schema.Literal("leaf"),
  nibbles: NibblesSchema,
  value: Schema.Unknown,
};

const extensionFields = {
  _tag: Schema.Literal("extension"),
  nibbles: NibblesSchema,
};

const branchFields = {
  _tag: Schema.Literal("branch"),
  value: Schema.OptionFromNullOr(Schema.Unknown),
};

// Type interfaces (decoded)
export interface LeafNode extends Schema.Struct.Type<typeof leafFields> {}

export interface ExtensionNode
  extends Schema.Struct.Type<typeof extensionFields> {
  readonly nextNode: PatriciaNode;
}

export interface BranchNode extends Schema.Struct.Type<typeof branchFields> {
  readonly children: Record<PatriciaNodeKey, PatriciaNode>;
}

export type PatriciaNode = LeafNode | ExtensionNode | BranchNode;

// Encoded interfaces (for schema serialization)
interface LeafNodeEncoded extends Schema.Struct.Encoded<typeof leafFields> {}

interface ExtensionNodeEncoded
  extends Schema.Struct.Encoded<typeof extensionFields> {
  readonly nextNode: PatriciaNodeEncoded;
}

interface BranchNodeEncoded extends Schema.Struct.Encoded<typeof branchFields> {
  readonly children: Record<PatriciaNodeKey, PatriciaNodeEncoded>;
}

type PatriciaNodeEncoded =
  | LeafNodeEncoded
  | ExtensionNodeEncoded
  | BranchNodeEncoded;

/**
 * Leaf node schema.
 * Terminal node that carries a value.
 *
 * Invariants:
 * - Must have no children (terminal node)
 * - `value` stores the actual data
 * - `nibbles` can be any length ≥ 0
 *
 * @category Schemas
 * @since 0.2.0
 */
export const LeafNodeSchema: Schema.Schema<LeafNode, LeafNodeEncoded> =
  Schema.Struct(leafFields);

/**
 * Extension node schema.
 * Compresses a single-child path segment.
 *
 * Invariants:
 * - Has exactly one child (`nextNode`)
 * - `nibbles.length ≥ 1` (stores compressed path segment)
 * - Extension nodes are structural, not terminal
 *
 * @category Schemas
 * @since 0.2.0
 */
export const ExtensionNodeSchema: Schema.Schema<
  ExtensionNode,
  ExtensionNodeEncoded
> = Schema.Struct({
  ...extensionFields,
  nextNode: Schema.suspend(
    (): Schema.Schema<PatriciaNode, PatriciaNodeEncoded> => PatriciaNodeSchema
  ),
});

/**
 * Branch node schema.
 * N-way branching node with optional value.
 *
 * Invariants:
 * - Has 0 to 16 children (if exactly 1 child, violates path compression)
 * - `value` is optional (`Some` if exact key match at this node, `None` otherwise)
 * - Children keyed by nibble strings ("0" through "f")
 *
 * Branch node ≡ [branches, value]
 * 17th item stores a value & is used only if this node is terminating for its key
 *
 * @category Schemas
 * @since 0.2.0
 */
export const BranchNodeSchema: Schema.Schema<BranchNode, BranchNodeEncoded> =
  Schema.Struct({
    ...branchFields,
    children: Schema.Record({
      key: PatriciaNodeKeySchema,
      value: Schema.suspend(
        (): Schema.Schema<PatriciaNode, PatriciaNodeEncoded> =>
          PatriciaNodeSchema
      ),
    }),
  });

/**
 * PatriciaNode is a discriminated union of three node kinds.
 * Self-consistent, recursive, and idiomatic for Effect-TS schema system.
 *
 * Uses Schema.suspend() for mutual recursion:
 * - ExtensionNode → PatriciaNode (all types)
 * - BranchNode → PatriciaNode (all types)
 *
 * @category Schemas
 * @since 0.2.0
 */
export const PatriciaNodeSchema: Schema.Schema<
  PatriciaNode,
  PatriciaNodeEncoded
> = Schema.Union(LeafNodeSchema, ExtensionNodeSchema, BranchNodeSchema);

// ============================================================================
// PATRICIA TRIE SCHEMA
// ============================================================================

/**
 * PatriciaTrie is the main trie container with root node and metadata.
 *
 * @category Schemas
 * @since 0.2.0
 */
export const PatriciaTrieSchema = Schema.Struct({
  root: PatriciaNodeSchema,
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});

export type PatriciaTrie = Schema.Schema.Type<typeof PatriciaTrieSchema>;

// ============================================================================
// ERRORS
// ============================================================================

export class PatriciaTrieError extends Schema.TaggedError<PatriciaTrieError>()(
  "PatriciaTrieError",
  {
    message: Schema.String,
  }
) {}

export class KeyNotFoundError extends Schema.TaggedError<KeyNotFoundError>()(
  "KeyNotFoundError",
  {
    message: Schema.String,
    key: PatriciaNodeKeySchema,
  }
) {}

export class InvalidNodeError extends Schema.TaggedError<InvalidNodeError>()(
  "InvalidNodeError",
  {
    message: Schema.String,
    reason: Schema.String,
  }
) {}

// ============================================================================
// GUARDS (Type Predicates)
// ============================================================================

/**
 * Type guard for PatriciaNode.
 *
 * @category Guards
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * if (PatriciaTrie.isPatriciaNode(value)) {
 *   // value is PatriciaNode
 * }
 */
export const isPatriciaNode = Schema.is(PatriciaNodeSchema);

/**
 * Refine to BranchNode.
 *
 * @category Guards
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * if (PatriciaTrie.isBranch(node)) {
 *   // node is BranchNode
 * }
 */
export const isBranch = (self: PatriciaNode): self is BranchNode =>
  self._tag === "branch";

/**
 * Refine to ExtensionNode.
 *
 * @category Guards
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * if (PatriciaTrie.isExtension(node)) {
 *   // node is ExtensionNode
 * }
 */
export const isExtension = (self: PatriciaNode): self is ExtensionNode =>
  self._tag === "extension";

/**
 * Refine to LeafNode.
 *
 * @category Guards
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * if (PatriciaTrie.isLeaf(node)) {
 *   // node is LeafNode
 * }
 */
export const isLeaf = (self: PatriciaNode): self is LeafNode =>
  self._tag === "leaf";

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/**
 * Create a branch node (up to 16 children, optional value).
 *
 * Invariants:
 * - Children keyed by nibble strings ("0" through "f")
 * - Path compression handled by insert/delete operations
 *
 * @category Constructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 * import * as Option from "effect/Option"
 *
 * const branch = PatriciaTrie.makeBranch({
 *   children: {},
 *   value: Option.some("branch_value")
 * })
 */
export const makeBranch = (props?: {
  children?: Record<string, PatriciaNode>;
  value?: Option.Option<unknown>;
}): BranchNode => {
  const children = props?.children ?? {};
  const value = props?.value ?? Option.none();

  return {
    _tag: "branch" as const,
    children,
    value,
  };
};

/**
 * Create an extension node (nibbles + single child).
 *
 * Invariants:
 * - `nibbles.length ≥ 1` (must store at least one nibble)
 * - Must have exactly one child (`nextNode`)
 * - Extension nodes are structural, not terminal
 *
 * @category Constructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const ext = PatriciaaTrie.makeExtension({
 *   nibbles: [6, 1, 6, 2],
 *   nextNode: childNode
 * })
 */
export const makeExtension = (props: {
  nibbles: readonly number[];
  nextNode: PatriciaNode;
}): ExtensionNode => {
  const { nibbles, nextNode } = props;

  // Validate: extension must have nibbles.length >= 1
  if (nibbles.length === 0) {
    throw new InvalidNodeError({
      message: "Extension node must have at least one nibble",
      reason: "empty_extension_path",
    });
  }

  // Validate: all nibbles must be in range [0, 15]
  for (const n of nibbles) {
    if (typeof n !== "number" || n < 0 || n > 15) {
      throw new InvalidNodeError({
        message: "All nibbles must be in range [0, 15]",
        reason: "invalid_nibble_range",
      });
    }
  }

  return {
    _tag: "extension" as const,
    nibbles: [...nibbles],
    nextNode,
  };
};

/**
 * Create a leaf node (nibbles + value).
 *
 * Invariants:
 * - Must have no children (terminal node)
 * - `value` must be Some(v) (stores actual value)
 * - `nibbles` can be any length ≥ 0
 *
 * @category Constructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const leaf = PatriciaTrie.makeLeaf({
 *   nibbles: [6, 1, 6, 2],
 *   value: "my_value"
 * })
 */
export const makeLeaf = (props: {
  nibbles: Nibbles;
  // TODO `value` is one of:
  // - `AccountState`
  // - `TransactionData`
  value: unknown;
}): LeafNode => {
  const { nibbles, value } = props;

  // Validate: all nibbles must be in range [0, 15]
  for (const n of nibbles) {
    if (typeof n !== "number" || n < 0 || n > 15) {
      throw new InvalidNodeError({
        message: "All nibbles must be in range [0, 15]",
        reason: "invalid_nibble_range",
      });
    }
  }

  return {
    _tag: "leaf" as const,
    nibbles: [...nibbles],
    value: Option.some(value),
  };
};

/**
 * Create an empty trie (root is empty branch).
 *
 * @category Constructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const trie = PatriciaTrie.makeEmptyTrie()
 */
export const makeEmptyTrie = (): PatriciaTrie => ({
  root: makeBranch(),
  size: 0,
});

/**
 * Create a trie from a root node.
 *
 * @category Constructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const trie = PatriciaTrie.makeTrie(rootNode, 5)
 */
export const makeTrie = (root: PatriciaNode, size: number): PatriciaTrie => ({
  root,
  size,
});

// ============================================================================
// EQUIVALENCE
// ============================================================================

/**
 * Structural equality for PatriciaNode.
 *
 * Compares nodes based on:
 * - Tag equality
 * - Node-specific properties (nibbles, value, children, nextNode)
 * - Recursive child comparison
 *
 * @category Equivalence
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const node1 = PatriciaTrie.makeLeaf({ nibbles: [1, 2], value: "test" })
 * const node2 = PatriciaTrie.makeLeaf({ nibbles: [1, 2], value: "test" })
 *
 * if (PatriciaTrie.NodeEquivalence(node1, node2)) {
 *   // Structurally equal
 * }
 */
export const NodeEquivalence: Equivalence.Equivalence<PatriciaNode> =
  Equivalence.make((a, b) => {
    // Check tag
    if (a._tag !== b._tag) return false;

    // Leaf: compare nibbles and value
    if (a._tag === "leaf" && b._tag === "leaf") {
      if (a.nibbles.length !== b.nibbles.length) return false;
      if (!Array.every(a.nibbles, (n, i) => n === b.nibbles[i])) return false;
      return a.value === b.value;
    }

    // Extension: compare nibbles and nextNode recursively
    if (a._tag === "extension" && b._tag === "extension") {
      if (a.nibbles.length !== b.nibbles.length) return false;
      if (!Array.every(a.nibbles, (n, i) => n === b.nibbles[i])) return false;
      return NodeEquivalence(a.nextNode, b.nextNode);
    }

    // Branch: compare children and value
    if (a._tag === "branch" && b._tag === "branch") {
      // Check value
      if (Option.isSome(a.value) !== Option.isSome(b.value)) return false;
      if (Option.isSome(a.value) && Option.isSome(b.value)) {
        if (a.value.value !== b.value.value) return false;
      }

      // Check children count
      const aKeys = Object.keys(a.children);
      const bKeys = Object.keys(b.children);
      if (aKeys.length !== bKeys.length) return false;

      // Check each child recursively
      for (const key of aKeys) {
        if (!(key in b.children)) return false;
        if (!NodeEquivalence(a.children[key], b.children[key])) return false;
      }

      return true;
    }

    return false;
  });

/**
 * Structural equality for PatriciaTrie.
 *
 * @category Equivalence
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const trie1 = PatriciaTrie.makeEmptyTrie()
 * const trie2 = PatriciaTrie.makeEmptyTrie()
 *
 * if (PatriciaTrie.TrieEquivalence(trie1, trie2)) {
 *   // Structurally equal
 * }
 */
export const TrieEquivalence: Equivalence.Equivalence<PatriciaTrie> =
  Equivalence.make((a, b) => {
    if (a.size !== b.size) return false;
    return NodeEquivalence(a.root, b.root);
  });

// ============================================================================
// DESTRUCTORS (Safe extraction of inner values)
// ============================================================================

/**
 * Get the trie size (number of key-value pairs).
 *
 * @category Destructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const size = PatriciaTrie.getSize(trie)
 */
export const getSize = (trie: PatriciaTrie): number => trie.size;

/**
 * Get the root node.
 *
 * @category Destructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const root = PatriciaTrie.getRoot(trie)
 */
export const getRoot = (trie: PatriciaTrie): PatriciaNode => trie.root;

/**
 * Get the nibbles from a leaf or extension node.
 *
 * @category Destructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const nibbles = PatriciaTrie.getNibbles(node)
 */
export const getNibbles = (node: LeafNode | ExtensionNode): readonly number[] =>
  node.nibbles;

/**
 * Get the children from a branch node.
 *
 * @category Destructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const children = PatriciaTrie.getChildren(branchNode)
 */
export const getChildren = (node: BranchNode): Record<string, PatriciaNode> =>
  node.children;

/**
 * Get the next node from an extension node.
 *
 * @category Destructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const nextNode = PatriciaTrie.getNextNode(extensionNode)
 */
export const getNextNode = (node: ExtensionNode): PatriciaNode => node.nextNode;

/**
 * Get the value from a leaf or branch node.
 *
 * @category Destructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const value = PatriciaTrie.getValue(node)
 */
export const getValue = (
  node: LeafNode | BranchNode
): unknown | Option.Option<unknown> => node.value;

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * PatriciaTrie constructors and types.
 *
 * Utilities like lookup, hasKey, and getAllKeys are available from
 * the PatriciaQuery service in patricia_service.ts.
 *
 * Hashing and proof generation available from PatriciaHash service.
 *
 * @category API
 * @since 0.2.0
 */
export const PatriciaTrie = {
  Schema: PatriciaTrieSchema,
  makeEmpty: makeEmptyTrie,
  make: makeTrie,
  getSize,
  getRoot,
  Equivalence: TrieEquivalence,
};

/**
 * PatriciaNode constructors and types.
 *
 * @category API
 * @since 0.2.0
 */
export const PatriciaNode = {
  Schema: PatriciaNodeSchema,
  BranchSchema: BranchNodeSchema,
  ExtensionSchema: ExtensionNodeSchema,
  LeafSchema: LeafNodeSchema,
  makeBranch,
  makeExtension,
  makeLeaf,
  isBranch,
  isExtension,
  isLeaf,
  getNibbles,
  getChildren,
  getNextNode,
  getValue,
  Equivalence: NodeEquivalence,
};
