import { assert, describe, it } from "@effect/vitest";
import { Effect, Chunk, DateTime } from "effect";
import * as Utils from "../../src/minimal_blockchain/utils";
import { Block } from "../../src/minimal_blockchain/domain/block";
import {
  Event,
  type Event as EventType,
} from "../../src/minimal_blockchain/domain/event";
import { Blockchain } from "../../src/minimal_blockchain/domain/blockchain";
import { createMockLogger } from "../utils/mockConsole";

describe("Utils - Display Utilities", () => {
  describe("shortenHash", () => {
    it("should shorten hash with default prefix and suffix", () => {
      const hash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";
      const result = Utils.shortenHash(hash);
      assert.strictEqual(result, "a1b...9t0");
    });

    it("should shorten hash with custom lengths", () => {
      const hash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";
      const result = Utils.shortenHash(hash, 5, 3);
      assert.strictEqual(result, "a1b2c...9t0");
    });

    it("should return full hash when too short", () => {
      const hash = "short";
      const result = Utils.shortenHash(hash, 10, 10);
      assert.strictEqual(result, hash);
    });
  });

  describe("displayChainSimple", () => {
    it("should display blockchain with genesis block in correct format", () =>
      Effect.gen(function* () {
        const genesisBlock = yield* Block.createGenesis();
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.empty(),
          2
        );

        const display = yield* Utils.displayChainSimple(state);
        const lines = display.split("\n");

        // Verify structure
        assert.strictEqual(lines.length, 3);

        // Line 1: Block numbers
        assert.strictEqual(lines[0], "[Block 0]");

        // Line 2: Hash line
        assert.isTrue(lines[1].startsWith("Hash: "));
        assert.isTrue(lines[1].includes("..."));

        // Line 3: Event count
        assert.strictEqual(lines[2], "Events: 1");
      }));

    it("should display multiple blocks with arrows", () =>
      Effect.gen(function* () {
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        let state = Blockchain.make(Chunk.make(genesisBlock), Chunk.empty(), 1);

        // Add event to create second block
        const event: EventType = Event.makeUserRegistered({
          _tag: "UserRegistered",
          timestamp,
          data: {
            user: "alice",
            email: "alice@example.com",
          },
        });
        state = yield* Blockchain.appendEvent(state, event);

        const display = yield* Utils.displayChainSimple(state);
        const lines = display.split("\n");

        // Verify structure
        assert.strictEqual(lines.length, 3);

        // Line 1: Should show both blocks with arrow
        assert.strictEqual(lines[0], "[Block 0] → [Block 1]");

        // Line 2: Should have two hash entries
        assert.isTrue(lines[1].includes("Hash: "));
        const hashCount = (lines[1].match(/Hash: /g) || []).length;
        assert.strictEqual(hashCount, 2);

        // Line 3: Should show event counts for both blocks
        assert.isTrue(lines[2].includes("Events: 1"));
        const eventCount = (lines[2].match(/Events: /g) || []).length;
        assert.strictEqual(eventCount, 2);
      }));

    it("should format with shortened hashes", () =>
      Effect.gen(function* () {
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.empty(),
          2
        );

        const display = yield* Utils.displayChainSimple(state);
        const lines = display.split("\n");

        // Hash line should use shortened format (default 3...3)
        const hashLine = lines[1];
        assert.isTrue(hashLine.includes("..."));

        // Extract hash portion and verify format
        const hashMatch = hashLine.match(/Hash: (.+)/);
        assert.isTrue(hashMatch !== null);
        if (hashMatch) {
          const hash = hashMatch[1];
          // Should be shortened (e.g., "abc...xyz")
          assert.isTrue(hash.length < 20); // Full hash would be 64 chars
        }
      }));
  });

  describe("displayChain", () => {
    it("should log blockchain visualization with structured data", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, logs, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.empty(),
          2
        );

        yield* Utils.displayChain(state).pipe(Effect.provide(mockLoggerLayer));

        // Should have logged the message
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0], "BLOCKCHAIN VISUALIZATION");

        // Should have structured annotations
        const logEntry = logs[0];
        assert.strictEqual(logEntry.spans.length, 1);
        assert.strictEqual(logEntry.spans[0], "displayChain");
      }));

    it("should work with pending events", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const event: EventType = Event.makeUserLogin({
          _tag: "UserLogin",
          timestamp,
          data: {
            user: "bob",
            ip: "192.168.1.1",
          },
        });
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.make(event),
          2
        );

        yield* Utils.displayChain(state).pipe(Effect.provide(mockLoggerLayer));

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0], "BLOCKCHAIN VISUALIZATION");
      }));
  });

  describe("displayStats", () => {
    it("should log blockchain statistics with structured data", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, logs, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.empty(),
          2
        );

        yield* Utils.displayStats(state).pipe(Effect.provide(mockLoggerLayer));

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0], "BLOCKCHAIN STATISTICS");

        const logEntry = logs[0];
        assert.strictEqual(logEntry.spans.length, 1);
        assert.strictEqual(logEntry.spans[0], "statistics");
      }));

    it("should work with multiple events", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const event: EventType = Event.makeItemPurchased({
          _tag: "ItemPurchased",
          timestamp,
          data: {
            user: "charlie",
            item: "book",
            price: 29.99,
          },
        });
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.make(event),
          2
        );

        yield* Utils.displayStats(state).pipe(Effect.provide(mockLoggerLayer));

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0], "BLOCKCHAIN STATISTICS");
      }));
  });

  describe("displayValidation", () => {
    it("should log valid blockchain confirmation", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, logs, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.empty(),
          2
        );

        yield* Utils.displayValidation(state).pipe(
          Effect.provide(mockLoggerLayer)
        );

        assert.strictEqual(messages.length, 1);
        assert.isTrue(messages[0].includes("VALID"));

        const logEntry = logs[0];
        assert.strictEqual(logEntry.spans.length, 1);
        assert.strictEqual(logEntry.spans[0], "validation");
      }));

    it("should handle validation with pending events", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const event: EventType = Event.makeUserRegistered({
          _tag: "UserRegistered",
          timestamp,
          data: {
            user: "eve",
            email: "eve@example.com",
          },
        });
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.make(event),
          2
        );

        yield* Utils.displayValidation(state).pipe(
          Effect.provide(mockLoggerLayer)
        );

        assert.strictEqual(messages.length, 1);
        assert.isTrue(messages[0].includes("VALID"));
      }));
  });

  describe("Integration", () => {
    it("should compose all display operations with proper logging", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        const state = Blockchain.make(
          Chunk.make(genesisBlock),
          Chunk.empty(),
          2
        );

        yield* Effect.all([
          Utils.displayChain(state),
          Utils.displayStats(state),
          Utils.displayValidation(state),
        ]).pipe(Effect.provide(mockLoggerLayer));

        // Should have logged all three operations
        assert.strictEqual(messages.length, 3);
        assert.strictEqual(messages[0], "BLOCKCHAIN VISUALIZATION");
        assert.strictEqual(messages[1], "BLOCKCHAIN STATISTICS");
        assert.isTrue(messages[2].includes("VALID"));
      }));

    it("should work with multiple events across blocks", () =>
      Effect.gen(function* () {
        const { mockLoggerLayer, messages } = createMockLogger();
        const timestamp = yield* DateTime.now;
        const genesisBlock = yield* Block.createGenesis();
        let state = Blockchain.make(Chunk.make(genesisBlock), Chunk.empty(), 1);

        const event1: EventType = Event.makeUserRegistered({
          _tag: "UserRegistered",
          timestamp,
          data: {
            user: "frank",
            email: "frank@example.com",
          },
        });
        const event2: EventType = Event.makeUserLogin({
          _tag: "UserLogin",
          timestamp,
          data: {
            user: "frank",
            ip: "10.0.0.1",
          },
        });

        state = yield* Blockchain.appendEvent(state, event1);
        state = yield* Blockchain.appendEvent(state, event2);

        yield* Effect.all([
          Utils.displayChain(state),
          Utils.displayStats(state),
          Utils.displayValidation(state),
        ]).pipe(Effect.provide(mockLoggerLayer));

        assert.strictEqual(messages.length, 3);
        assert.strictEqual(messages[0], "BLOCKCHAIN VISUALIZATION");
        assert.strictEqual(messages[1], "BLOCKCHAIN STATISTICS");
        assert.isTrue(messages[2].includes("VALID"));
      }));
  });
});
