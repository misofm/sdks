/**
 * The `@misofm/partyos/testing` subpath: fixtures for building a `FakeScript`
 * against `sui-effect/testing`'s harness, with no network.
 */
import type { SuiClientTypes } from "@mysten/sui/client";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type { FakeObject } from "@unconfirmed/sui-effect/testing";
import * as party from "./contracts/partyos/party.ts";
import { PARTYOS_TEST_DEPLOYMENT } from "./Partyos.ts";
import type { PartyKind } from "./types.ts";

export { PARTYOS_TEST_DEPLOYMENT };

/** One `Party` object, with real BCS content, for `FakeScript.objects`. */
export function fakeParty(input: {
  readonly id: string;
  readonly kind: PartyKind;
  readonly name: string;
  readonly members?: ReadonlyArray<string>;
  readonly createdAtMs?: number;
  readonly version?: bigint;
  readonly owner?: SuiClientTypes.ObjectOwner;
}): FakeObject {
  const createdAtMs = input.createdAtMs ?? 0;
  const kind =
    input.kind === "group"
      ? ({ Group: { contents: [...(input.members ?? [])] } } as const)
      : ({ Individual: true as const });
  return {
    objectId: input.id,
    type: `${PARTYOS_TEST_DEPLOYMENT.partyos}::party::Party`,
    version: input.version ?? 1n,
    owner: input.owner,
    content: party.Party.serialize({
      id: input.id,
      kind,
      name: input.name,
      created_at_ms: String(createdAtMs),
    }).toBytes(),
  };
}

/**
 * One dynamic-field entry naming `id` under a `MembershipKey` /
 * `PendingInviteKey` / `PendingMembershipKey` key — all three share the same
 * `[address]` wire layout, so one encoder covers them; `keyTag` says which
 * key type the entry claims to be, for `Partyos`'s exact-tag filter.
 */
export function fakeMembershipField(parent: string, keyTag: string, id: string): SuiClientTypes.DynamicFieldEntry {
  const bytes = party.MembershipKey.serialize([id]).toBytes();
  return {
    $kind: "DynamicField",
    // The same derivation a real node's field id would have: `parent` +
    // `keyTag` + the key's own BCS bytes, matching `sui.getDynamicFieldOption`
    // and `deriveObjectID`'s convention elsewhere in this package.
    fieldId: deriveDynamicFieldID(parent, keyTag, bytes),
    type: `0x2::dynamic_field::Field<${keyTag}, bool>`,
    name: { type: keyTag, bcs: bytes },
    valueType: "bool",
  };
}
