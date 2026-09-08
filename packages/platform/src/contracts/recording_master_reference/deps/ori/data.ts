/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import * as confidentiality from './confidentiality.ts';
const $moduleName = 'ori::data';
export const WalrusBlob = new MoveStruct({ name: `${$moduleName}::WalrusBlob`, fields: {
        blob_id: bcs.u256(),
        confidentiality: confidentiality.Confidentiality
    } });