import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Blockchain } from "./domain/blockchain";
import { displayChain, displayStats, displayValidation } from "./utils";
import { Layer } from "effect";
import { MerkleServiceLive } from "./domain/merkle_service";

const program = Effect.gen(function* () {
  // `yield*` operates on `(foo.pipe(bar, baz))`
  // not just `foo`
  yield* Effect.log("Initializing blockchain").pipe(
    Effect.annotateLogs({ maxEventsPerBlock: 5 }),
    Effect.withLogSpan("initialization")
  );

  const initialState = yield* Blockchain.init(5);

  const stateWithEvents = yield* Blockchain.appendEvents(initialState, [
    {
      _tag: "UserRegistered",
      data: { user: "alice", email: "alice@example.com" },
    },
    {
      _tag: "UserRegistered",
      data: { user: "bob", email: "bob@example.com" },
    },
    { _tag: "UserLogin", data: { user: "alice", ip: "192.168.1.1" } },
    {
      _tag: "ItemPurchased",
      data: { user: "alice", item: "laptop", price: 1200 },
    },
    { _tag: "UserLogin", data: { user: "bob", ip: "192.168.1.5" } },
    // Block auto-creates after 5 events
    {
      _tag: "ItemPurchased",
      data: { user: "bob", item: "phone", price: 800 },
    },
    { _tag: "UserLogout", data: { user: "alice" } },
    {
      _tag: "UserRegistered",
      data: { user: "charlie", email: "charlie@example.com" },
    },
  ]);

  yield* Effect.log("Added 8 events to blockchain");

  const finalState = yield* Blockchain.forceCreateBlock(stateWithEvents);

  yield* Effect.log("Forced block creation for pending events");

  yield* displayChain(finalState);
  yield* displayStats(finalState);
  yield* displayValidation(finalState);
});

program.pipe(
  Effect.provide(
    Layer.mergeAll(Logger.structured, MerkleServiceLive, NodeContext.layer)
  ),
  NodeRuntime.runMain({ disableErrorReporting: true })
);
