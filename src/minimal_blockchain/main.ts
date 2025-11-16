import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { DateTime, Effect, Logger, Layer } from "effect";
import {
  BlockchainService,
  BlockchainServiceLive,
} from "./domain/services/blockchain_service";
import {
  makeUserRegistered,
  makeUserLogin,
  makeItemPurchased,
  makeUserLogout,
} from "./domain/entities/event";
import { displayChain, displayStats, displayValidation } from "./utils";

const program = Effect.gen(function* () {
  const service = yield* BlockchainService;
  const timestamp = yield* DateTime.now;

  yield* Effect.log("Initializing blockchain").pipe(
    Effect.annotateLogs({ maxEventsPerBlock: 5 }),
    Effect.withLogSpan("initialization")
  );

  const initialState = yield* service.initState(5);

  // TODO delegate timestamp creation to service layer
  const stateWithEvents = yield* service.appendEvents(initialState, [
    makeUserRegistered({ timestamp, user: "bob", email: "bob@example.com" }),
    makeUserRegistered({
      timestamp,
      user: "alice",
      email: "alice@example.com",
    }),
    makeUserLogin({ timestamp, user: "alice", ip: "192.168.1.1" }),
    makeItemPurchased({
      timestamp,
      user: "alice",
      item: "laptop",
      price: 1200,
    }),
    makeUserLogin({ timestamp, user: "bob", ip: "192.168.1.5" }),
    // Block auto-creates after 5 events
    makeItemPurchased({ timestamp, user: "bob", item: "phone", price: 800 }),
    makeUserLogout({ timestamp, user: "alice" }),
    makeUserRegistered({
      timestamp,
      user: "charlie",
      email: "charlie@example.com",
    }),
  ]);

  yield* Effect.log("Added 8 events to blockchain");

  const finalState = yield* service
    .forceCreateBlock(stateWithEvents)
    .pipe(
      Effect.catchTag("EmptyPendingEventsError", (_error) =>
        Effect.succeed(stateWithEvents)
      )
    );

  yield* Effect.log("Forced block creation for pending events");

  yield* displayChain(finalState);
  yield* displayStats(finalState);
  yield* displayValidation(finalState);
}).pipe(Effect.withSpan("blockchain-operations"));

program.pipe(
  Effect.orDie,
  Effect.provide(Layer.mergeAll(Logger.structured, BlockchainServiceLive)),
  NodeRuntime.runMain
);
