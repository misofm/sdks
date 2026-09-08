// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `party_genre` extension: a set of `genre::Genre` object ids tagged on a
// party. `add_genre` takes a `&Genre` vocabulary object (proving the id is a real
// entry), so the builder passes `tx.object(genreId)`; removal is by id.

import * as genreMod from "../../contracts/party_genre/party_genre.ts";
import type { TxThunk } from "@misofm/partyos";

export interface AddGenreParams {
  partyId: string;
  capId: string;
  /** The `genre::Genre` vocabulary object id to tag. */
  genreId: string;
  partyGenrePackageId: string;
}

/** Tags a genre on the party. Aborts on-chain if already present or the max is reached. */
export function addGenre(params: AddGenreParams): TxThunk {
  return (tx) => {
    tx.add(
      genreMod.addGenre({
        package: params.partyGenrePackageId,
        arguments: [params.partyId, params.capId, tx.object(params.genreId)],
      }),
    );
  };
}

export interface RemoveGenreParams {
  partyId: string;
  capId: string;
  /** The genre id to untag. */
  genreId: string;
  partyGenrePackageId: string;
}

/** Untags a genre from the party. Aborts on-chain if not present. */
export function removeGenre(params: RemoveGenreParams): TxThunk {
  return (tx) => {
    tx.add(
      genreMod.removeGenre({
        package: params.partyGenrePackageId,
        arguments: [params.partyId, params.capId, params.genreId],
      }),
    );
  };
}

export interface ClearGenresParams {
  partyId: string;
  capId: string;
  partyGenrePackageId: string;
}

/** Removes the party's entire genre set. No-op on-chain if none is set. */
export function clearGenres(params: ClearGenresParams): TxThunk {
  return (tx) => {
    tx.add(genreMod.clearGenres({ package: params.partyGenrePackageId, arguments: [params.partyId, params.capId] }));
  };
}
