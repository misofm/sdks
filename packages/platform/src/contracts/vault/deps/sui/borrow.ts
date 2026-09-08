/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A simple library that enables hot-potato-locked borrow mechanics.
 *
 * With Programmable transactions, it is possible to borrow a value within a
 * transaction, use it and put back in the end. Hot-potato `Borrow` makes sure the
 * object is returned and was not swapped for another one.
 */

import { type BcsType, bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { MoveStruct } from '../../../utils/index.ts';
const $moduleName = '0x2::borrow';
/** An object wrapping a `T` and providing the borrow API. */
export function Referent<T extends BcsType<any>>(...typeParameters: [
    T
]) {
    return new MoveStruct({ name: `${$moduleName}::Referent<${typeParameters[0].name as T['name']}>`, fields: {
            id: bcs.Address,
            value: bcs.option(typeParameters[0])
        } });
}