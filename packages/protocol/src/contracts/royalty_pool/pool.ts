/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Accumulator-based royalty distribution pool for the protocol's share tokens.
 *
 * A `RoyaltyPool<Share, Currency>` is a derived object of any UID-bearing parent.
 * Its address is deterministically derived from `(parent_id, Share, Currency)` —
 * at most one pool per triple, and the pool at that address is necessarily typed
 * `RoyaltyPool<Share, Currency>` (the same type parameters produce the address and
 * the object) and necessarily shared (the pool is key-only; `share` is its only
 * consumer). The `Share` phantom identifies which share-token type can stake
 * against the pool.
 *
 * Holders create a `Stake<Share>` (see `royalty_pool::stake`) and register it.
 * Callers fund the pool by handing it a `Balance<Currency>` via `deposit`; the
 * accumulator advances and claims pay out the per-stake proportional share since
 * each stake's last claim.
 *
 * The pool is funded two ways, both committing the funds to share holders:
 *
 * - `deposit(balance)` from any caller holding `&mut` on the pool — e.g.
 *   `routed_stake::sweep`, which deposits a wrapped stake's claimed rewards into
 *   its parent's pool.
 * - Delivery to the pool's derived address — pending `Coin<Currency>` transfers or
 *   address-balance credits (e.g. `release_revenue_distributor` settles each
 *   track's split there). The address is a pure function of
 *   `(parent_id, Share, Currency)`, so senders need the pool neither shared nor
 *   even created yet; a later `new` claims exactly that ID — and can only be the
 *   correctly-typed, shared pool. `receive_and_deposit` and `sweep_and_deposit`
 *   fold such funds into the accumulator, permissionlessly: anyone can complete
 *   the delivery. Both run through `deposit`, which aborts while no shares are
 *   staked — and the pool has no other withdrawal path — so funds at the pool's
 *   address wait, locked, until the pool exists and a stake registers.
 *
 * ### No activation delay (deliberate)
 *
 * Registration earns from the next deposit onward; there is no bonding or
 * unbonding period (contrast Sui native staking's next-epoch activation). With the
 * protocol's fixed-supply share token this is safe: a stake's take of any deposit
 * is `v · s / S` with `S` (total registered) bounded by the share supply, so a
 * continuously registered stake is guaranteed at least its pro-rata share of total
 * supply on every deposit. Short-lived or just-in-time registrations can only
 * compete for the _unregistered_ supply's drift — the designed incentive for being
 * registered — never below any registered stake's floor.
 *
 * ### Exact accounting
 *
 * Every base unit deposited is accounted for, to the last index unit:
 *
 * - A deposit of `v` across `S` staked shares advances the index by
 *   `⌊(v · PRECISION + carry) / S⌋` and keeps the remainder in `carry` (in
 *   `value · PRECISION` units, independent of `S`), so deposit rounding never
 *   loses value — it is folded into the next deposit. This also means a share
 *   supply larger than `PRECISION` cannot lock deposits: they accumulate in
 *   `carry` until they fold.
 * - A registration records its debt in `shares · index` units at full precision
 *   and pays `⌊(shares · index − debt) / PRECISION⌋`; the payout is added back to
 *   the debt as `reward · PRECISION`. A registration's lifetime payout is
 *   therefore exactly `⌊shares · Δindex / PRECISION⌋`: sub-unit credit carries
 *   across claims and is never inflated. At most one base unit of sub-unit residue
 *   is forfeited per registration, at unregister.
 *
 * Consequently
 * `balance · PRECISION == Σ (shares · index − debt) + carry +  forfeited` at all
 * times — the pool can never owe more than it holds — and `PRECISION` is only a
 * granularity/overflow choice: `shares · index` fits `u256` for any `u64` share
 * supply and lifetime deposits.
 */

import { MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as balance_1 from './deps/sui/balance.ts';
const $moduleName = '@local-pkg/royalty_pool::pool';
export const RoyaltyPool = new MoveStruct({ name: `${$moduleName}::RoyaltyPool<phantom Share, phantom Currency>`, fields: {
        id: bcs.Address,
        balance: balance_1.Balance,
        staked_shares: bcs.u64(),
        cumulative_reward_per_share: bcs.u256(),
        /**
         * Deposit remainder not yet folded into the index, in `value · PRECISION` units.
         * Smaller than `staked_shares` as of the last deposit.
         */
        carry: bcs.u128(),
        /**
         * Lifetime sum of every deposited value, in currency base units. Read-only
         * analytics — never decremented; not used by any on-chain logic.
         */
        cumulative_deposits: bcs.u128()
    } });
export const RoyaltyPoolKey = new MoveTuple({ name: `${$moduleName}::RoyaltyPoolKey<phantom Share, phantom Currency>`, fields: [bcs.bool()] });
export const RoyaltyPoolCreatedEvent = new MoveStruct({ name: `${$moduleName}::RoyaltyPoolCreatedEvent<phantom Share, phantom Currency>`, fields: {
        pool_id: bcs.Address,
        parent_id: bcs.Address
    } });
export const RoyaltyDepositedEvent = new MoveStruct({ name: `${$moduleName}::RoyaltyDepositedEvent<phantom Share, phantom Currency>`, fields: {
        pool_id: bcs.Address,
        value: bcs.u64()
    } });
export const StakeRegisteredEvent = new MoveStruct({ name: `${$moduleName}::StakeRegisteredEvent<phantom Share, phantom Currency>`, fields: {
        pool_id: bcs.Address,
        stake_id: bcs.Address,
        staked_amount: bcs.u64()
    } });
export const StakeUnregisteredEvent = new MoveStruct({ name: `${$moduleName}::StakeUnregisteredEvent<phantom Share, phantom Currency>`, fields: {
        pool_id: bcs.Address,
        stake_id: bcs.Address,
        unstaked_amount: bcs.u64()
    } });
export const RoyaltyClaimedEvent = new MoveStruct({ name: `${$moduleName}::RoyaltyClaimedEvent<phantom Share, phantom Currency>`, fields: {
        pool_id: bcs.Address,
        stake_id: bcs.Address,
        reward_amount: bcs.u64()
    } });
export interface NewArguments {
    parent: RawTransactionArgument<string>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        parent: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Construct a pool as a derived object of `parent`. The derivation key encodes
 * both type parameters, so the pool's address is determined entirely by
 * `(parent_id, Share, Currency)` — and therefore always names a pool of exactly
 * this type (see `RoyaltyPoolKey`).
 *
 * Cap-gating happens at the parent: callers must obtain `&mut UID` via whatever
 * cap-gated accessor the parent exposes.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["parent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
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
/** Share the pool object so holders can register and claim against it. */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface DepositArguments {
    self: RawTransactionArgument<string>;
    balance: TransactionArgument;
}
export interface DepositOptions {
    package?: string;
    arguments: DepositArguments | [
        self: RawTransactionArgument<string>,
        balance: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Fold a balance into the accumulator. Aborts on zero staked shares (the deposit
 * would be unattributable) or zero value (no-op deposits are rejected to keep
 * events meaningful).
 *
 * Callers obtain the `Balance<Currency>` however they like — typically by pulling
 * from a parent's pending coins or funds accumulator (see e.g.
 * `composition_royalty_distributor`).
 */
export function deposit(options: DepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "balance"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ReceiveAndDepositArguments {
    self: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveAndDepositOptions {
    package?: string;
    arguments: ReceiveAndDepositArguments | [
        self: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Receive `Coin<Currency>` objects sent directly to this pool's address and fold
 * them into the accumulator. Recovery path for funds delivered to the pool's
 * address rather than via the canonical extension path.
 */
export function receiveAndDeposit(options: ReceiveAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'receive_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SweepAndDepositArguments {
    self: RawTransactionArgument<string>;
}
export interface SweepAndDepositOptions {
    package?: string;
    arguments: SweepAndDepositArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Redeem the pool's funds settled at the start of the current consensus commit and
 * fold them into the royalty accumulator. Recovery path for funds delivered via
 * Sui's `send_funds` mechanism rather than via the canonical extension path.
 *
 * The framework returns at most `u64::MAX` per call. Any excess, along with funds
 * sent later in the current commit, remains for a subsequent sweep. Aborts with
 * `ENoSettledFunds` when no positive amount is currently eligible.
 */
export function sweepAndDeposit(options: SweepAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        '0x2::accumulator::AccumulatorRoot'
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'sweep_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RegisterStakeArguments {
    self: RawTransactionArgument<string>;
    stake: RawTransactionArgument<string>;
}
export interface RegisterStakeOptions {
    package?: string;
    arguments: RegisterStakeArguments | [
        self: RawTransactionArgument<string>,
        stake: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Register a stake with the pool. Records the stake's entry index so future
 * deposits accrue to it proportionally.
 *
 * Aborts if the stake is already registered with a pool of the same Currency.
 */
export function registerStake(options: RegisterStakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "stake"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'register_stake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnregisterStakeArguments {
    self: RawTransactionArgument<string>;
    stake: RawTransactionArgument<string>;
}
export interface UnregisterStakeOptions {
    package?: string;
    arguments: UnregisterStakeArguments | [
        self: RawTransactionArgument<string>,
        stake: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Unregister a stake from the pool. All claimable rewards must be drained first —
 * i.e., a final `claim_rewards` call must yield 0. Sub-base-unit residue
 * (`shares · index − debt < PRECISION`) does NOT block unregister, since it could
 * never be claimed as a whole base unit anyway. Forfeiting it on exit is the
 * deliberate semantics.
 */
export function unregisterStake(options: UnregisterStakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "stake"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'unregister_stake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ClaimRewardsArguments {
    self: RawTransactionArgument<string>;
    stake: RawTransactionArgument<string>;
}
export interface ClaimRewardsOptions {
    package?: string;
    arguments: ClaimRewardsArguments | [
        self: RawTransactionArgument<string>,
        stake: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Claim accrued rewards for a registered stake. Adds the payout to the
 * registration's debt, so sub-unit credit carries over to the next claim.
 */
export function claimRewards(options: ClaimRewardsOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "stake"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'claim_rewards',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PendingRewardsArguments {
    self: RawTransactionArgument<string>;
    stake: RawTransactionArgument<string>;
}
export interface PendingRewardsOptions {
    package?: string;
    arguments: PendingRewardsArguments | [
        self: RawTransactionArgument<string>,
        stake: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Compute pending rewards for a stake without claiming. Returns 0 if the stake is
 * not registered with this pool.
 */
export function pendingRewards(options: PendingRewardsOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "stake"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'pending_rewards',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface BalanceArguments {
    self: RawTransactionArgument<string>;
}
export interface BalanceOptions {
    package?: string;
    arguments: BalanceArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
export function balance(options: BalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface StakedSharesArguments {
    self: RawTransactionArgument<string>;
}
export interface StakedSharesOptions {
    package?: string;
    arguments: StakedSharesArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
export function stakedShares(options: StakedSharesOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'staked_shares',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CumulativeRewardPerShareArguments {
    self: RawTransactionArgument<string>;
}
export interface CumulativeRewardPerShareOptions {
    package?: string;
    arguments: CumulativeRewardPerShareArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
export function cumulativeRewardPerShare(options: CumulativeRewardPerShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'cumulative_reward_per_share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CarryArguments {
    self: RawTransactionArgument<string>;
}
export interface CarryOptions {
    package?: string;
    arguments: CarryArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Deposit remainder awaiting the next deposit, in `value · PRECISION` units. */
export function carry(options: CarryOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'carry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CumulativeDepositsArguments {
    self: RawTransactionArgument<string>;
}
export interface CumulativeDepositsOptions {
    package?: string;
    arguments: CumulativeDepositsArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Lifetime sum of all deposits, in currency base units. Strictly monotonic. */
export function cumulativeDeposits(options: CumulativeDepositsOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'cumulative_deposits',
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
        string,
        string
    ];
}
/**
 * Compute the deterministic address of a pool given its parent ID and `Currency`
 * type parameter. Useful for off-chain derivation and for cross-module checks that
 * the pool was minted from the expected parent.
 */
export function derivedAddress(options: DerivedAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["parentId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
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
/** Read-only verification that the pool was derived from the given parent ID. */
export function assertDerivedFrom(options: AssertDerivedFromOptions) {
    const packageAddress = options.package ?? '@local-pkg/royalty_pool';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "parentId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool',
        function: 'assert_derived_from',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}