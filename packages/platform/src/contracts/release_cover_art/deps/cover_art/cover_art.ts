/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * The evolvable cover art value used by the recording/release cover art
 * extensions.
 *
 * CoverArt format changes over time (static-only → +animated → future formats).
 * Keeping it in an extension rather than immutable core means a new format is a
 * republish of this small package (or a brand-new cover art standard), not of the
 * frozen protocol. `CoverArt` references external storage via
 * `ori::data::WalrusBlob`.
 */

import { MoveStruct } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import * as data from '../0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60/data.ts';
const $moduleName = 'cover_art::cover_art';
export const CoverArt = new MoveStruct({ name: `${$moduleName}::CoverArt`, fields: {
        still: data.WalrusBlob,
        animated: bcs.option(data.WalrusBlob)
    } });