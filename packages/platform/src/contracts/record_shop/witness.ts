/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/** Module-controlled authority used by the Miso Record Shop to mint Records. */

import { MoveTuple } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
const $moduleName = '@local-pkg/record_shop::witness';
export const Witness = new MoveTuple({ name: `${$moduleName}::Witness`, fields: [bcs.bool()] });