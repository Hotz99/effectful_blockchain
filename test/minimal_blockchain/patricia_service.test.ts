/**
 * Patricia Service Tests
 *
 * Comprehensive test suite for PATRICIA trie service capabilities.
 * Tests all core operations: insert, delete, query, hash, and display.
 *
 * Uses @effect/vitest for Effect-based testing with proper service layers.
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import * as Patricia from "../../src/minimal_blockchain/domain/entities/patricia_trie";
import * as PatriciaService from "../../src/minimal_blockchain/domain/services/patricia_service";
import { HashingServiceLive } from "../../src/minimal_blockchain/domain/crypto";

const TestLayer = PatriciaService.PatriciaServiceLive.pipe(
  Layer.provide(HashingServiceLive)
);

// TODO test design constraints (post-mutation compression, etc.)

// ============================================================================
// INSERT CAPABILITY TESTS
// ============================================================================

describe("PatriciaInsert", () => {
  it.effect("should insert single key-value pair", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      const trie = Patricia.PatriciaTrie.makeEmpty();
      const result = insert.insert(trie, "0xa1", "value1");

      assert.strictEqual(result.size, 1);
      assert.isTrue(query.hasKey(result, "0xa1"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should insert multiple keys with different prefixes", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa1", "value1");
      trie = insert.insert(trie, "0xb2", "value2");
      trie = insert.insert(trie, "0xc3", "value3");

      assert.strictEqual(trie.size, 3);
      assert.isTrue(query.hasKey(trie, "0xa1"));
      assert.isTrue(query.hasKey(trie, "0xb2"));
      assert.isTrue(query.hasKey(trie, "0xc3"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should insert keys with shared prefix", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa711355", "45.0 ETH");
      trie = insert.insert(trie, "0xa77d337", "1.00 WEI");
      trie = insert.insert(trie, "0xa7f9365", "1.1 ETH");

      assert.strictEqual(trie.size, 3);
      assert.isTrue(query.hasKey(trie, "0xa711355"));
      assert.isTrue(query.hasKey(trie, "0xa77d337"));
      assert.isTrue(query.hasKey(trie, "0xa7f9365"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should update existing key value", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa1", "value1");
      trie = insert.insert(trie, "0xa1", "value2");

      assert.strictEqual(trie.size, 1);
      const node = query.lookup(trie, "0xa1");

      // TODO assert option value, not just existence
      assert.isTrue(Option.isSome(node));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle keys that are prefixes of each other", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa1", "short");
      trie = insert.insert(trie, "0xa12", "medium");
      trie = insert.insert(trie, "0xa123", "long");

      // TODO assert with queries, not just hasKey
      // or is this conflating test responsibilities ?
      assert.strictEqual(trie.size, 3);
      assert.isTrue(query.hasKey(trie, "0xa1"));
      assert.isTrue(query.hasKey(trie, "0xa12"));
      assert.isTrue(query.hasKey(trie, "0xa123"));
    }).pipe(Effect.provide(TestLayer))
  );
});

// ============================================================================
// QUERY CAPABILITY TESTS
// ============================================================================

describe("PatriciaQuery", () => {
  it.effect("should return None for non-existent key", () =>
    Effect.gen(function* () {
      const query = yield* PatriciaService.PatriciaQuery;

      const trie = Patricia.PatriciaTrie.makeEmpty();
      const result = query.lookup(trie, "0xa1");

      assert.isTrue(Option.isNone(result));
      assert.isFalse(query.hasKey(trie, "0xa1"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should find inserted key", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa1b2c3", "test-value");

      const result = query.lookup(trie, "0xa1b2c3");

      assert.isTrue(Option.isSome(result));
      assert.isTrue(query.hasKey(trie, "0xa1b2c3"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should distinguish between similar keys", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xabc1", "value1");
      trie = insert.insert(trie, "0xabd1", "value2");

      assert.isTrue(query.hasKey(trie, "0xabc1"));
      assert.isTrue(query.hasKey(trie, "0xabd1"));
      assert.isFalse(query.hasKey(trie, "0xabe1"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle prefix queries correctly", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xabc1", "value");

      // Prefix should not match
      assert.isFalse(query.hasKey(trie, "0xab"));
      // Full key should match
      assert.isTrue(query.hasKey(trie, "0xabc1"));
      // Extension should not match
      assert.isFalse(query.hasKey(trie, "0xabc12"));
    }).pipe(Effect.provide(TestLayer))
  );
});

// ============================================================================
// DELETE CAPABILITY TESTS
// ============================================================================

describe("PatriciaDelete", () => {
  it.effect("should delete existing key", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const del = yield* PatriciaService.PatriciaDelete;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa1", "value1");
      assert.isTrue(query.hasKey(trie, "0xa1"));

      trie = del.delete(trie, "0xa1");

      assert.strictEqual(trie.size, 0);
      assert.isFalse(query.hasKey(trie, "0xa1"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle deleting non-existent key", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const del = yield* PatriciaService.PatriciaDelete;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa1", "value1");

      const result = del.delete(trie, "0xb2");

      assert.strictEqual(result.size, 1);
      assert.strictEqual(result, trie);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should delete from multiple keys", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const del = yield* PatriciaService.PatriciaDelete;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa11", "value1");
      trie = insert.insert(trie, "0xa22", "value2");
      trie = insert.insert(trie, "0xa33", "value3");

      trie = del.delete(trie, "0xa22");

      assert.strictEqual(trie.size, 2);
      assert.isTrue(query.hasKey(trie, "0xa11"));
      assert.isFalse(query.hasKey(trie, "0xa22"));
      assert.isTrue(query.hasKey(trie, "0xa33"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle deleting all keys", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const del = yield* PatriciaService.PatriciaDelete;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa11", "value1");
      trie = insert.insert(trie, "0xa22", "value2");

      trie = del.delete(trie, "0xa11");
      trie = del.delete(trie, "0xa22");

      assert.strictEqual(trie.size, 0);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should delete key with shared prefix", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const del = yield* PatriciaService.PatriciaDelete;
      const query = yield* PatriciaService.PatriciaQuery;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xabc1", "value1");
      trie = insert.insert(trie, "0xabd1", "value2");
      trie = insert.insert(trie, "0xabe1", "value3");

      trie = del.delete(trie, "0xabd1");

      assert.strictEqual(trie.size, 2);
      assert.isTrue(query.hasKey(trie, "0xabc1"));
      assert.isFalse(query.hasKey(trie, "0xabd1"));
      assert.isTrue(query.hasKey(trie, "0xabe1"));
    }).pipe(Effect.provide(TestLayer))
  );
});

// ============================================================================
// HASH CAPABILITY TESTS
// ============================================================================

describe("PatriciaHash", () => {
  it.effect("should compute deterministic hash for empty trie", () =>
    Effect.gen(function* () {
      const hash = yield* PatriciaService.PatriciaHash;

      const trie = Patricia.PatriciaTrie.makeEmpty();
      const rootHash1 = hash.calculateRootHash(trie);
      const rootHash2 = hash.calculateRootHash(trie);

      assert.strictEqual(rootHash1, rootHash2);
      assert.isTrue(rootHash1.length > 0);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should compute deterministic hash for populated trie", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const hash = yield* PatriciaService.PatriciaHash;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xa11", "value1");
      trie = insert.insert(trie, "0xa22", "value2");

      const rootHash1 = hash.calculateRootHash(trie);
      const rootHash2 = hash.calculateRootHash(trie);

      assert.strictEqual(rootHash1, rootHash2);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should produce different hashes for different content", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const hash = yield* PatriciaService.PatriciaHash;

      let trie1 = Patricia.PatriciaTrie.makeEmpty();
      trie1 = insert.insert(trie1, "0xa1", "value1");

      let trie2 = Patricia.PatriciaTrie.makeEmpty();
      trie2 = insert.insert(trie2, "0xa1", "value2");

      const hash1 = hash.calculateRootHash(trie1);
      const hash2 = hash.calculateRootHash(trie2);

      assert.notStrictEqual(hash1, hash2);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should produce different hashes for different keys", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const hash = yield* PatriciaService.PatriciaHash;

      let trie1 = Patricia.PatriciaTrie.makeEmpty();
      trie1 = insert.insert(trie1, "0xa1", "value");

      let trie2 = Patricia.PatriciaTrie.makeEmpty();
      trie2 = insert.insert(trie2, "0xb1", "value");

      const hash1 = hash.calculateRootHash(trie1);
      const hash2 = hash.calculateRootHash(trie2);

      assert.notStrictEqual(hash1, hash2);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should produce same hash regardless of insertion order", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const hash = yield* PatriciaService.PatriciaHash;

      // First order: a11, a22, a33
      let trie1 = Patricia.PatriciaTrie.makeEmpty();
      trie1 = insert.insert(trie1, "0xa11", "value1");
      trie1 = insert.insert(trie1, "0xa22", "value2");
      trie1 = insert.insert(trie1, "0xa33", "value3");

      // Different order: a33, a11, a22
      let trie2 = Patricia.PatriciaTrie.makeEmpty();
      trie2 = insert.insert(trie2, "0xa33", "value3");
      trie2 = insert.insert(trie2, "0xa11", "value1");
      trie2 = insert.insert(trie2, "0xa22", "value2");

      const hash1 = hash.calculateRootHash(trie1);
      const hash2 = hash.calculateRootHash(trie2);

      assert.strictEqual(hash1, hash2);
    }).pipe(Effect.provide(TestLayer))
  );
});

// ============================================================================
// DISPLAY CAPABILITY TESTS
// ============================================================================

describe("PatriciaDisplayService", () => {
  it.effect("should display empty trie", () =>
    Effect.gen(function* () {
      const display = yield* PatriciaService.PatriciaDisplayService;

      const trie = Patricia.PatriciaTrie.makeEmpty();
      const trieDisplay = display.displayTrie(trie);

      assert.isTrue(trieDisplay.includes("size=0"));
      assert.isTrue(trieDisplay.includes("Trie(root="));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should display single leaf trie", () =>
    Effect.gen(function* () {
      const insert = yield* PatriciaService.PatriciaInsert;
      const display = yield* PatriciaService.PatriciaDisplayService;

      let trie = Patricia.PatriciaTrie.makeEmpty();
      trie = insert.insert(trie, "0xabc", "test-value");

      const trieDisplay = display.displayTrie(trie);
      const nodeDisplay = display.displayNode(trie.root);

      assert.isTrue(trieDisplay.includes("size=1"));
      assert.isTrue(nodeDisplay.length > 0);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect(
    "should display ethereum state trie with shared nibble prefix",
    () =>
      Effect.gen(function* () {
        const display = yield* PatriciaService.PatriciaDisplayService;
        const insert = yield* PatriciaService.PatriciaInsert;

        // Build trie with 4 Ethereum addresses sharing prefix "a7"
        // ie 4 leaf nodes:
        // k = a711355; v = "45.0 ETH"
        // k = a77d337; v = "1.00 WEI"
        // k = a7f9365; v = "1.1 ETH"
        // k = a77d397; v = "0.12 ETH"

        let trie = Patricia.PatriciaTrie.makeEmpty();
        trie = insert.insert(trie, "0xa711355", "45.0 ETH");
        trie = insert.insert(trie, "0xa77d337", "1.00 WEI");
        trie = insert.insert(trie, "0xa7f9365", "1.1 ETH");
        trie = insert.insert(trie, "0xa77d397", "0.12 ETH");

        // Display the trie using the capability
        const trieDisplay = display.displayTrie(trie);
        const rootNodeDisplay = display.displayNode(trie.root);

        // Log output for visual inspection
        console.log("\n🔄 ETHEREUM STATE TRIE (Shared Prefix a7):");
        console.log("\nTrie Overview:");
        console.log(trieDisplay);
        console.log("\nRoot Node Structure:");
        console.log(rootNodeDisplay);

        // Verify trie structure using assert methods
        assert.strictEqual(trie.size, 4, "Trie should contain 4 entries");
        assert.isDefined(trie.root, "Trie should have a root node");

        // Verify display output format
        assert.isTrue(
          trieDisplay.includes("Trie(root="),
          "Trie display should contain 'Trie(root='"
        );
        assert.isTrue(
          trieDisplay.includes("size=4"),
          "Trie display should show size=4"
        );
        assert.isDefined(
          rootNodeDisplay,
          "Root node display should be defined"
        );

        // Verify the display strings are non-empty
        assert.isTrue(
          trieDisplay.length > 0,
          "Trie display should not be empty"
        );
        assert.isTrue(
          rootNodeDisplay.length > 0,
          "Root node display should not be empty"
        );
      }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should display node types correctly", () =>
    Effect.gen(function* () {
      const display = yield* PatriciaService.PatriciaDisplayService;

      // Test leaf node display
      const leaf = Patricia.makeLeaf({
        keyEnd: [1, 2, 3],
        value: "leaf-value",
      });
      const leafDisplay = display.displayNode(leaf);
      assert.isTrue(leafDisplay.includes("[L]"));

      // Test branch node display
      const branch = Patricia.makeBranch({
        children: {},
        value: Option.some("branch-value"),
      });
      const branchDisplay = display.displayNode(branch);
      assert.isTrue(branchDisplay.includes("[B]"));

      // Test extension node display
      const ext = Patricia.makeExtension({
        sharedPrefix: [4, 5, 6],
        nextNode: leaf,
      });
      const extDisplay = display.displayNode(ext);
      assert.isTrue(extDisplay.includes("[E]"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect(
    "should display trie with keys that are prefixes of each other",
    () =>
      Effect.gen(function* () {
        const display = yield* PatriciaService.PatriciaDisplayService;
        const insert = yield* PatriciaService.PatriciaInsert;

        // Build trie with 3 keys where each is a prefix of the next:
        // k = a1; v = "short"
        // k = a12; v = "medium"
        // k = a123; v = "long"

        let trie = Patricia.PatriciaTrie.makeEmpty();
        trie = insert.insert(trie, "0xa1", "short");
        trie = insert.insert(trie, "0xa12", "medium");
        trie = insert.insert(trie, "0xa123", "long");

        // Display the trie using the capability
        const trieDisplay = display.displayTrie(trie);
        const rootNodeDisplay = display.displayNode(trie.root);

        // Log output for visual inspection
        console.log("\n🔗 PREFIX CHAIN TRIE (a1 → a12 → a123):");
        console.log("\nTrie Overview:");
        console.log(trieDisplay);
        console.log("\nRoot Node Structure:");
        console.log(rootNodeDisplay);

        // Verify trie structure using assert methods
        assert.strictEqual(trie.size, 3, "Trie should contain 3 entries");
        assert.isDefined(trie.root, "Trie should have a root node");

        // Verify display output format
        assert.isTrue(
          trieDisplay.includes("Trie(root="),
          "Trie display should contain 'Trie(root='"
        );
        assert.isTrue(
          trieDisplay.includes("size=3"),
          "Trie display should show size=3"
        );
        assert.isDefined(
          rootNodeDisplay,
          "Root node display should be defined"
        );

        // Verify the display strings are non-empty
        assert.isTrue(
          trieDisplay.length > 0,
          "Trie display should not be empty"
        );
        assert.isTrue(
          rootNodeDisplay.length > 0,
          "Root node display should not be empty"
        );
      }).pipe(Effect.provide(TestLayer))
  );
});
