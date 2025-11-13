import { Effect, Chunk } from "effect";
import { Block } from "./domain/block";
import { BlockchainState, Blockchain } from "./domain/blockchain";

export const shortenHash = (
  hash: string,
  prefixLen = 3,
  suffixLen = 3
): string => {
  if (hash.length <= prefixLen + suffixLen + 3) return hash;
  return `${hash.slice(0, prefixLen)}...${hash.slice(-suffixLen)}`;
};

/** Pure: Generate ASCII visualization of blockchain structure */
export const displayChainSimple = (state: BlockchainState) => {
  const blocks = Chunk.toReadonlyArray(state.chain);

  // First line: block numbers and arrows
  const blockLine = blocks.map((_, i) => `[Block ${i}]`).join(" → ");

  // Second line: hashes
  const hashLine = blocks
    .map((block) => `Hash: ${shortenHash(block.hash)}`)
    .join(" ");

  // Third line: event counts
  const eventsLine = blocks
    .map((block) => `Events: ${Chunk.size(block.events)}`)
    .join(" ");

  return Effect.succeed(`${blockLine}\n${hashLine}\n${eventsLine}`);
};

export const displayChain = (state: BlockchainState) =>
  Effect.log("BLOCKCHAIN VISUALIZATION").pipe(
    Effect.annotateLogs({
      totalBlocks: Chunk.size(state.chain),
      pendingEvents: Chunk.size(state.pendingEvents),
      chain: state.chain,
    }),
    Effect.withLogSpan("displayChain")
  );

export const displayStats = (state: BlockchainState) =>
  Effect.gen(function* () {
    const stats = Blockchain.getStats(state);
    yield* Effect.log("BLOCKCHAIN STATISTICS").pipe(
      Effect.annotateLogs({
        totalBlocks: stats.totalBlocks,
        totalEvents: stats.totalEvents,
        pendingEvents: stats.pendingEvents,
        eventsPerBlock: stats.eventsPerBlock,
      }),
      Effect.withLogSpan("statistics")
    );
  });

export const displayValidation = (state: BlockchainState) =>
  Effect.matchEffect(Blockchain.validateChain(state), {
    onFailure: (error) =>
      Effect.log(`✗ Invalid: ${error}`).pipe(
        Effect.annotateLogs({ isValid: false, error }),
        Effect.withLogSpan("validation")
      ),
    onSuccess: () =>
      Effect.log("✓ BLOCKCHAIN IS VALID!").pipe(
        Effect.annotateLogs({ isValid: true }),
        Effect.withLogSpan("validation")
      ),
  });
