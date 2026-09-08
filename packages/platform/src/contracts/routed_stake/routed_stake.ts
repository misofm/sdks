/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A stake whose rewards are irrevocably routed to its parent's royalty pool.
 *
 * A `RoutedStake<StakeShare, PoolShare>` is a derived object of any UID-bearing
 * parent (same pattern as `RoyaltyPool`). It wraps a `Stake<StakeShare>` — shares
 * of some other asset that the parent owns — and commits the rewards that stake
 * earns to the parent's own `RoyaltyPool<PoolShare, Currency>`: `sweep` is the
 * only reachable claim path, and it deposits straight into the pool derived from
 * the same parent. The wrapper exists precisely so the raw `Stake` is never
 * exposed — a bare shared `Stake` would let any caller claim its rewards and keep
 * them.
 *
 * Because the route is fixed, the wrapper is safe to share: `sweep` is
 * permissionless, and it does not matter who calls it, since the money can only go
 * one place. Lifecycle operations (`register`, `unregister`, `unstake`, `restake`)
 * instead require the parent's `&mut UID` as the credential — cap-gating happens
 * at the parent, exactly as with `RoyaltyPool` creation. `register`/`unregister`
 * are gated because a stake registers at most once per `Currency`: a
 * permissionless register could grief by binding the stake to a garbage same-typed
 * pool, permanently blocking the real one for that currency.
 *
 * The derivation key encodes only `StakeShare` — at most one routed stake per
 * `(parent, StakeShare)` pair, whatever `PoolShare` it used (the same
 * burned-by-first-claim consequence as `RoyaltyPoolKey`; the parent's cap-gated
 * extension is expected to pin `PoolShare` to the parent's own share type). For
 * the same reason the wrapper is never deleted: `unstake` empties it and `restake`
 * refills it, so the one derived address per pair stays usable forever.
 */

import { MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as stake_1 from './deps/royalty_pool/stake.ts';
const $moduleName = '@local-pkg/routed_stake::routed_stake';
export const RoutedStake = new MoveStruct({ name: `${$moduleName}::RoutedStake<phantom StakeShare, phantom PoolShare>`, fields: {
        id: bcs.Address,
        /**
         * The wrapped position. `None` between `unstake` and `restake`; the wrapper itself
         * persists because its derived address can never be re-claimed.
         */
        stake: bcs.option(stake_1.Stake)
    } });
export const RoutedStakeKey = new MoveTuple({ name: `${$moduleName}::RoutedStakeKey<phantom StakeShare>`, fields: [bcs.bool()] });
export const RoutedStakeCreatedEvent = new MoveStruct({ name: `${$moduleName}::RoutedStakeCreatedEvent<phantom StakeShare, phantom PoolShare>`, fields: {
        routed_stake_id: bcs.Address,
        parent_id: bcs.Address,
        staked_value: bcs.u64()
    } });
export const RoutedStakeSweptEvent = new MoveStruct({ name: `${$moduleName}::RoutedStakeSweptEvent<phantom StakeShare, phantom PoolShare, phantom Currency>`, fields: {
        routed_stake_id: bcs.Address,
        parent_id: bcs.Address,
        value: bcs.u64()
    } });
export const RoutedStakeUnstakedEvent = new MoveStruct({ name: `${$moduleName}::RoutedStakeUnstakedEvent<phantom StakeShare, phantom PoolShare>`, fields: {
        routed_stake_id: bcs.Address,
        parent_id: bcs.Address,
        unstaked_value: bcs.u64()
    } });
export const RoutedStakeRestakedEvent = new MoveStruct({ name: `${$moduleName}::RoutedStakeRestakedEvent<phantom StakeShare, phantom PoolShare>`, fields: {
        routed_stake_id: bcs.Address,
        parent_id: bcs.Address,
        staked_value: bcs.u64()
    } });
export interface NewArguments {
    parent: RawTransactionArgument<string>;
    balance: TransactionArgument;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        parent: RawTransactionArgument<string>,
        balance: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Construct a routed stake as a derived object of `parent`, wrapping `balance` as
 * its staked position. Aborts (in `stake::new`) on a zero balance, and (in
 * `derived_object::claim`) if the `(parent, StakeShare)` address was already
 * claimed.
 *
 * Cap-gating happens at the parent: callers must obtain `&mut UID` via whatever
 * cap-gated accessor the parent exposes.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        '0x2::object::ID',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["parent", "balance"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ShareArguments {
    self: RawTransactionArgument<string>;
}
export interface ShareOptions {
    package?: string;
    arguments: ShareArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Share the routed stake so anyone can `sweep` it. */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RegisterArguments {
    self: RawTransactionArgument<string>;
    parent: RawTransactionArgument<string>;
    stakePool: RawTransactionArgument<string>;
}
export interface RegisterOptions {
    package?: string;
    arguments: RegisterArguments | [
        self: RawTransactionArgument<string>,
        parent: RawTransactionArgument<string>,
        stakePool: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Register the wrapped stake with the pool it earns from, so future deposits
 * accrue to it. Which same-typed pool is the _correct_ one is the caller's concern
 * — the parent's extension is expected to pin it (e.g. by derivation from the
 * asset object) before delegating here.
 */
export function register(options: RegisterOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null,
        '0x2::object::ID',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "parent", "stakePool"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'register',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnregisterArguments {
    self: RawTransactionArgument<string>;
    parent: RawTransactionArgument<string>;
    stakePool: RawTransactionArgument<string>;
}
export interface UnregisterOptions {
    package?: string;
    arguments: UnregisterArguments | [
        self: RawTransactionArgument<string>,
        parent: RawTransactionArgument<string>,
        stakePool: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Unregister the wrapped stake from a pool it earns from. The pool requires
 * claimable rewards to be drained to zero first — i.e. a final `sweep` — so
 * accrued rewards provably reach the parent's pool before the position can move.
 */
export function unregister(options: UnregisterOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null,
        '0x2::object::ID',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "parent", "stakePool"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'unregister',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnstakeArguments {
    self: RawTransactionArgument<string>;
    parent: RawTransactionArgument<string>;
}
export interface UnstakeOptions {
    package?: string;
    arguments: UnstakeArguments | [
        self: RawTransactionArgument<string>,
        parent: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Remove the staked position and return its principal. Aborts (in
 * `stake::destroy`) while any pool registrations remain. The emptied wrapper
 * persists — its derived address is burned forever, so deleting it would
 * permanently destroy the parent's ability to route-stake this share type;
 * `restake` refills it instead.
 */
export function unstake(options: UnstakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "parent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'unstake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RestakeArguments {
    self: RawTransactionArgument<string>;
    parent: RawTransactionArgument<string>;
    balance: TransactionArgument;
}
export interface RestakeOptions {
    package?: string;
    arguments: RestakeArguments | [
        self: RawTransactionArgument<string>,
        parent: RawTransactionArgument<string>,
        balance: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Refill an emptied wrapper with a new staked position. Aborts if a position is
 * already present.
 */
export function restake(options: RestakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null,
        '0x2::object::ID',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "parent", "balance"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'restake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SweepArguments {
    self: RawTransactionArgument<string>;
    stakePool: RawTransactionArgument<string>;
    routedPool: RawTransactionArgument<string>;
    parentId: RawTransactionArgument<string>;
}
export interface SweepOptions {
    package?: string;
    arguments: SweepArguments | [
        self: RawTransactionArgument<string>,
        stakePool: RawTransactionArgument<string>,
        routedPool: RawTransactionArgument<string>,
        parentId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Claim the wrapped stake's accrued rewards from `stake_pool` and commit them to
 * `routed_pool` — the parent's own pool. Permissionless: the caller supplies
 * `parent_id`, but cannot lie, because both the wrapper's own address and
 * `routed_pool`'s address must derive from it. A zero reward is a no-op (no
 * event), so the call composes safely into batch PTBs.
 *
 * A pool deposit needs a registered stake to attribute to. While `routed_pool` has
 * none, the reward is instead sent to the pool's own address — ordinary
 * address-delivered funds, folded in permissionlessly by `pool::sweep_and_deposit`
 * once a stake registers. Either way the money is committed to the parent's pool,
 * so the route stays fixed and this call — and therefore `unregister`/`unstake` —
 * can never be blocked by the destination's state.
 */
export function sweep(options: SweepOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "stakePool", "routedPool", "parentId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'sweep',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasStakeArguments {
    self: RawTransactionArgument<string>;
}
export interface HasStakeOptions {
    package?: string;
    arguments: HasStakeArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
export function hasStake(options: HasStakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'has_stake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ValueArguments {
    self: RawTransactionArgument<string>;
}
export interface ValueOptions {
    package?: string;
    arguments: ValueArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Staked principal, or 0 while the wrapper is empty. */
export function value(options: ValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface StakeArguments {
    self: RawTransactionArgument<string>;
}
export interface StakeOptions {
    package?: string;
    arguments: StakeArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Read-only access to the wrapped stake, e.g. for `pool::pending_rewards`. Aborts
 * while the wrapper is empty (`has_stake` to guard).
 */
export function stake(options: StakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'stake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface DerivedAddressArguments {
    parentId: RawTransactionArgument<string>;
}
export interface DerivedAddressOptions {
    package?: string;
    arguments: DerivedAddressArguments | [
        parentId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Compute the deterministic address of a routed stake given its parent ID and
 * `StakeShare` type parameter.
 */
export function derivedAddress(options: DerivedAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["parentId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'derived_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface AssertDerivedFromArguments {
    self: RawTransactionArgument<string>;
    parentId: RawTransactionArgument<string>;
}
export interface AssertDerivedFromOptions {
    package?: string;
    arguments: AssertDerivedFromArguments | [
        self: RawTransactionArgument<string>,
        parentId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Verify the routed stake was derived from the given parent ID. */
export function assertDerivedFrom(options: AssertDerivedFromOptions) {
    const packageAddress = options.package ?? '@local-pkg/routed_stake';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "parentId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'routed_stake',
        function: 'assert_derived_from',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}