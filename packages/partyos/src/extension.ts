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
  /**
   * The chain identifier the node must report, and the id a `warm`
   * registration takes when the client's network is not `mainnet` or
   * `testnet` (`docs/extensions.md` §7, "Synchronous members, `$ready` and
   * `warm`" — `warm.chainId`, or `sui.chainId`, or the built-in table entry
   * for `mainnet`/`testnet`, and nothing else). Required for `partyos()` to
   * build synchronously on `devnet`, `localnet`, or a custom network; omit
   * it only when the client is on `mainnet` or `testnet`, where the
   * built-in table already supplies one. Without it on an unbundled
   * network, `client.$extend(partyos())` throws synchronously.
   */
  readonly chainId?: string;
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
 * and `warm`"). `options.chainId` is forwarded to both `warm` (so `register`
 * can build synchronously without reading the chain) and `sui` (so the same
 * id is asserted against the node), which is what makes a `devnet`,
 * `localnet` or custom-network registration succeed at all — without it,
 * `warm` throws for any network outside the built-in `mainnet`/`testnet`
 * table.
 */
export const partyos = <const Name extends string = "partyos">(
  options: PartyosOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, PromiseFace<PartyosService> & ExtensionFace> =>
  SuiExtension.fromService(Partyos, {
    name: (options.name ?? "partyos") as Name,
    layer: Partyos.layer({ deployment: options.deployment }),
    ...(options.chainId === undefined ? {} : { sui: { chainId: options.chainId } }),
    warm: { chainId: options.chainId },
  });
