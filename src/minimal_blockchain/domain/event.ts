import { Schema, DateTime } from "effect";
import { make } from "effect/Schema";

// ============================================================================
// EVENT SCHEMAS (with discriminant as part of canonical form)
// ============================================================================

/** Genesis event - initial blockchain state */
const GenesisEventSchema = Schema.Struct({
  _tag: Schema.Literal("Genesis"),
  timestamp: Schema.DateTimeUtcFromSelf,
  data: Schema.Struct({
    message: Schema.String,
  }),
});

/** User registration event */
const UserRegisteredEventSchema = Schema.Struct({
  _tag: Schema.Literal("UserRegistered"),
  timestamp: Schema.DateTimeUtcFromSelf,
  data: Schema.Struct({
    user: Schema.String,
    email: Schema.String,
  }),
});

/** User login event */
const UserLoginEventSchema = Schema.Struct({
  _tag: Schema.Literal("UserLogin"),
  timestamp: Schema.DateTimeUtcFromSelf,
  data: Schema.Struct({
    user: Schema.String,
    ip: Schema.String,
  }),
});

/** Item purchase event */
const ItemPurchasedEventSchema = Schema.Struct({
  _tag: Schema.Literal("ItemPurchased"),
  timestamp: Schema.DateTimeUtcFromSelf,
  data: Schema.Struct({
    user: Schema.String,
    item: Schema.String,
    price: Schema.Number,
  }),
});

/** User logout event */
const UserLogoutEventSchema = Schema.Struct({
  _tag: Schema.Literal("UserLogout"),
  timestamp: Schema.DateTimeUtcFromSelf,
  data: Schema.Struct({
    user: Schema.String,
  }),
});

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

/** Schema-based discriminated union of all valid blockchain events */
const EventSchema = Schema.Union(
  GenesisEventSchema,
  UserRegisteredEventSchema,
  UserLoginEventSchema,
  ItemPurchasedEventSchema,
  UserLogoutEventSchema
);

export type Event = typeof EventSchema.Type;

// ============================================================================
// CONSTRUCTORS
// ============================================================================

// Namespace-like object with nested variant factories
export const Event = {
  makeGenesis: GenesisEventSchema.make,
  makeUserRegistered: UserRegisteredEventSchema.make,
  makeUserLogin: UserLoginEventSchema.make,
  makeItemPurchased: ItemPurchasedEventSchema.make,
  makeUserLogout: UserLogoutEventSchema.make,
  Schema: EventSchema,
};
