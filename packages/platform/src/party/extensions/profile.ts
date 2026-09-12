// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `party_profile` extension: an editable identity card attached to a Party.
// The builders hide the Option/vector plumbing and construct the validated
// `CountryCode` / `LanguageCode` values from raw ISO codes.

import * as profileMod from "../../contracts/party_profile/party_profile.ts";
import type { Recipe } from "@unconfirmed/sui-effect";

const OPTION_NONE = "0x1::option::none";
const OPTION_SOME = "0x1::option::some";

export interface SetProfileParams {
  partyId: string;
  capId: string;
  bioShort: string;
  bioLong?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "GB". */
  country?: string;
  /** ISO 639-1 language codes, e.g. ["en", "ja"]. */
  languages?: string[];
  partyProfilePackageId: string;
  countryCodePackageId: string;
  languageCodePackageId: string;
}

/** Sets (creates or replaces) a party's whole profile. */
export function setProfile(params: SetProfileParams): Recipe {
  return (tx) => {
    const ccType = `${params.countryCodePackageId}::country_code::CountryCode`;
    const country = params.country
      ? tx.moveCall({
          target: OPTION_SOME,
          typeArguments: [ccType],
          arguments: [
            tx.moveCall({
              target: `${params.countryCodePackageId}::country_code::new`,
              arguments: [tx.pure.string(params.country)],
            }),
          ],
        })
      : tx.moveCall({ target: OPTION_NONE, typeArguments: [ccType], arguments: [] });

    const lcType = `${params.languageCodePackageId}::language_code::LanguageCode`;
    const languages = tx.makeMoveVec({
      type: lcType,
      elements: (params.languages ?? []).map((code) =>
        tx.moveCall({
          target: `${params.languageCodePackageId}::language_code::new`,
          arguments: [tx.pure.string(code)],
        }),
      ),
    });

    tx.add(
      profileMod.setProfile({
        package: params.partyProfilePackageId,
        arguments: [params.partyId, params.capId, params.bioShort, params.bioLong ?? null, country, languages],
      }),
    );
  };
}

export interface ClearProfileParams {
  partyId: string;
  capId: string;
  partyProfilePackageId: string;
}

/** Removes a party's profile. No-op on-chain if none is set. */
export function clearProfile(params: ClearProfileParams): Recipe {
  return (tx) => {
    tx.add(
      profileMod.clearProfile({
        package: params.partyProfilePackageId,
        arguments: [params.partyId, params.capId],
      }),
    );
  };
}
