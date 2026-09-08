// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Public, camelCase result types. The mappers in ./internal.ts turn the generated
// (snake_case, Move-shaped) parse output into these.

export type PartyKind = "individual" | "group";

export interface Party {
  id: string;
  kind: PartyKind;
  /** Human-readable name (not verified). */
  name: string;
  /** Member party ids — present only when `kind === "group"`. */
  members?: string[];
  /** Unix ms when the party was created. */
  createdAtMs: number;
}
