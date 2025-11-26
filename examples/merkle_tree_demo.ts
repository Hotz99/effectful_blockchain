import { Effect, Chunk, Either, Layer, DateTime, Option } from "effect";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as MerkleTree from "../src/entities/merkle_tree";
import * as MerkleHashingService from "../src/services/merkle_tree";
import * as MerkleTreeService from "../src/services/merkle_tree";
import * as Event from "../src/entities/event";
import * as BlockchainService from "../src/services/blockchain";
import * as BlockService from "../src/services/block";

const program = Effect.gen(function* () {
  yield* Effect.logInfo(
    `${"=".repeat(70)}\nMERKLE TREE DEMONSTRATION\n${"=".repeat(70)}\n`
  );
  // TODO delegate timestamping to service ?
  // possible solution: https://effect.website/play#065aa86f2f7d
  const timestamp = yield* DateTime.now;

  const transactions = Chunk.make(
    Event.makeTransaction({
      timestamp,
      senderAddress: "Alice",
      receiverAddress: "Bob",
      amount: 10,
    }),
    Event.makeTransaction({
      timestamp,
      senderAddress: "Charlie",
      receiverAddress: "David",
      amount: 5,
    }),
    Event.makeTransaction({
      timestamp,
      senderAddress: "Eve",
      receiverAddress: "Frank",
      amount: 3,
    }),
    Event.makeTransaction({
      timestamp,
      senderAddress: "Grace",
      receiverAddress: "Henry",
      amount: 7,
    })
  );

  yield* Effect.log("\nBuilding Merkle tree with 4 transactions...");

  // Build the tree
  const builder = yield* MerkleTreeService.MerkleBuild;
  const tree = builder.build(transactions);

  yield* Effect.log("\nTree Structure:");
  const display = yield* MerkleTreeService.MerkleDisplayService;
  yield* Effect.log(display.displayTree(tree));

  yield* Effect.logInfo(
    `\n${"=".repeat(70)}\nMERKLE PROOF DEMONSTRATION\n${"=".repeat(70)}\n`
  );

  const dataIndex = yield* Either.match(
    MerkleTree.makeValidDataIndex(tree, 1),
    {
      // TODO are default success/error channels more idiomatic here ?
      onLeft: (error) => Effect.fail(error),
      onRight: (index) => Effect.succeed(index),
    }
  );

  yield* Effect.log(
    `\nProving inclusion of: '${Chunk.unsafeGet(transactions, dataIndex)}'`
  );

  const merkleProof = yield* MerkleTreeService.MerkleProofService;
  const proof = merkleProof.generateProof(tree, dataIndex);
  const merkleRoot = yield* MerkleTreeService.MerkleRoot;
  const rootHash = merkleRoot.getRootHash(tree);

  yield* Effect.log(`\nMerkle Proof (index ${dataIndex}):`);
  let stepNum = 1;
  for (const step of proof.steps) {
    const position = step.isLeft ? "LEFT" : "RIGHT";
    yield* Effect.log(
      ` Step ${stepNum}: ${step.siblingHash.slice(
        0,
        16
      )}... (sibling on ${position})`
    );
    stepNum++;
  }

  // TODO this seems useless, perhaps time it and display results ?
  yield* Effect.log("Validating proof...");
  const isValid = merkleProof.validateProof(proof, rootHash);
  yield* Effect.log(`Result: ${isValid ? "VALID" : "INVALID"}`);

  yield* Effect.log("\nTesting with tampered data...");
  const tamperedProof = { ...proof, data: "Alice sends 100 ETH to Bob" };
  const isTamperedValid = merkleProof.validateProof(tamperedProof, rootHash);
  yield* Effect.log(`Result: ${isTamperedValid ? "VALID" : "INVALID"}`);

  // description (no actual computation) of verification (proof of inclusion) work efficiency
  // without a Merkle structure: linear scans over all items
  // with a Merkle tree: checks hash path from leaf to root, which is logarithmic in complexity
  yield* Effect.logInfo(
    `\n${"=".repeat(70)}\nEFFICIENCY COMPARISON\n${"=".repeat(70)}\n`
  );

  const sizes = [10, 100, 1000, 10000];
  yield* Effect.log(
    "\n| Data Blocks | Without Merkle | With Merkle | Efficiency Gain |"
  );
  yield* Effect.log(
    "|-------------|----------------|-------------|------------------|"
  );

  for (const size of sizes) {
    const withoutMerkle = size; // Need to check all blocks
    const withMerkle = Math.ceil(Math.log2(size)); // Only need log(n) hashes
    const efficiency = withoutMerkle / withMerkle;
    yield* Effect.log(
      `| ${String(size).padStart(11)} | ${String(withoutMerkle).padStart(
        14
      )} | ${String(withMerkle).padStart(11)} | ${efficiency
        .toFixed(1)
        .padStart(14)}x |`
    );
  }

  // BLOCKCHAIN DEMONSTRATION
  yield* Effect.logInfo(
    `\n${"=".repeat(70)}\nBLOCKCHAIN WITH MERKLE TREES\n${"=".repeat(70)}\n`
  );

  const blockchainService = yield* BlockchainService.BlockchainService;

  yield* Effect.log("\nInitializing blockchain with max 5 events per block...");

  const initialState = yield* blockchainService.initState(
    5,
    Option.some("Blockchain demo with Merkle verification")
  );

  const stateWithEvents = yield* blockchainService.appendEvents(initialState, [
    Event.makeUserRegistered({
      timestamp,
      user: "bob",
      email: "bob@example.com",
    }),
    Event.makeUserRegistered({
      timestamp,
      user: "alice",
      email: "alice@example.com",
    }),
    Event.makeUserLogin({ timestamp, user: "alice", ip: "192.168.1.1" }),
    Event.makeItemPurchased({
      timestamp,
      user: "alice",
      item: "laptop",
      price: 1200,
    }),
    Event.makeUserLogin({ timestamp, user: "bob", ip: "192.168.1.5" }),
    Event.makeItemPurchased({
      timestamp,
      user: "bob",
      item: "phone",
      price: 800,
    }),
    Event.makeUserLogout({ timestamp, user: "alice" }),
    Event.makeUserRegistered({
      timestamp,
      user: "charlie",
      email: "charlie@example.com",
    }),
  ]);

  yield* Effect.log(
    "Added 8 events to blockchain (auto-created block after 5)"
  );

  const finalState = yield* blockchainService.forceCreateBlock(stateWithEvents);

  yield* Effect.log("Forced block creation for remaining pending events");

  yield* Effect.log(`\nBlockchain has ${Chunk.size(finalState.chain)} blocks`);

  yield* Either.match(blockchainService.validateChain(finalState), {
    onLeft: (error) =>
      Effect.log(
        `Validation failed: ${error._tag} at Block ${error.blockIdx}, Reason: ${error.reason}`
      ),
    onRight: () => Effect.log("Chain validation: PASSED"),
  });

  // Demonstrate Merkle proof on blockchain block
  yield* Effect.logInfo(
    `\n${"=".repeat(70)}\nMERKLE PROOF ON BLOCKCHAIN BLOCK\n${"=".repeat(70)}\n`
  );

  const blockWithEvents = Chunk.unsafeGet(finalState.chain, 1);
  yield* Effect.log(
    `\nGenerating proof for event in Block #1 (${Chunk.size(
      blockWithEvents.events
    )} events)`
  );

  const blockTree = builder.build(blockWithEvents.events);
  const blockDataIndex = yield* Either.match(
    MerkleTree.makeValidDataIndex(blockTree, 1),
    {
      onLeft: (error) => Effect.fail(error),
      onRight: (index) => Effect.succeed(index),
    }
  );

  const blockProof = merkleProof.generateProof(blockTree, blockDataIndex);
  const blockRootHash = merkleRoot.getRootHash(blockTree);

  yield* Effect.log(
    `Event: ${Chunk.unsafeGet(blockWithEvents.events, blockDataIndex)}`
  );
  yield* Effect.log(`Proof has ${blockProof.steps.length} steps`);
  yield* Effect.log(`Root hash: ${blockRootHash.slice(0, 16)}...`);

  const isBlockProofValid = merkleProof.validateProof(
    blockProof,
    blockRootHash
  );
  yield* Effect.log(`Verification: ${isBlockProofValid ? "VALID" : "INVALID"}`);
});

program.pipe(
  Effect.provide(
    Layer.mergeAll(
      Layer.provide(
        BlockchainService.BlockchainServiceLive,
        Layer.provide(
          BlockService.BlockServiceLive,
          Layer.provide(
            MerkleTreeService.MerkleServiceLive,
            MerkleHashingService.HashingServiceLive
          )
        )
      ),
      Layer.provide(
        MerkleTreeService.MerkleServiceLive,
        MerkleHashingService.HashingServiceLive
      )
    )
  ),
  NodeRuntime.runMain
);
