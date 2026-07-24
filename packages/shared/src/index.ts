/**
 * @atlas/shared — contracts only, no logic (ARCHITECTURE.md).
 *
 * Every schema is the single source of truth for both its runtime validator
 * and its inferred TypeScript type.
 */

export * from "./ids.js";

export * from "./enums/element.js";
export * from "./enums/direction.js";
export * from "./enums/error-code.js";

export * from "./board/coordinates.js";

export * from "./dto/state-instance.js";
export * from "./dto/unit-snapshot.js";
export * from "./dto/cell-snapshot.js";
export * from "./dto/board-snapshot.js";
export * from "./dto/match-snapshot.js";
export * from "./dto/match-setup.js";

export * from "./messages/intents.js";
export * from "./messages/events.js";
export * from "./messages/rejection.js";
export * from "./messages/room-messages.js";

export * from "./config/physics-config.js";
export * from "./config/timers-config.js";
export * from "./config/elemental-interaction-config.js";
export * from "./config/state-config.js";
export * from "./config/terrain-config.js";
export * from "./config/stance-config.js";
export * from "./config/spell-config.js";
export * from "./config/class-config.js";
export * from "./config/map-config.js";
export * from "./config/game-config.js";
export * from "./config/baseline-game-config.js";

export * from "./content/v1-content.js";
