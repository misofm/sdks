/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveEnum, MoveStruct } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
const $moduleName = '0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60::confidentiality';
/**
 * Confidentiality metadata for referenced data.
 *
 * Variants can only be constructed in this module, so encrypted values always
 * carry a non-empty Seal-sealed data-encryption key.
 */
export const Confidentiality = new MoveEnum({ name: `${$moduleName}::Confidentiality`, fields: {
        /** The referenced data is stored in the clear. */
        Unencrypted: null,
        /**
         * The referenced data is encrypted. `sealed_dek` is its Seal-sealed
         * data-encryption key, not the plaintext key.
         */
        Encrypted: new MoveStruct({ name: `Confidentiality.Encrypted`, fields: {
                sealed_dek: bcs.vector(bcs.u8())
            } })
    } });