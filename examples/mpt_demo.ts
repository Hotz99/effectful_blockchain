import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Effect, Layer, Option } from "effect";
import * as MPT from "../src/entities/mpt";
import * as MPTService from "../src/services/mpt";

/**
 * Count node types in the trie structure.
 */
const countNodeTypes = (node: MPT.PatriciaNode): Record<string, number> => {
  const counts = { Branch: 0, Extension: 0, Leaf: 0 };

  const visit = (n: MPT.PatriciaNode): void => {
    counts[n._tag]++;
    if (n._tag === "Branch") {
      Object.values(n.children).forEach(visit);
    } else if (n._tag === "Extension") {
      visit(n.nextNode);
    }
  };

  visit(node);
  return counts;
};

/**
 * Calculate total serialized byte size of the trie.
 */
const calculateTrieSize = (node: MPT.PatriciaNode): number => {
  const serialized = JSON.stringify(node);
  return new TextEncoder().encode(serialized).length;
};

const program = Effect.gen(function* () {
  const insertService = yield* MPTService.MPTInsert;
  const displayService = yield* MPTService.PatriciaDisplayService;

  yield* Effect.logInfo(
    `${"=".repeat(70)}\nPatricia Trie Compression Demo\n${"=".repeat(70)}\n`
  );

  // Step 1: Create initial trie and insert sequence of keys
  yield* Effect.log("");
  yield* Effect.log(
    "Step 1: Inserting keys to create branch and extension nodes"
  );
  yield* Effect.log("-".repeat(70));

  let trie = MPT.makeTrie(
    MPT.makeBranch({
      children: {},
      value: Option.none(),
    }),
    0
  );

  // Insert a sequence of keys that create branches and extensions
  const keys = [
    "0x0011",
    "0x0012",
    "0x0013",
    "0x0020",
    "0x0021",
    "0x0122",
    "0x0123",
    "0x0200",
  ];

  for (const key of keys) {
    const value = parseInt(key, 16);
    trie = insertService.insert(trie, key, value);
    yield* Effect.log(`Inserted key: ${key} -> value: ${value}`);
  }

  yield* Effect.log("");
  yield* Effect.log(
    `Initial trie structure: ${displayService.displayTrie(trie)}`
  );

  const beforeCounts = countNodeTypes(trie.root);
  const beforeSize = calculateTrieSize(trie.root);

  yield* Effect.log("");
  yield* Effect.logInfo("Node counts BEFORE compression:");
  yield* Effect.logInfo(`  Branch nodes:   ${beforeCounts.Branch}`);
  yield* Effect.logInfo(`  Extension nodes: ${beforeCounts.Extension}`);
  yield* Effect.logInfo(`  Leaf nodes:     ${beforeCounts.Leaf}`);
  yield* Effect.logInfo(
    `  Total nodes:    ${
      beforeCounts.Branch + beforeCounts.Extension + beforeCounts.Leaf
    }`
  );
  yield* Effect.logInfo(`  Serialized size: ${beforeSize} bytes`);

  // Step 2: Mutate a subset of keys
  yield* Effect.log("");
  yield* Effect.log("Step 2: Mutating a subset of keys");
  yield* Effect.log("-".repeat(70));

  const keysToMutate = ["0x0011", "0x0020", "0x0122"];
  for (const key of keysToMutate) {
    const newValue = parseInt(key, 16) + 10000;
    trie = insertService.insert(trie, key, newValue);
    yield* Effect.log(`Updated key: ${key} -> new value: ${newValue}`);
  }

  yield* Effect.log("");
  yield* Effect.log(
    `Trie after mutations: ${displayService.displayTrie(trie)}`
  );

  const afterMutationCounts = countNodeTypes(trie.root);
  const afterMutationSize = calculateTrieSize(trie.root);

  yield* Effect.logInfo("Node counts AFTER mutations (before compression):");
  yield* Effect.logInfo(`  Branch nodes:   ${afterMutationCounts.Branch}`);
  yield* Effect.logInfo(`  Extension nodes: ${afterMutationCounts.Extension}`);
  yield* Effect.logInfo(`  Leaf nodes:     ${afterMutationCounts.Leaf}`);
  yield* Effect.logInfo(
    `  Total nodes:    ${
      afterMutationCounts.Branch +
      afterMutationCounts.Extension +
      afterMutationCounts.Leaf
    }`
  );
  yield* Effect.logInfo(`  Serialized size: ${afterMutationSize} bytes`);

  // Step 3: Run compression step
  yield* Effect.log("");
  yield* Effect.log("Step 3: Running compression");
  yield* Effect.log("-".repeat(70));

  const compressedRoot = MPTService.compressNode(trie.root);
  const compressedTrie = MPT.makeTrie(compressedRoot, trie.size);

  yield* Effect.log(
    `Compressed trie: ${displayService.displayTrie(compressedTrie)}`
  );

  const afterCompressionCounts = countNodeTypes(compressedRoot);
  const afterCompressionSize = calculateTrieSize(compressedRoot);

  yield* Effect.logInfo("Node counts AFTER compression:");
  yield* Effect.logInfo(`  Branch nodes:   ${afterCompressionCounts.Branch}`);
  yield* Effect.logInfo(
    `  Extension nodes: ${afterCompressionCounts.Extension}`
  );
  yield* Effect.logInfo(`  Leaf nodes:     ${afterCompressionCounts.Leaf}`);
  yield* Effect.logInfo(
    `  Total nodes:    ${
      afterCompressionCounts.Branch +
      afterCompressionCounts.Extension +
      afterCompressionCounts.Leaf
    }`
  );
  yield* Effect.logInfo(`  Serialized size: ${afterCompressionSize} bytes`);

  // Step 4 & 5: Print comparison of before and after
  yield* Effect.logInfo(
    `\nStep 4 & 5: Compression Summary\n${"=".repeat(70)}\n`
  );

  const branchDiff = afterCompressionCounts.Branch - beforeCounts.Branch;
  const extensionDiff =
    afterCompressionCounts.Extension - beforeCounts.Extension;
  const leafDiff = afterCompressionCounts.Leaf - beforeCounts.Leaf;
  const sizeDiff = afterCompressionSize - beforeSize;
  const sizeReduction = (
    ((beforeSize - afterCompressionSize) / beforeSize) *
    100
  ).toFixed(2);

  yield* Effect.logInfo("Node Type Changes:");
  yield* Effect.logInfo(
    `  Branch nodes:   ${beforeCounts.Branch} → ${
      afterCompressionCounts.Branch
    } (${branchDiff > 0 ? "+" : ""}${branchDiff})`
  );
  yield* Effect.logInfo(
    `  Extension nodes: ${beforeCounts.Extension} → ${
      afterCompressionCounts.Extension
    } (${extensionDiff > 0 ? "+" : ""}${extensionDiff})`
  );
  yield* Effect.logInfo(
    `  Leaf nodes:     ${beforeCounts.Leaf} → ${afterCompressionCounts.Leaf} (${
      leafDiff > 0 ? "+" : ""
    }${leafDiff})`
  );
  yield* Effect.logInfo(
    `  Total nodes:    ${
      beforeCounts.Branch + beforeCounts.Extension + beforeCounts.Leaf
    } → ${
      afterCompressionCounts.Branch +
      afterCompressionCounts.Extension +
      afterCompressionCounts.Leaf
    }`
  );

  yield* Effect.log("");
  yield* Effect.logInfo("Serialized Size:");
  yield* Effect.logInfo(`  Before compression: ${beforeSize} bytes`);
  yield* Effect.logInfo(`  After compression:  ${afterCompressionSize} bytes`);
  yield* Effect.logInfo(
    `  Difference:         ${sizeDiff > 0 ? "+" : ""}${sizeDiff} bytes`
  );
  // TODO this yields negative reduction ....
  yield* Effect.logInfo(`  Reduction:          ${sizeReduction}%`);

  yield* Effect.log("=".repeat(70));
});

const MainLive = Layer.mergeAll(
  MPTService.PatriciaInsertLive,
  MPTService.PatriciaDisplayServiceLive
);

program.pipe(Effect.provide(MainLive), NodeRuntime.runMain);
