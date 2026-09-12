// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `party_cta` extension: a party's ordered call-to-action list (Tickets,
// Merch, Newsletter, …). Each CTA is a `{ label, url }`; the whole list is written
// at once (position is priority). The builder constructs each `Cta` via `new_cta`
// and passes the vector to `set_ctas`.

import * as ctaMod from "../../contracts/party_cta/party_cta.ts";
import type { Recipe } from "@unconfirmed/sui-effect";
import type { Cta } from "../types.ts";

export interface SetCtasParams {
  partyId: string;
  capId: string;
  /** The ordered CTA list — position is priority. */
  ctas: Cta[];
  partyCtaPackageId: string;
}

/** Sets (or replaces) the party's ordered CTA list. */
export function setCtas(params: SetCtasParams): Recipe {
  return (tx) => {
    const ctaType = `${params.partyCtaPackageId}::party_cta::Cta`;
    const ctas = tx.makeMoveVec({
      type: ctaType,
      elements: params.ctas.map((c) =>
        tx.add(ctaMod.newCta({ package: params.partyCtaPackageId, arguments: [c.label, c.url] })),
      ),
    });
    tx.add(ctaMod.setCtas({ package: params.partyCtaPackageId, arguments: [params.partyId, params.capId, ctas] }));
  };
}

export interface ClearCtasParams {
  partyId: string;
  capId: string;
  partyCtaPackageId: string;
}

/** Removes the party's CTA list. No-op on-chain if none is set. */
export function clearCtas(params: ClearCtasParams): Recipe {
  return (tx) => {
    tx.add(ctaMod.clearCtas({ package: params.partyCtaPackageId, arguments: [params.partyId, params.capId] }));
  };
}
