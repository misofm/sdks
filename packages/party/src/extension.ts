/**
 * The Promise face, derived rather than maintained (`docs/extensions.md` §7).
 */
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import { SuiExtension } from "@unconfirmed/sui-effect/extension";
import type { ExtensionFace, PromiseFace } from "@unconfirmed/sui-effect/extension";
import type { PartyDeployment } from "./deployments.ts";
import { PartyProtocol, type PartyProtocolService } from "./PartyProtocol.ts";

/** What {@link partyProtocol} needs to know. */
export interface PartyProtocolOptions<Name extends string = "partyProtocol"> {
  /** The property the extension takes on the client: `client.<name>`. Defaults to `"partyProtocol"`. */
  readonly name?: Name;
  /** Explicit deployment. Omit to use the bundled manifest for the client's network. */
  readonly deployment?: PartyDeployment;
  /**
   * The chain identifier the node must report, and the id a `warm`
   * registration takes when the client's network is not `mainnet` or
   * `testnet` (`docs/extensions.md` §7, "Synchronous members, `$ready` and
   * `warm`" — `warm.chainId`, or `sui.chainId`, or the built-in table entry
   * for `mainnet`/`testnet`, and nothing else). Required for `partyProtocol()` to
   * build synchronously on `devnet`, `localnet`, or a custom network; omit
   * it only when the client is on `mainnet` or `testnet`, where the
   * built-in table already supplies one. Without it on an unbundled
   * network, `client.$extend(partyProtocol())` throws synchronously.
   */
  readonly chainId?: string;
}

/**
 * The registration a Promise consumer passes to `client.$extend(...)`.
 *
 * ```ts
 * const client = new SuiGrpcClient({ network: "testnet" }).$extend(partyProtocol());
 * const party = await client.partyProtocol.getPartyById(ObjectId.make("0x..."));
 * const recipe = client.partyProtocol.tx.setName({ partyId, capId, name: "New name" });
 * await client.partyProtocol.dispose();
 * ```
 *
 * `warm` is given because `tx` and `deployment` are synchronous members a
 * consumer may read the moment it registers, and `PartyProtocol.layer` touches no
 * network at build (`docs/extensions.md` §7, "Synchronous members, `$ready`
 * and `warm`"). `options.chainId` is forwarded to both `warm` (so `register`
 * can build synchronously without reading the chain) and `sui` (so the same
 * id is asserted against the node), which is what makes a `devnet`,
 * `localnet` or custom-network registration succeed at all — without it,
 * `warm` throws for any network outside the built-in `mainnet`/`testnet`
 * table.
 */
export const partyProtocol = <const Name extends string = "partyProtocol">(
  options: PartyProtocolOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, PromiseFace<PartyProtocolService> & ExtensionFace> =>
  SuiExtension.fromService(PartyProtocol, {
    name: (options.name ?? "partyProtocol") as Name,
    layer: PartyProtocol.layer({ deployment: options.deployment }),
    ...(options.chainId === undefined ? {} : { sui: { chainId: options.chainId } }),
    warm: { chainId: options.chainId },
  });
