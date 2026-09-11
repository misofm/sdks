/**
 * @deprecated Free-function reads that predate the `Partyos` service. Kept
 * only so `@misofm/platform` — converted to sui-effect separately, see
 * misofm/sdks#35 — keeps typechecking `import { getPartyById, ... } from
 * "@misofm/partyos"` at its two remaining direct call sites
 * (`src/read/artist.ts`, `src/read/wallet.ts`) until its own conversion
 * lands.
 *
 * Every function here is `Partyos.getPartyById` (etc.) scoped to
 * `partyPackageId` for one call, so it fails with this package's own error
 * taxonomy (`PartyNotFound`, `DecodeError`, `TransportError`,
 * `PartyosDeploymentError` from a malformed `partyPackageId`) over `Sui` —
 * not `@misofm/effect`'s `SuiClient`-based `ObjectNotFoundError` /
 * `ObjectTypeMismatchError` / `BcsDecodeError` / `SuiRpcError` the
 * predecessor free functions failed with. New code should use `Partyos`
 * (`yield* Partyos`) or `partyos()`'s Promise face instead.
 */
import { Effect, type Result } from "effect";
import type { DecodeError, Sui, TransportError } from "sui-effect";
import { ObjectId } from "sui-effect";
import { Partyos, type PartyosService } from "./Partyos.ts";
import type { PartyBatchItemError, PartyReadError, PartyosDeploymentError } from "./errors.ts";
import type { Party } from "./types.ts";

const scoped = <A, E>(
  partyPackageId: string,
  f: (p: PartyosService) => Effect.Effect<A, E>,
): Effect.Effect<A, E | PartyosDeploymentError, Sui> =>
  Effect.flatMap(Partyos, f).pipe(Effect.provide(Partyos.layer({ deployment: { partyos: partyPackageId } })));

/** @deprecated Use `Partyos#getPartyById` (`yield* Partyos`), or `partyos()`'s Promise face. */
export const getPartyById = (partyId: string, partyPackageId: string): Effect.Effect<Party, PartyReadError | PartyosDeploymentError, Sui> =>
  scoped(partyPackageId, (p) => p.getPartyById(ObjectId.make(partyId)));

/** @deprecated Use `Partyos#getPartiesByIds`. */
export const getPartiesByIds = (
  partyIds: readonly string[],
  partyPackageId: string,
): Effect.Effect<ReadonlyArray<Result.Result<Party, PartyBatchItemError>>, TransportError | PartyosDeploymentError, Sui> =>
  scoped(partyPackageId, (p) => p.getPartiesByIds(partyIds.map((id) => ObjectId.make(id))));

/** @deprecated Use `Partyos#getPendingMemberships`. */
export const getPendingMemberships = (
  partyId: string,
  partyPackageId: string,
): Effect.Effect<ReadonlyArray<ObjectId>, DecodeError | TransportError | PartyosDeploymentError, Sui> =>
  scoped(partyPackageId, (p) => p.getPendingMemberships(ObjectId.make(partyId)));
