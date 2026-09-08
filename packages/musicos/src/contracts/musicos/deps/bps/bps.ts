/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Basis-points arithmetic with a newtype wrapper.
 *
 * 1 bps = 0.01%. 10_000 bps = 100%.
 *
 * Storage-optimal: `BPS` stores a `u16` (2 bytes), the tightest width that fits
 * the `[0, 10_000]` range. Apply functions cover every standard integer width
 * (`u8` through `u256`). Arithmetic on `u8`–`u128` widens to the next-larger type
 * before multiplying. `u256` uses quotient/remainder decomposition and is total
 * over its entire input domain.
 */

import { MoveTuple } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
const $moduleName = 'bps::bps';
export const BPS = new MoveTuple({ name: `${$moduleName}::BPS`, fields: [bcs.u16()] });