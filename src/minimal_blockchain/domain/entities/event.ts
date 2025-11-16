import { Schema } from "effect";

// ============================================================================
// EVENT SCHEMAS
// ============================================================================

/** Genesis event - initial blockchain state */
export const GenesisEventSchema = Schema.TaggedStruct("Genesis", {
  timestamp: Schema.DateTimeUtcFromSelf,
  message: Schema.Option(Schema.String),
});

/** User registration event */
export const UserRegisteredEventSchema = Schema.TaggedStruct("UserRegistered", {
  timestamp: Schema.DateTimeUtcFromSelf,
  user: Schema.String,
  email: Schema.String,
});

/** User login event */
export const UserLoginEventSchema = Schema.TaggedStruct("UserLogin", {
  timestamp: Schema.DateTimeUtcFromSelf,
  user: Schema.String,
  ip: Schema.String,
});

/** Item purchase event */
export const ItemPurchasedEventSchema = Schema.TaggedStruct("ItemPurchased", {
  timestamp: Schema.DateTimeUtcFromSelf,
  user: Schema.String,
  item: Schema.String,
  price: Schema.Number,
});

/** User logout event */
export const UserLogoutEventSchema = Schema.TaggedStruct("UserLogout", {
  timestamp: Schema.DateTimeUtcFromSelf,
  user: Schema.String,
});

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

/** Schema-based discriminated union of all valid blockchain events */
export const EventSchema = Schema.Union(
  GenesisEventSchema,
  UserRegisteredEventSchema,
  UserLoginEventSchema,
  ItemPurchasedEventSchema,
  UserLogoutEventSchema
);

export type Event = typeof EventSchema.Type;

export const makeGenesis = GenesisEventSchema.make;
export const makeUserRegistered = UserRegisteredEventSchema.make;
export const makeUserLogin = UserLoginEventSchema.make;
export const makeItemPurchased = ItemPurchasedEventSchema.make;
export const makeUserLogout = UserLogoutEventSchema.make;
