export { MerkleBuild as MerkleBuildService, MerkleBuildLive } from "./build";
export { MerkleRoot, MerkleRootLive } from "./root";
export { MerkleProofService, MerkleProofServiceLive } from "./proof";
export { MerkleDisplayService, MerkleDisplayServiceLive } from "./display";
export { HashingService, HashingServiceLive } from "./hash";

/**
 * Merkle Service — Effect-Based Capabilities
 *
 * This module provides fine-grained capability services for Merkle tree operations.
 * Each capability represents exactly one cohesive set of operations.
 *
 * Capabilities:
 * - MerkleBuild — builds trees from data blocks
 * - MerkleRoot — computes and manages root hashes
 * - MerkleProofService — generates and verifies proofs
 * - MerkleDisplayService — displays trees and proofs
 *
 * Dependencies:
 * - MerkleBuild and MerkleProofService require HashingService for hash computation
 *
 * @module MerkleService
 * @since 0.2.0
 */

import { Layer } from "effect";
import { MerkleBuildLive } from "./build";
import { MerkleRootLive } from "./root";
import { MerkleProofServiceLive } from "./proof";
import { MerkleDisplayServiceLive } from "./display";

/**
 * All Merkle service layers combined for convenience
 *
 * Requires: HashingService
 *
 * @category Services
 * @since 0.2.0
 */
export const MerkleServiceLive = Layer.mergeAll(
  MerkleBuildLive,
  MerkleRootLive,
  MerkleProofServiceLive,
  MerkleDisplayServiceLive
);
