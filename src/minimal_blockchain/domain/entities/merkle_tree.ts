/**
 * Merkle Tree — Pure Model & Schema
 *
 * This module contains:
 * - Entity schemas (MerkleNode, MerkleTree)
 * - Branded types (MerkleHash)
 * - Pure constructors and utilities
 * - No side effects, no async logic, no logging
 */

import { Schema, Brand, Chunk, Option, Either } from "effect";

// ============================================================================
// BRANDED TYPES
// ============================================================================

/**
 * Branded MerkleHash - validated as 64-character hexadecimal string
 */
export type MerkleHash = string & Brand.Brand<"MerkleHash">;

export const MerkleHash = Brand.refined<MerkleHash>(
  (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s),
  (s) => Brand.error(`Expected 64-char hex string, got: ${s}`)
);

export const MerkleHashSchema = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{64}$/),
  Schema.brand("MerkleHash")
);

/**
 * Branded ValidDataIndex - validated to be non-negative integer
 * Validation of bounds for specific tree happens in makeValidDataIndex
 */
export const ValidDataIndexSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("ValidDataIndex")
);

export type ValidDataIndex = typeof ValidDataIndexSchema.Type;

/**
 * Create a valid data index for a specific tree
 * Validates index is within [0, leafCount)
 */
export const makeValidDataIndex = (
  tree: MerkleTree,
  index: number
): Either.Either<ValidDataIndex, IndexOutOfBoundsError> => {
  const leafCount = Chunk.size(tree.leaves);
  return index < 0 || index >= leafCount
    ? Either.left(
        new IndexOutOfBoundsError({
          message: `Index ${index} out of bounds [0, ${leafCount - 1}]`,
          index,
          maxIndex: leafCount - 1,
        })
      )
    : Either.right(index as ValidDataIndex);
};

// TODO vet this BS
/**
 * MerkleNode represents a node in the Merkle tree
 */
interface MerkleNodeSchemaType extends Schema.Struct.Fields {
  hash: typeof MerkleHashSchema;
  left: Schema.OptionFromNullOr<Schema.suspend<MerkleNode, MerkleNode, never>>;
  right: Schema.OptionFromNullOr<Schema.suspend<MerkleNode, MerkleNode, never>>;
  isLeaf: typeof Schema.Boolean;
  data: Schema.OptionFromNullOr<typeof Schema.String>;
}

export const MerkleNodeSchema: Schema.Struct<MerkleNodeSchemaType> =
  Schema.Struct({
    hash: MerkleHashSchema,
    left: Schema.OptionFromNullOr(Schema.suspend((): any => MerkleNodeSchema)),
    right: Schema.OptionFromNullOr(Schema.suspend((): any => MerkleNodeSchema)),
    isLeaf: Schema.Boolean,
    data: Schema.OptionFromNullOr(Schema.String),
  });

export type MerkleNode = Schema.Schema.Type<typeof MerkleNodeSchema>;

/**
 * MerkleTree contains the root and metadata
 */
export const MerkleTreeSchema = Schema.Struct({
  root: MerkleNodeSchema,
  leaves: Schema.NonEmptyChunk(MerkleNodeSchema),
  dataBlocks: Schema.NonEmptyChunk(Schema.String),
});

export type MerkleTree = Schema.Schema.Type<typeof MerkleTreeSchema>;

/**
 * MerkleProof is a path from leaf to root
 * Each step contains: (siblingHash, isLeft)
 * - isLeft: true means sibling is on the left
 */
export const MerkleProofStepSchema = Schema.Struct({
  siblingHash: MerkleHashSchema,
  // TODO replace with `Either` ?
  isLeft: Schema.Boolean,
});

export type MerkleProofStep = Schema.Schema.Type<typeof MerkleProofStepSchema>;

export const MerkleProofSchema = Schema.Struct({
  steps: Schema.Chunk(MerkleProofStepSchema),
  dataIndex: Schema.Number,
  data: Schema.String,
});

export type MerkleProof = Schema.Schema.Type<typeof MerkleProofSchema>;

// ============================================================================
// ERRORS
// ============================================================================

export class MerkleError extends Schema.TaggedError<MerkleError>()(
  "MerkleError",
  {
    message: Schema.String,
  }
) {}

export class InvalidProofError extends Schema.TaggedError<InvalidProofError>()(
  "InvalidProofError",
  {
    message: Schema.String,
    expected: MerkleHashSchema,
    actual: MerkleHashSchema,
  }
) {}

export class EmptyDataError extends Schema.TaggedError<EmptyDataError>()(
  "EmptyDataError",
  {
    message: Schema.String,
  }
) {}

export class IndexOutOfBoundsError extends Schema.TaggedError<IndexOutOfBoundsError>()(
  "IndexOutOfBoundsError",
  {
    message: Schema.String,
    index: Schema.Number,
    maxIndex: Schema.Number,
  }
) {}

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/**
 * Create a leaf node
 */
export const makeLeafNode = (data: string, hash: MerkleHash): MerkleNode => ({
  hash,
  left: Option.none(),
  right: Option.none(),
  isLeaf: true,
  data: Option.some(data),
});

/**
 * Create an internal (non-leaf) node
 */
export const makeInternalNode = (
  left: MerkleNode,
  right: MerkleNode,
  hash: MerkleHash
): MerkleNode => ({
  hash,
  left: Option.some(left),
  right: Option.some(right),
  isLeaf: false,
  data: Option.none(),
});

/**
 * Create a Merkle tree
 */
export const makeMerkleTree = (
  root: MerkleNode,
  leaves: Chunk.NonEmptyChunk<MerkleNode>,
  dataBlocks: Chunk.NonEmptyChunk<string>
): MerkleTree => ({
  root,
  leaves,
  dataBlocks,
});

/**
 * Create a proof step
 */
export const makeProofStep = (
  siblingHash: MerkleHash,
  isLeft: boolean
): MerkleProofStep => ({
  siblingHash,
  isLeft,
});

/**
 * Create a Merkle proof
 */
export const makeMerkleProof = (
  steps: Chunk.Chunk<MerkleProofStep>,
  dataIndex: number,
  data: string
): MerkleProof => ({
  steps,
  dataIndex,
  data,
});

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get the root hash from a tree
 */
export const getRootHash = (tree: MerkleTree): MerkleHash =>
  (tree.root as any).hash as MerkleHash;

/**
 * Get the number of leaves in a tree
 */
export const getLeafCount = (tree: MerkleTree): number =>
  Chunk.size(tree.leaves);

/**
 * Get the height of the tree (log2 of leaves, rounded up)
 */
export const getTreeHeight = (tree: MerkleTree): number => {
  const leafCount = getLeafCount(tree);
  return leafCount <= 1 ? 1 : Math.ceil(Math.log2(leafCount));
};

/**
 * Get the data block at a specific index
 */
export const getDataBlock = (
  tree: MerkleTree,
  index: number
): Option.Option<string> => Chunk.get(tree.dataBlocks, index);

/**
 * Check if an index is valid for the tree
 */
export const isValidIndex = (tree: MerkleTree, index: number): boolean =>
  index >= 0 && index < Chunk.size(tree.dataBlocks);

// ============================================================================
// EXPORTS
// ============================================================================

export const MerkleTree = {
  Schema: MerkleTreeSchema,
  make: makeMerkleTree,
  getRootHash,
  getLeafCount,
  getTreeHeight,
  getDataBlock,
  isValidIndex,
};

export const MerkleNode = {
  Schema: MerkleNodeSchema,
  makeLeaf: makeLeafNode,
  makeInternal: makeInternalNode,
};

export const MerkleProof = {
  Schema: MerkleProofSchema,
  make: makeMerkleProof,
  makeStep: makeProofStep,
};
