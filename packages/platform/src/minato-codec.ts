// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { asU64, type U64Input } from "./vault.ts";

/** Encode the deployed Minato v1 `disperse` ABI, using bigint throughout. */
export function encodeMinatoDistribution(
  recipients: readonly { address: string; value: U64Input }[],
): { recipients: string[]; runs: number[] } {
  if (recipients.length === 0) throw new Error("share recipients must not be empty");
  let total = 0n;
  const payouts = recipients.map((recipient) => {
    if (typeof recipient.address !== "string" || !/^(?:0x)?[0-9a-fA-F]{1,64}$/.test(recipient.address)) {
      throw new Error("invalid share recipient address");
    }
    const address = normalizeSuiAddress(recipient.address);
    if (!isValidSuiAddress(address)) throw new Error("invalid share recipient address");
    const amount = asU64("share recipient value", recipient.value);
    if (amount === 0n) throw new Error("share recipient value must be greater than zero");
    total += amount;
    if (total > 0xffff_ffff_ffff_ffffn) throw new Error("share distribution total exceeds u64");
    return { address, amount };
  });
  payouts.sort((left, right) => left.amount < right.amount ? -1
    : left.amount > right.amount ? 1
    : left.address < right.address ? -1 : left.address > right.address ? 1 : 0);

  // Duplicate recipients remain valid, matching the on-chain contract. Sorting
  // preserves each address/amount pair and does not mutate the caller's list.
  const groups: { amount: bigint; count: bigint }[] = [];
  for (const payout of payouts) {
    const last = groups.at(-1);
    if (last?.amount === payout.amount) last.count += 1n;
    else groups.push({ amount: payout.amount, count: 1n });
  }
  const runs: number[] = [];
  const appendUleb128 = (value: bigint) => {
    do {
      const low = Number(value & 0x7fn);
      value >>= 7n;
      runs.push(value === 0n ? low : low | 0x80);
    } while (value !== 0n);
  };
  appendUleb128(BigInt(groups.length));
  let previous = 0n;
  for (const group of groups) {
    appendUleb128(group.amount - previous);
    appendUleb128(group.count);
    previous = group.amount;
  }
  return { recipients: payouts.map((payout) => payout.address), runs };
}
