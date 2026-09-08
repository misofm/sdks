/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import * as confidentiality from './confidentiality.ts';
const $moduleName = '0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60::data';
export const WalrusBlob = new MoveStruct({ name: `${$moduleName}::WalrusBlob`, fields: {
        blob_id: bcs.u256(),
        confidentiality: confidentiality.Confidentiality
    } });