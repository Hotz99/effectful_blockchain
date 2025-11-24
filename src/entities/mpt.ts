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
 * // TODO find implementation reference for each of the below
 *
 * ### Key / Nibble Representation
 * - Keys are represented as nibble arrays: `nibbles: readonly number[]` where each element is an integer between 0 and 15 inclusive.
 * - Internal representation uses these nibble arrays (not string keys) to traverse the trie.
 *
 * ### Node Kinds and Path Segmentation
 * - `kind` ∈ { "branch", "extension", "leaf" }.
 *   - `kind = "branch"`: the node may have 0 to 16 children and `value` may be `Some(v)` or `None`, nibbles is empty array.
 *   - `kind = "extension"`: the node has exactly one child and `value = None`, nibbles.length ≥ 1.
 *   - `kind = "leaf"`: the node has no children (`children.size = 0`) and `value = Some(v)`.
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
import * as Primitives from "./primitives";
import { Match } from "effect";

// TODO refine this
const NodeKeySchema = Schema.String;

export type NodeKey = typeof NodeKeySchema.Type;

const NibbleSchema = Schema.Number.pipe(Schema.int(), Schema.between(0, 15));

// 1 hex digit = 4 bits = 1 nibble ∈ { 0,1 }^4 = [ 0, 15 ]
export const NibblesSchema = Schema.Array(NibbleSchema);
// const NibblesSchema = Schema.Array(NibbleSchema).pipe(Schema.minItems(1));

export type Nibbles = typeof NibblesSchema.Type;

// TODO refine & add more variants of `value`:
// - `AccountBalance`: a positive real number
// - `AccountState`
// - `TransactionData`
export const NodeValueSchema = Schema.Union(
  Primitives.PositiveIntSchema,
  Schema.String
);

export type NodeValue = typeof NodeValueSchema.Type;

// ============================================================================
// PATRICIA NODE TYPES & SCHEMAS
// ============================================================================

// Base fields for each node type

const branchBaseFields = {
  // TODO can we remove `_tag` from here and just use in `TaggedStruct` ?
  _tag: Schema.Literal("Branch"),
  // all `ExtensionNode`s derive from a parent `BranchNode` & have no `value`
  // this enables storing a `value` with `key` == `nibblesOfParentBranchNode`
  // if `Option.isSome(ExtensionNode.value)`, key for this node is the nibbles of said node
  value: Schema.OptionFromNullOr(Schema.Unknown),
};

const extensionBaseFields = {
  _tag: Schema.Literal("Extension"),
  sharedPrefix: NibblesSchema,
};

const leafBaseFields = {
  _tag: Schema.Literal("Leaf"),
  keyEnd: NibblesSchema,
  value: NodeValueSchema,
};

// Type interfaces (decoded)
export interface LeafNode extends Schema.Struct.Type<typeof leafBaseFields> {}

export interface ExtensionNode
  extends Schema.Struct.Type<typeof extensionBaseFields> {
  readonly nextNode: PatriciaNode;
}

export interface BranchNode
  extends Schema.Struct.Type<typeof branchBaseFields> {
  readonly children: Record<NodeKey, PatriciaNode>;
}

export type PatriciaNode = LeafNode | ExtensionNode | BranchNode;

// Encoded interfaces (for schema serialization)
interface LeafNodeEncoded
  extends Schema.Struct.Encoded<typeof leafBaseFields> {}

interface ExtensionNodeEncoded
  extends Schema.Struct.Encoded<typeof extensionBaseFields> {
  readonly nextNode: PatriciaNodeEncoded;
}

interface BranchNodeEncoded
  extends Schema.Struct.Encoded<typeof branchBaseFields> {
  readonly children: Record<NodeKey, PatriciaNodeEncoded>;
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
export const LeafNodeSchema = Schema.TaggedStruct("Leaf", {
  keyEnd: NibblesSchema,
  value: NodeValueSchema,
});

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
export const BranchNodeSchema = Schema.TaggedStruct("Branch", {
  ...branchBaseFields,
  children: Schema.Record({
    key: NodeKeySchema,
    value: Schema.suspend(
      (): Schema.Schema<PatriciaNode, PatriciaNodeEncoded> => PatriciaNodeSchema
    ),
  }),
});

export const ExtensionNodeSchema = Schema.TaggedStruct("Extension", {
  ...extensionBaseFields,
  // TODO why not specify as BranchNodeSchema ?
  // nextNode: BranchNodeSchema,
  nextNode: Schema.suspend(
    (): Schema.Schema<PatriciaNode, PatriciaNodeEncoded> => PatriciaNodeSchema
  ),
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
export const PatriciaNodeSchema = Schema.Union(
  LeafNodeSchema,
  ExtensionNodeSchema,
  BranchNodeSchema
);

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
  size: Schema.Int,
});

export type PatriciaTrie = typeof PatriciaTrieSchema.Type;

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
    key: NodeKeySchema,
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
// GUARDS
// ============================================================================

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
export const isBranch = Schema.is(BranchNodeSchema);

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
export const isExtension = Schema.is(ExtensionNodeSchema);

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
export const isLeaf = Schema.is(LeafNodeSchema);

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
// export const makeBranch = Schema.decodeSync(BranchNodeSchema);
export const makeBranch = (props: Omit<BranchNode, "_tag">): BranchNode =>
  BranchNodeSchema.make({ _tag: "Branch", ...props });

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
export const makeExtension = (
  props: Omit<ExtensionNode, "_tag">
): ExtensionNode => ExtensionNodeSchema.make({ _tag: "Extension", ...props });

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
export const makeLeaf = (props: Omit<LeafNode, "_tag">): LeafNode =>
  LeafNodeSchema.make({ _tag: "Leaf", ...props });

/**
 * Create an empty trie (root is empty branch).
 *
 * Canonical empty-trie root per Ethereum’s Yellow Paper is the empty string `""`, with Keccak-256 hash `0x56e81f17…` .
 *
 * @category Constructors
 * @since 0.2.0
 * @example
 * import * as PatriciaTrie from "./patricia_trie"
 *
 * const trie = PatriciaTrie.makeEmptyTrie()
 */
export const makeEmptyTrie = (): PatriciaTrie =>
  PatriciaTrieSchema.make({
    root: makeBranch({ children: {}, value: Option.none() }),
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
export const makeTrie = (
  root: PatriciaNode,
  size: typeof Schema.Int.Type
): PatriciaTrie =>
  PatriciaTrieSchema.make({
    root,
    size,
  });

// ============================================================================
// EQUIVALENCE
// ============================================================================

export const NibblesEquivalence: Equivalence.Equivalence<Nibbles> =
  Equivalence.make(
    (a, b) => a.length === b.length && Array.every(a, (n, i) => n === b[i])
  );

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
    if (a._tag !== b._tag) return false;

    return Match.typeTags<PatriciaNode>()({
      Branch: (ba) => {
        const bb = b as BranchNode;
        // value slot
        if (Option.isSome(ba.value) !== Option.isSome(bb.value)) return false;
        if (Option.isSome(ba.value)) {
          if (ba.value !== bb.value) return false;
        }

        // children keys
        const aKeys = Object.keys(ba.children);
        const bKeys = Object.keys(bb.children);
        if (aKeys.length !== bKeys.length) return false;

        // per-child structural equivalence
        for (const k of aKeys) {
          if (!(k in bb.children)) return false;
          if (!NodeEquivalence(ba.children[k], bb.children[k])) return false;
        }

        return true;
      },

      Extension: (ea) => {
        const eb = b as ExtensionNode;
        return (
          NibblesEquivalence(ea.sharedPrefix, eb.sharedPrefix) &&
          NodeEquivalence(ea.nextNode, eb.nextNode)
        );
      },

      Leaf: (la) => {
        const lb = b as LeafNode;
        return (
          NibblesEquivalence(la.keyEnd, lb.keyEnd) && la.value === lb.value
        );
      },
    })(a);
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
  Equivalence.make(
    (a, b) => NodeEquivalence(a.root, b.root) && a.size === b.size
  );
