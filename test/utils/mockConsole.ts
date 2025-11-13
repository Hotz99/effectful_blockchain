import {
  Logger,
  Layer,
  HashMap,
  Console as EffectConsole,
  Effect,
} from "effect";
import type * as LogLevel from "effect/LogLevel";

interface LogEntry {
  readonly level: LogLevel.LogLevel;
  readonly message: unknown;
  readonly annotations: HashMap.HashMap<string, unknown>;
  readonly spans: ReadonlyArray<string>;
}

/**
 * Creates a mock logger that captures all log output for testing.
 * Use with Effect.provide(mockLoggerLayer) to capture logs in tests.
 */
export const createMockLogger = () => {
  const logs: LogEntry[] = [];
  const messages: string[] = [];

  const mockLogger = Logger.make<unknown, void>(
    ({ message, logLevel, annotations, spans }) => {
      // Store full log entry
      logs.push({
        level: logLevel,
        message,
        annotations,
        spans: Array.from(spans).map((span) => span.label),
      });

      // Store simple message string for easy assertions
      const messageStr =
        typeof message === "string" ? message : String(message);
      messages.push(messageStr);
    }
  );

  const mockLoggerLayer = Logger.replace(Logger.defaultLogger, mockLogger);

  return { mockLoggerLayer, logs, messages };
};

/**
 * Creates a simple output capturer for display functions.
 * Captures the string output from display functions without needing Effect console integration.
 */
export const captureDisplayOutput = (
  displayFn: () => string
): { output: string } => {
  return { output: displayFn() };
};
