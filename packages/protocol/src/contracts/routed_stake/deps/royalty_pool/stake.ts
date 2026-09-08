/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A position holding share tokens registered against a `RoyaltyPool`.
 *
 * Stakes are owned objects with an immutable balance — to increase a holder's
 * total staked amount, mint additional Stake objects rather than modify an
 * existing one. This mirrors Sui's native staking model.
 *
 * Each stake tracks the royalty pools it is currently registered with via an
 * inline `VecMap<TypeName, Registration>`, keyed by the pool's `Currency`
 * `TypeName`. The stake cannot be destroyed while any registrations remain. Pool
 * registrations are mutated by `royalty_pool::pool` through the package-private
 * accessors below.
 *
 * Custody warning: `pool::claim_rewards` pays accrued rewards to the _caller_, and
 * `Stake` is `key + store` — a bare shared stake (or one wrapped in a shared
 * object that hands out `&mut`) is drainable by anyone. Stakes must stay
 * address-owned, or wrapped by a contract that pins the reward route (e.g.
 * `routed_stake`); the pool cannot enforce this itself.
 */

import { MoveStruct } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import * as balance from '../sui/balance.ts';
import * as vec_map from '../sui/vec_map.ts';
import * as type_name from '../std/type_name.ts';
const $moduleName = 'royalty_pool::stake';
export const Registration = new MoveStruct({ name: `${$moduleName}::Registration`, fields: {
        pool_id: bcs.Address,
        /**
         * Reward debt in `shares · index` units: `shares · index` as of registration, plus
         * `reward · PRECISION` for every payout since. The pending reward is
         * `(shares · index − debt) / PRECISION`, computed by `royalty_pool::pool`. Kept at
         * full precision so no rounding is ever stored: `debt ≤ shares · index` always
         * holds.
         */
        debt: bcs.u256()
    } });
export const Stake = new MoveStruct({ name: `${$moduleName}::Stake<phantom Share>`, fields: {
        id: bcs.Address,
        /** The staked balance. Immutable after creation. */
        balance: balance.Balance,
        /**
         * Active royalty-pool registrations, keyed by `Currency` `TypeName`. Must be empty
         * to destroy.
         */
        registrations: vec_map.VecMap(type_name.TypeName, Registration)
    } });