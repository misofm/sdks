/**
 * The Promise face, derived rather than maintained (`docs/extensions.md` §7).
 */
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import { SuiExtension } from "sui-effect/extension";
import type { ExtensionFace, PromiseFace } from "sui-effect/extension";
import type { PartyDeployment } from "./deployments.ts";
import { Partyos, type PartyosService } from "./Partyos.ts";

/** What {@link partyos} needs to know. */
export interface PartyosOptions<Name extends string = "partyos"> {
  /** The property the extension takes on the client: `client.<name>`. Defaults to `"partyos"`. */
  readonly name?: Name;
  /** Explicit deployment. Omit to use the bundled manifest for the client's network. */
  readonly deployment?: PartyDeployment;
}

/**
 * The registration a Promise consumer passes to `client.$extend(...)`.
 *
 * ```ts
 * const client = new SuiGrpcClient({ network: "testnet" }).$extend(partyos());
 * const party = await client.partyos.getPartyById(ObjectId.make("0x..."));
 * const recipe = client.partyos.tx.setName({ partyId, capId, name: "New name" });
 * await client.partyos.dispose();
 * ```
 *
 * `warm` is given because `tx` and `deployment` are synchronous members a
 * consumer may read the moment it registers, and `Partyos.layer` touches no
 * network at build (`docs/extensions.md` §7, "Synchronous members, `$ready`
 * and `warm`").
 */
export const partyos = <const Name extends string = "partyos">(
  options: PartyosOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, PromiseFace<PartyosService> & ExtensionFace> =>
  SuiExtension.fromService(Partyos, {
    name: (options.name ?? "partyos") as Name,
    layer: Partyos.layer({ deployment: options.deployment }),
    warm: {},
  });
