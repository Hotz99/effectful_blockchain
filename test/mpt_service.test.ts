import { assert, describe, it } from "@effect/vitest";
import {
  Effect,
  Layer,
  Option,
  Schema,
  Arbitrary,
  FastCheck,
  Match,
} from "effect";
import { assertSome, assertNone } from "./utils/helpers";
import * as MPT from "../src/entities/mpt";
import * as MPTService from "../src/services/mpt";
import * as MerkleHashingService from "../src/services/merkle_tree";

const fc = FastCheck;

const TestLayer = Layer.mergeAll(
  MPTService.MPTQueryLive,
  MPTService.PatriciaInsertLive,
  MPTService.PatriciaDeleteLive,
  Layer.provide(MPTService.MPTHashLive, MerkleHashingService.HashingServiceLive),
  MPTService.PatriciaDisplayServiceLive
);

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

describe("MPT Property-Based Tests", () => {
  describe("Canonical compression property", () => {
    const HexKey = Schema.String.pipe(
      Schema.pattern(/^0x[0-9a-f]+$/),
      // TODO why minLength = 3 ?
      Schema.minLength(3),
      Schema.maxLength(12)
    );

    const KeyValue = Schema.Struct({
      key: HexKey,
      value: Schema.NonEmptyString,
    });

    // derived from `docs/mpt_pbt.md`
    const isCanonical = (node: MPT.PatriciaNode): boolean =>
      Match.typeTags<MPT.PatriciaNode>()({
        Branch: (b) => {
          const children = Object.values(b.children);
          if (children.length === 1 && Option.isNone(b.value)) return false;
          return children.every(isCanonical);
        },

        Extension: (e) =>
          e.sharedPrefix.length === 0 || e.nextNode._tag === "Extension"
            ? false
            : isCanonical(e.nextNode),

        Leaf: (l) => l.keyEnd.length > 0,
      })(node);

    it.effect("maintains canonical structure after mutations", () =>
      Effect.gen(function* () {
        const ins = yield* MPTService.MPTInsert;
        const del = yield* MPTService.PatriciaDelete;

        // arbitrary operations
        const Operations = Schema.Array(
          Schema.Union(
            Schema.TaggedStruct("insert", {
              data: KeyValue,
            }),
            Schema.TaggedStruct("delete", {
              key: HexKey,
            })
          )
        ).pipe(Schema.minItems(5), Schema.maxItems(20));

        yield* Effect.sync(() => {
          fc.assert(
            // predicate function
            // `fc.property` generates random inputs based on `Arbitrary.make(Operations)` schema
            fc.property(Arbitrary.make(Operations), (ops) => {
              let trie = MPT.makeEmptyTrie();

              for (const op of ops) {
                if (op._tag === "insert") {
                  trie = ins.insert(trie, op.data.key, op.data.value);
                } else {
                  trie = del.delete(trie, op.key);
                }
              }

              return isCanonical(trie.root);
            }),
            // added failing case for debugging
            // {
            //   seed: 350483222,
            //   path: "2:1:0:0:1:1:1:1:0:0:0:0:0:0:0:0:0:0:0:0:0:1:0:1:1",
            //   endOnFailure: true,
            // }
            { numRuns: 50 }
          );
        });
      }).pipe(Effect.provide(TestLayer))
    );
  });
});

// ============================================================================
// INSERT CAPABILITY TESTS
// ============================================================================

describe("PatriciaInsert", () => {
  it.effect("should insert single key-value pair", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const query = yield* MPTService.MPTQuery;

      const trie = MPT.makeEmptyTrie();
      const result = insert.insert(trie, "0xa1", "value1");

      assert.strictEqual(result.size, 1);
      assertSome(query.query(result, "0xa1"));
    }).pipe(Effect.provide(TestLayer))
  );
});

it.effect("should insert multiple keys with different prefixes", () =>
  Effect.gen(function* () {
    const insert = yield* MPTService.MPTInsert;
    const query = yield* MPTService.MPTQuery;

    let trie = MPT.makeEmptyTrie();
    trie = insert.insert(trie, "0xa1", "value1");
    trie = insert.insert(trie, "0xb2", "value2");
    trie = insert.insert(trie, "0xc3", "value3");

    assert.strictEqual(trie.size, 3);
    assertSome(query.query(trie, "0xa1"));
    assertSome(query.query(trie, "0xb2"));
    assertSome(query.query(trie, "0xc3"));
  }).pipe(Effect.provide(TestLayer))
);

it.effect("should insert keys with shared prefix", () =>
  Effect.gen(function* () {
    const insert = yield* MPTService.MPTInsert;
    const query = yield* MPTService.MPTQuery;

    let trie = MPT.makeEmptyTrie();
    trie = insert.insert(trie, "0xa711355", "45.0 ETH");
    trie = insert.insert(trie, "0xa77d337", "1.00 WEI");
    trie = insert.insert(trie, "0xa7f9365", "1.1 ETH");

    assert.strictEqual(trie.size, 3);
    assertSome(query.query(trie, "0xa711355"));
    assertSome(query.query(trie, "0xa77d337"));
    assertSome(query.query(trie, "0xa7f9365"));
  }).pipe(Effect.provide(TestLayer))
);

it.effect("should update existing key value", () =>
  Effect.gen(function* () {
    const insert = yield* MPTService.MPTInsert;
    const query = yield* MPTService.MPTQuery;

    let trie = MPT.makeEmptyTrie();
    trie = insert.insert(trie, "0xa1", "value1");
    trie = insert.insert(trie, "0xa1", "value2");

    assert.strictEqual(trie.size, 1);
    const node = query.query(trie, "0xa1");
    assertSome(node, "Expected updated value to exist");
  }).pipe(Effect.provide(TestLayer))
);

it.effect("should handle keys that are prefixes of each other", () =>
  Effect.gen(function* () {
    const insert = yield* MPTService.MPTInsert;
    const query = yield* MPTService.MPTQuery;

    let trie = MPT.makeEmptyTrie();
    trie = insert.insert(trie, "0xa1", "short");
    trie = insert.insert(trie, "0xa12", "medium");
    trie = insert.insert(trie, "0xa123", "long");

    assert.strictEqual(trie.size, 3);

    Option.match(query.query(trie, "0xa1"), {
      onNone: () => assert.fail("expected key 0xa1 to exist"),
      onSome: (node) => {
        const value =
          node._tag === "Branch"
            ? Option.getOrThrow(node.value)
            : (node as MPT.LeafNode).value;
        assert.strictEqual(value, "short");
      },
    });

    Option.match(query.query(trie, "0xa12"), {
      onNone: () => assert.fail("expected key 0xa12 to exist"),
      onSome: (node) => {
        const value =
          node._tag === "Branch"
            ? Option.getOrThrow(node.value)
            : (node as MPT.LeafNode).value;
        assert.strictEqual(value, "medium");
      },
    });

    Option.match(query.query(trie, "0xa123"), {
      onNone: () => assert.fail("expected key 0xa123 to exist"),
      onSome: (node) => {
        const value =
          node._tag === "Branch"
            ? Option.getOrThrow(node.value)
            : (node as MPT.LeafNode).value;
        assert.strictEqual(value, "long");
      },
    });
  }).pipe(Effect.provide(TestLayer))
);

it.effect("should compress nodes after deletions leave a single path", () =>
  Effect.gen(function* () {
    const insert = yield* MPTService.MPTInsert;
    const del = yield* MPTService.PatriciaDelete;
    const query = yield* MPTService.MPTQuery;
    const display = yield* MPTService.PatriciaDisplayService;

    // trie with two keys sharing a prefix so a branch exists
    let trie = MPT.makeEmptyTrie();
    trie = insert.insert(trie, "0xa11", "value1");
    trie = insert.insert(trie, "0xa12", "value2");

    trie = del.delete(trie, "0xa12");

    assert.strictEqual(trie.size, 1);
    assertSome(query.query(trie, "0xa11"));

    // TODO asserting display contents is brittle - improve by checking structure instead
    const rootDisplay = display.displayNode(trie.root);
    assert.isTrue(
      rootDisplay.includes("[L]") || rootDisplay.includes("[E]"),
      "Root should be a leaf or extension after compression"
    );
  }).pipe(Effect.provide(TestLayer))
);

// ============================================================================
// QUERY CAPABILITY TESTS
// ============================================================================

describe("PatriciaQuery", () => {
  it.effect("should return None for non-existent key", () =>
    Effect.gen(function* () {
      const query = yield* MPTService.MPTQuery;

      const trie = MPT.makeEmptyTrie();
      const result = query.query(trie, "0xa1");

      assertNone(result, "Expected non-existent key to return None");
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should find inserted key", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const query = yield* MPTService.MPTQuery;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xa1b2c3", "test-value");

      const result = query.query(trie, "0xa1b2c3");
      assertSome(result, "Expected inserted key to be found");
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should distinguish between similar keys", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const query = yield* MPTService.MPTQuery;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xabc1", "value1");
      trie = insert.insert(trie, "0xabd1", "value2");

      assertSome(query.query(trie, "0xabc1"));
      assertSome(query.query(trie, "0xabd1"));
      assertNone(
        query.query(trie, "0xabe1"),
        "Expected non-existent key 0xabe1 to not exist"
      );
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle prefix queries correctly", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const query = yield* MPTService.MPTQuery;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xabc1", "value");

      // Prefix should not match
      assertNone(
        query.query(trie, "0xab"),
        "Expected prefix 0xab to not match"
      );
      // Full key should match
      assertSome(query.query(trie, "0xabc1"));
      // Extension should not match
      assertNone(
        query.query(trie, "0xabc12"),
        "Expected extension 0xabc12 to not match"
      );
    }).pipe(Effect.provide(TestLayer))
  );
});

// ============================================================================
// DELETE CAPABILITY TESTS
// ============================================================================

describe("PatriciaDelete", () => {
  it.effect("should delete existing key", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const del = yield* MPTService.PatriciaDelete;
      const query = yield* MPTService.MPTQuery;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xa1", "value1");
      assertSome(query.query(trie, "0xa1"));

      trie = del.delete(trie, "0xa1");

      assert.strictEqual(trie.size, 0);
      assertNone(
        query.query(trie, "0xa1"),
        "Expected deleted key to not exist"
      );
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle deleting non-existent key", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const del = yield* MPTService.PatriciaDelete;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xa1", "value1");

      const result = del.delete(trie, "0xb2");

      assert.strictEqual(result.size, 1);
      assert.strictEqual(result, trie);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should delete from multiple keys", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const del = yield* MPTService.PatriciaDelete;
      const query = yield* MPTService.MPTQuery;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xa11", "value1");
      trie = insert.insert(trie, "0xa22", "value2");
      trie = insert.insert(trie, "0xa33", "value3");

      trie = del.delete(trie, "0xa22");

      assert.strictEqual(trie.size, 2);
      assertSome(query.query(trie, "0xa11"));
      assertNone(
        query.query(trie, "0xa22"),
        "Expected deleted key 0xa22 to not exist"
      );
      assertSome(query.query(trie, "0xa33"));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should handle deleting all keys", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const del = yield* MPTService.PatriciaDelete;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xa11", "value1");
      trie = insert.insert(trie, "0xa22", "value2");

      trie = del.delete(trie, "0xa11");
      trie = del.delete(trie, "0xa22");

      assert.strictEqual(trie.size, 0);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should delete key with shared prefix", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const del = yield* MPTService.PatriciaDelete;
      const query = yield* MPTService.MPTQuery;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xabc1", "value1");
      trie = insert.insert(trie, "0xabd1", "value2");
      trie = insert.insert(trie, "0xabe1", "value3");

      trie = del.delete(trie, "0xabd1");

      assert.strictEqual(trie.size, 2);
      assertSome(query.query(trie, "0xabc1"));
      assertNone(
        query.query(trie, "0xabd1"),
        "Expected deleted key 0xabd1 to not exist"
      );
      assertSome(query.query(trie, "0xabe1"));
    }).pipe(Effect.provide(TestLayer))
  );
});

// ============================================================================
// HASH CAPABILITY TESTS
// ============================================================================

describe("PatriciaHash", () => {
  it.effect("should compute deterministic hash for empty trie", () =>
    Effect.gen(function* () {
      const hash = yield* MPTService.MPTHash;

      const trie = MPT.makeEmptyTrie();
      const rootHash1 = hash.calculateRootHash(trie);
      const rootHash2 = hash.calculateRootHash(trie);

      assert.strictEqual(rootHash1, rootHash2);
      assert.isTrue(rootHash1.length > 0);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should compute deterministic hash for populated trie", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const hash = yield* MPTService.MPTHash;

      let trie = MPT.makeEmptyTrie();
      trie = insert.insert(trie, "0xa11", "value1");
      trie = insert.insert(trie, "0xa22", "value2");

      const rootHash1 = hash.calculateRootHash(trie);
      const rootHash2 = hash.calculateRootHash(trie);

      assert.strictEqual(rootHash1, rootHash2);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should produce different hashes for different content", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const hash = yield* MPTService.MPTHash;

      let trie1 = MPT.makeEmptyTrie();
      trie1 = insert.insert(trie1, "0xa1", "value1");

      let trie2 = MPT.makeEmptyTrie();
      trie2 = insert.insert(trie2, "0xa1", "value2");

      const hash1 = hash.calculateRootHash(trie1);
      const hash2 = hash.calculateRootHash(trie2);

      assert.notStrictEqual(hash1, hash2);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should produce different hashes for different keys", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const hash = yield* MPTService.MPTHash;

      let trie1 = MPT.makeEmptyTrie();
      trie1 = insert.insert(trie1, "0xa1", "value");

      let trie2 = MPT.makeEmptyTrie();
      trie2 = insert.insert(trie2, "0xb1", "value");

      const hash1 = hash.calculateRootHash(trie1);
      const hash2 = hash.calculateRootHash(trie2);

      assert.notStrictEqual(hash1, hash2);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should produce same hash regardless of insertion order", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const hash = yield* MPTService.MPTHash;

      // First order: a11, a22, a33
      let trie1 = MPT.makeEmptyTrie();
      trie1 = insert.insert(trie1, "0xa11", "value1");
      trie1 = insert.insert(trie1, "0xa22", "value2");
      trie1 = insert.insert(trie1, "0xa33", "value3");

      // Different order: a33, a11, a22
      let trie2 = MPT.makeEmptyTrie();
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
      const display = yield* MPTService.PatriciaDisplayService;

      const trie = MPT.makeEmptyTrie();
      const trieDisplay = display.displayTrie(trie);

      assert.isTrue(trieDisplay.includes("size=0"));
      assert.isTrue(trieDisplay.includes("Trie(root="));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect("should display single leaf trie", () =>
    Effect.gen(function* () {
      const insert = yield* MPTService.MPTInsert;
      const display = yield* MPTService.PatriciaDisplayService;

      let trie = MPT.makeEmptyTrie();
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
        const display = yield* MPTService.PatriciaDisplayService;
        const insert = yield* MPTService.MPTInsert;

        // Build trie with 4 Ethereum addresses sharing prefix "a7"
        // ie 4 leaf nodes:
        // k = a711355; v = "45.0 ETH"
        // k = a77d337; v = "1.00 WEI"
        // k = a7f9365; v = "1.1 ETH"
        // k = a77d397; v = "0.12 ETH"

        let trie = MPT.makeEmptyTrie();
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
      const display = yield* MPTService.PatriciaDisplayService;

      // Test leaf node display
      const leaf = MPT.makeLeaf({
        keyEnd: [1, 2, 3],
        value: "leaf-value",
      });
      const leafDisplay = display.displayNode(leaf);
      assert.isTrue(leafDisplay.includes("[L]"));

      // Test branch node display
      const branch = MPT.makeBranch({
        children: {},
        value: Option.some("branch-value"),
      });
      const branchDisplay = display.displayNode(branch);
      assert.isTrue(branchDisplay.includes("[B]"));

      // Test extension node display
      const ext = MPT.makeExtension({
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
        const display = yield* MPTService.PatriciaDisplayService;
        const insert = yield* MPTService.MPTInsert;

        // Build trie with 3 keys where each is a prefix of the next:
        // k = a1; v = "short"
        // k = a12; v = "medium"
        // k = a123; v = "long"

        let trie = MPT.makeEmptyTrie();
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
