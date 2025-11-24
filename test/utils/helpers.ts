import * as Option from "effect/Option";
import { assert } from "@effect/vitest";

/**
 * Assert that an Option is Some and return its value.
 * Fails the test if the Option is None.
 */
export const assertSome = <T>(
  option: Option.Option<T>,
  message: string = "Expected Some, got None"
): T => {
  return Option.match(option, {
    onNone: () => assert.fail(message),
    onSome: (value) => value,
  });
};

/**
 * Assert that an Option is None.
 * Fails the test if the Option is Some.
 */
export const assertNone = <T>(
  option: Option.Option<T>,
  message: string = "Expected None, got Some"
): void => {
  Option.match(option, {
    onNone: () => {},
    onSome: () => assert.fail(message),
  });
};
