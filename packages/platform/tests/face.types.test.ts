// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Type-only regression test for misofm/sdks#35's verification finding A1:
// sui-effect 0.1.0's `PromiseFace<S>` recurses only into members assignable
// to `Record<string, unknown>` (see `docs/extensions.md` §7 /
// `SuiExtension.d.ts`'s own doc comment on `PromiseFace`) — an `interface`
// is not such a member, even when every one of its own members is. Before
// `docs/CONVERSION.md` "Stage 5", `MisoService`'s `protocol`, `party`, and
// `vault` members were typed as interfaces (`MusicosService`,
// `MisoPartyService`, `MisoVault`), so `PromiseFace<MisoService>` never
// recursed into them: `client.miso.protocol.getReleaseById` kept the type
// `(id) => Effect<...>` at compile time while the derived face actually
// handed back a Promise-returning function at runtime (the face's *runtime*
// mapping walks plain object literals regardless of their declared TypeScript
// type, so the lie was one-directional: correct at runtime, wrong in the
// type). This file pins the fix: it fails to compile again if any of these
// three members regresses to an un-recursed interface reference.
//
// (`tsc --noEmit` covers `src/` by default; this repository's `tsconfig.json`
// also includes `tests/`, per `docs/CONVERSION.md` "Stage 5" B3, so this file
// is checked whenever `bun run typecheck` runs.)

import { test } from "bun:test";
import type { PromiseFace } from "@unconfirmed/sui-effect/extension";
import type { MisoService } from "../src/Miso.ts";
import type { MisoPlatformDeployment } from "../src/deployments.ts";
import * as pressingContract from "../src/contracts/record/pressing.ts";

test("PromiseFace<MisoService> recurses into protocol/party/vault/read, and leaves bcs/deployment alone (A1)", () => {});

type Face = PromiseFace<MisoService>;

/** A type-level assertion: fails to compile unless `T` is exactly `true`. */
type Assert<T extends true> = T;

/** Does `F` return a `Promise`, however it is called? */
type ReturnsPromise<F> = F extends (...args: never[]) => Promise<unknown> ? true : false;

// `protocol.getReleaseById`: an `Effect`-returning member of `MusicosService`
// (an external interface `MisoService.protocol` wraps in a homomorphic
// mapped type — see `Miso.ts`) must resolve to a Promise-returning method
// through the face, not stay `Effect`-typed.
type _ProtocolGetReleaseByIdIsPromise = Assert<ReturnsPromise<Face["protocol"]["getReleaseById"]>>;

// `party.getPartyById`: `MisoPartyService` (this package's own type, fixed
// from `interface` to a `type` alias) must recurse the same way.
type _PartyGetPartyByIdIsPromise = Assert<ReturnsPromise<Face["party"]["getPartyById"]>>;

// `vault.getVaultAdminCap`: `MisoVault` (also fixed from `interface` to a
// `type` alias) must recurse too — this is the member the `gateAvailability`
// Proxy wraps (B2), so its Promise-ness matters for a Promise consumer
// calling `client.miso.vault.getVaultAdminCap(...)` directly.
type _VaultGetVaultAdminCapIsPromise = Assert<ReturnsPromise<Face["vault"]["getVaultAdminCap"]>>;

// `read.getReleaseDetail`: `MisoService["read"]` is already an inline object
// type literal (never an interface), so this has always recursed correctly —
// asserted here anyway as the fourth namespace the issue's A1 finding names.
type _ReadGetReleaseDetailIsPromise = Assert<ReturnsPromise<Face["read"]["getReleaseDetail"]>>;

// `bcs.Pressing`: a `BcsType`/`Schema`-like codec value has a prototype of
// its own, so the face's "class instance is a leaf" rule applies — it must
// pass through completely unchanged, never wrapped, never recursed into.
type _BcsPressingIsUntouched = Assert<Face["bcs"]["Pressing"] extends typeof pressingContract.Pressing ? true : false>;
type _BcsPressingIsNotPromiseReturning = Assert<Face["bcs"]["Pressing"] extends (...args: never[]) => Promise<unknown> ? false : true>;

// `deployment`: a plain-data value, not a namespace of `Effect` members —
// every one of its own fields is itself plain data, so recursing into it (as
// the face's type does, since it is `Record`-assignable) is a structural
// no-op and it stays the value type.
type _DeploymentIsValueType = Assert<Face["deployment"] extends MisoPlatformDeployment ? true : false>;
type _DeploymentIsNotPromiseReturning = Assert<Face["deployment"] extends (...args: never[]) => Promise<unknown> ? false : true>;
