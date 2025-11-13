/**
 * Patricia Display Capability Tests
 *
 * Tests the PatriciaDisplayService capability for tree visualization.
 * Uses @effect/vitest for proper Effect testing patterns.
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Patricia from "../../src/minimal_blockchain/domain/patricia_trie";
import * as PatriciaService from "../../src/minimal_blockchain/domain/patricia_service";

// ============================================================================
// DISPLAY CAPABILITY TESTS
// ============================================================================

describe("PatriciaDisplayService", () => {
  it.effect(
    "should display ethereum state trie with shared nibble prefix",
    () =>
      Effect.gen(function* () {
        const display = yield* PatriciaService.PatriciaDisplayService;
        const insert = yield* PatriciaService.PatriciaInsert;

        // Build trie with 4 Ethereum addresses sharing prefix "a7"
        // These represent state trie entries:
        // - a711355 (45.0 ETH)
        // - a77dd37 (1.00 WEI)
        // - a7f9365 (1.1 ETH)
        // - a77d397 (0.12 ETH)

        let trie = Patricia.PatriciaTrie.makeEmpty();
        trie = insert.insert(trie, "0xa711355", "45.0 ETH");
        trie = insert.insert(trie, "0xa77dd37", "1.00 WEI");
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
        assert.isDefined(
          Patricia.PatriciaTrie.getRoot(trie),
          "Trie should have a root node"
        );

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
      }).pipe(Effect.provide(PatriciaService.PatriciaServiceLive))
  );

  it.effect("should display single leaf node", () =>
    Effect.gen(function* () {
      const display = yield* PatriciaService.PatriciaDisplayService;

      const leaf = Patricia.makeLeaf({
        nibbles: [10, 11, 12],
        value: "test-value",
      });
      const nodeDisplay = display.displayNode(leaf);

      console.log("\n📄 SINGLE LEAF NODE:");
      console.log(nodeDisplay);

      // Verify leaf display format
      assert.isTrue(
        nodeDisplay.includes("Leaf"),
        "Display should contain 'Leaf' tag"
      );
      assert.isTrue(
        nodeDisplay.includes("10,11,12"),
        "Display should show nibbles as '10,11,12'"
      );
      assert.isTrue(
        nodeDisplay.includes("test-value"),
        "Display should show the leaf value"
      );
    }).pipe(Effect.provide(PatriciaService.PatriciaServiceLive))
  );

  it.effect("should display branch node with children", () =>
    Effect.gen(function* () {
      const display = yield* PatriciaService.PatriciaDisplayService;

      const leaf1 = Patricia.makeLeaf({ nibbles: [1], value: "value1" });
      const leaf2 = Patricia.makeLeaf({ nibbles: [2], value: "value2" });
      const branch = Patricia.makeBranch({
        children: { a: leaf1, b: leaf2 },
        value: undefined,
      });
      const nodeDisplay = display.displayNode(branch);

      console.log("\n🌳 BRANCH NODE WITH CHILDREN:");
      console.log(nodeDisplay);

      // Verify branch display format
      assert.isTrue(
        nodeDisplay.includes("Branch"),
        "Display should contain 'Branch' tag"
      );
      assert.isTrue(
        nodeDisplay.includes("children=2"),
        "Display should show 'children=2'"
      );
      assert.isTrue(
        nodeDisplay.includes("[a]"),
        "Display should show child key '[a]'"
      );
      assert.isTrue(
        nodeDisplay.includes("[b]"),
        "Display should show child key '[b]'"
      );
    }).pipe(Effect.provide(PatriciaService.PatriciaServiceLive))
  );

  it.effect("should display extension node with next node", () =>
    Effect.gen(function* () {
      const display = yield* PatriciaService.PatriciaDisplayService;

      const leaf = Patricia.makeLeaf({ nibbles: [5, 6], value: "leaf-value" });
      const extension = Patricia.makeExtension({
        nibbles: [3, 4],
        nextNode: leaf,
      });
      const nodeDisplay = display.displayNode(extension);

      console.log("\n🔗 EXTENSION NODE:");
      console.log(nodeDisplay);

      // Verify extension display format
      assert.isTrue(
        nodeDisplay.includes("Extension"),
        "Display should contain 'Extension' tag"
      );
      assert.isTrue(
        nodeDisplay.includes("3,4"),
        "Display should show extension nibbles '3,4'"
      );
      // Extension should display its child (the leaf)
      assert.isTrue(
        nodeDisplay.includes("Leaf"),
        "Display should show the child leaf node"
      );
    }).pipe(Effect.provide(PatriciaService.PatriciaServiceLive))
  );

  it.effect("should display empty trie", () =>
    Effect.gen(function* () {
      const display = yield* PatriciaService.PatriciaDisplayService;

      const emptyTrie = Patricia.PatriciaTrie.makeEmpty();
      const trieDisplay = display.displayTrie(emptyTrie);

      console.log("\n🗂️  EMPTY TRIE:");
      console.log(trieDisplay);

      // Verify empty trie display
      assert.isTrue(
        trieDisplay.includes("size=0"),
        "Empty trie should show size=0"
      );
      assert.isTrue(
        trieDisplay.includes("Trie(root="),
        "Empty trie should still have Trie format"
      );
    }).pipe(Effect.provide(PatriciaService.PatriciaServiceLive))
  );
});
