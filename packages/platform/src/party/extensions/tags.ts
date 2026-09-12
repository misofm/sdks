// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `party_tags` extension: free-form descriptor tags on a party, a
// `VecSet<String>`. Tags are stored exactly as given; normalization is a client
// concern.

import * as tagsMod from "../../contracts/party_tags/party_tags.ts";
import type { Recipe } from "@unconfirmed/sui-effect";

export interface AddTagParams {
  partyId: string;
  capId: string;
  tag: string;
  partyTagsPackageId: string;
}

/** Adds a tag to the party. Aborts on-chain if empty, too long, duplicate, or the max is reached. */
export function addTag(params: AddTagParams): Recipe {
  return (tx) => {
    tx.add(
      tagsMod.addTag({ package: params.partyTagsPackageId, arguments: [params.partyId, params.capId, params.tag] }),
    );
  };
}

export interface RemoveTagParams {
  partyId: string;
  capId: string;
  tag: string;
  partyTagsPackageId: string;
}

/** Removes a tag from the party. Aborts on-chain if not present. */
export function removeTag(params: RemoveTagParams): Recipe {
  return (tx) => {
    tx.add(
      tagsMod.removeTag({ package: params.partyTagsPackageId, arguments: [params.partyId, params.capId, params.tag] }),
    );
  };
}

export interface ClearTagsParams {
  partyId: string;
  capId: string;
  partyTagsPackageId: string;
}

/** Removes the party's entire tag set. No-op on-chain if none is set. */
export function clearTags(params: ClearTagsParams): Recipe {
  return (tx) => {
    tx.add(tagsMod.clearTags({ package: params.partyTagsPackageId, arguments: [params.partyId, params.capId] }));
  };
}
