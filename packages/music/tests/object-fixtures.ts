// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The v1 core keeps creation-only values in the raw Initialized enum variant
// so `new` and `publish` can remain atomic. The public domain state deliberately
// exposes only the lifecycle tag, so object fixtures use neutral payloads.

const ZERO_ADDRESS = `0x${"0".repeat(64)}`;

export const initializedCompositionState = () => ({
  Initialized: {
    share_currency_id: ZERO_ADDRESS,
    consumed_treasury_cap_id: ZERO_ADDRESS,
    created_by: ZERO_ADDRESS,
    share_supply_before: "0",
    share_supply_after: "0",
    shares_returned: "0",
    share_decimals: 0,
    share_supply_fixed_after: false,
    created_admin_cap_id: ZERO_ADDRESS,
  },
} as const);

export const initializedRecordingState = () => ({
  Initialized: {
    share_currency_id: ZERO_ADDRESS,
    consumed_treasury_cap_id: ZERO_ADDRESS,
    created_by: ZERO_ADDRESS,
    composition_royalty_rate_bps: 0,
    share_supply_before: "0",
    shares_before_grant: "0",
    composition_shares_granted: "0",
    shares_returned: "0",
    share_decimals: 0,
    share_supply_fixed_after: false,
    composition_funds_sent: false,
    created_admin_cap_id: ZERO_ADDRESS,
  },
} as const);

export const initializedReleaseState = () => ({
  Initialized: {
    registry_id: ZERO_ADDRESS,
    release_digest: [],
    nonce: "0",
  },
} as const);
