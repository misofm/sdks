/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `PerTrack<Data>` — one `Data` value per track of a release, held in tracklist
 * order.
 *
 * A release's tracks are a flat, ordered `vector<Track>`, frozen at release
 * creation. `PerTrack` is the parallel array to that list: index `i` holds the
 * payload for the `i`-th track. It is the shared shape behind per-track release
 * metadata such as cover art (`PerTrack<Option<CoverArt>>`) or genre — and the
 * natural home for display grouping (disc/side boundaries), which core
 * deliberately does not store.
 *
 * Construction reads the `Release` and sizes/validates the array against the
 * tracklist length, so a `PerTrack` is parallel to the tracklist _by construction_
 * — an extension cannot attach a misaligned array. Because a release's tracklist
 * is frozen at creation, that alignment holds for the release's whole life.
 */

import { type BcsType, bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { MoveTuple } from '../../../utils/index.ts';
const $moduleName = 'per_track::per_track';
/**
 * One `Data` per track, indexed by the release's tracklist position. `Data` is the
 * per-track payload — e.g. `CoverArt` when every track carries one, or
 * `Option<CoverArt>` for override-style metadata layered over an album-level
 * default.
 */
export function PerTrack<Data extends BcsType<any>>(...typeParameters: [
    Data
]) {
    return new MoveTuple({ name: `${$moduleName}::PerTrack<${typeParameters[0].name as Data['name']}>`, fields: [bcs.vector(typeParameters[0])] });
}