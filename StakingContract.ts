/**
 * OrangeShield OTC - StakingContract v1.0.0
 * OP_NET Testnet Compatible
 *
 * Arbitrator staking, reputation, and slashing.
 * Min stake: 0.001 tBTC. Rep starts at 100.
 * +10 correct vote / -5 wrong vote / -20 absence.
 * Slash: 10,000 sats per absence. De-listed if stake < minimum.
 */

const MIN_STAKE = 100_000n;
const SLASH_AMT = 10_000n;
const REP_CORRECT = 10;
const REP_WRONG = -5;
const REP_ABSENCE = -20;
const REP_MIN = 0;
const REP_MAX = 10_000;
const STAKED_KEY = "sk:staked:";
const STAKE_AMT = "sk:amount:";
const REP_KEY = "sk:rep:";
const SLASH_CNT = "sk:slashes:";
const STAKED_AT = "sk:ts:";
const ACTIVE_KEY = "sk:active:";
const ARB_LIST = "sk:list:";
const ARB_COUNT = "sk:count";
const ARB_AUTH = "sk:arbauth:";
const ADMIN_KEY = "sk:admin";

export class StakingContract {
  public initialize(adminAddress: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("StakingContract: already initialized");
    Storage.setString(ADMIN_KEY, adminAddress);
    Storage.setUint64(ARB_COUNT, 0n);
  }

  public stake(amountSats: bigint, callerAddress: string): void {
    if (amountSats < MIN_STAKE)
      throw new Error(`StakingContract: minimum stake is ${MIN_STAKE} sats (0.001 tBTC)`);
    if (Storage.getBool(STAKED_KEY + callerAddress))
      throw new Error("StakingContract: already staked - use increaseStake()");

    Storage.setBool(STAKED_KEY  + callerAddress, true);
    Storage.setUint256(STAKE_AMT + callerAddress, amountSats);
    Storage.setUint64(STAKED_AT  + callerAddress, Blockchain.blockTimestamp());
    Storage.setBool(ACTIVE_KEY   + callerAddress, true);
    Storage.setUint16(REP_KEY    + callerAddress, 100);
    Storage.setUint8(SLASH_CNT   + callerAddress, 0);

    const count = Storage.getUint64(ARB_COUNT) ?? 0n;
    Storage.setString(`${ARB_LIST}${count}`, callerAddress);
    Storage.setUint64(ARB_COUNT, count + 1n);

    Blockchain.emit("ArbitratorStaked", {
      arbitrator: callerAddress, amountSats, reputation: 100,
      timestamp: Blockchain.blockTimestamp(),
    });
  }

  public increaseStake(additionalSats: bigint, callerAddress: string): void {
    if (!Storage.getBool(STAKED_KEY + callerAddress))
      throw new Error("StakingContract: not staked");
    const current = Storage.getUint256(STAKE_AMT + callerAddress) ?? 0n;
    Storage.setUint256(STAKE_AMT + callerAddress, current + additionalSats);
    Blockchain.emit("StakeIncreased", { arbitrator: callerAddress, additionalSats });
  }

  public unstake(callerAddress: string): void {
    if (!Storage.getBool(STAKED_KEY + callerAddress)) throw new Error("StakingContract: not staked");
    if (!Storage.getBool(ACTIVE_KEY + callerAddress)) throw new Error("StakingContract: already unstaked");
    const amount = Storage.getUint256(STAKE_AMT + callerAddress) ?? 0n;
    Storage.setBool(ACTIVE_KEY   + callerAddress, false);
    Storage.setUint256(STAKE_AMT + callerAddress, 0n);
    Blockchain.transferBTC(callerAddress, amount);
    Blockchain.emit("ArbitratorUnstaked", { arbitrator: callerAddress, returnedSats: amount });
  }

  public rewardCorrectVote(arb: string): void {
    this.requireAuth(); this.adjustRep(arb, REP_CORRECT);
    Blockchain.emit("ReputationUpdated", { arbitrator: arb, delta: REP_CORRECT });
  }

  public penalizeWrongVote(arb: string): void {
    this.requireAuth(); this.adjustRep(arb, REP_WRONG);
    Blockchain.emit("ReputationUpdated", { arbitrator: arb, delta: REP_WRONG });
  }

  public penalizeAbsence(arb: string): void {
    this.requireAuth(); this.adjustRep(arb, REP_ABSENCE);
    const cnt = (Storage.getUint8(SLASH_CNT + arb) ?? 0) + 1;
    Storage.setUint8(SLASH_CNT + arb, cnt);
    const current = Storage.getUint256(STAKE_AMT + arb) ?? 0n;
    const newStake = current > SLASH_AMT ? current - SLASH_AMT : 0n;
    Storage.setUint256(STAKE_AMT + arb, newStake);
    if (newStake < MIN_STAKE) Storage.setBool(ACTIVE_KEY + arb, false);
    Blockchain.emit("StakeSlashed", { arbitrator: arb, slashedSats: SLASH_AMT, remaining: newStake, slashCount: cnt });
  }

  public getArbitratorInfo(address: string) {
    return {
      staked:      Storage.getBool(STAKED_KEY  + address) ?? false,
      active:      Storage.getBool(ACTIVE_KEY  + address) ?? false,
      stakeAmount: Storage.getUint256(STAKE_AMT + address) ?? 0n,
      reputation:  Storage.getUint16(REP_KEY   + address) ?? 0,
      slashCount:  Storage.getUint8(SLASH_CNT  + address) ?? 0,
      stakedAt:    Storage.getUint64(STAKED_AT  + address) ?? 0n,
    };
  }

  public getActiveArbitrators() {
    const count = Storage.getUint64(ARB_COUNT) ?? 0n;
    const result = [];
    for (let i = 0n; i < count; i++) {
      const addr = Storage.getString(`${ARB_LIST}${i}`);
      if (!addr || !Storage.getBool(ACTIVE_KEY + addr)) continue;
      result.push({
        address: addr,
        stakeAmount: Storage.getUint256(STAKE_AMT + addr) ?? 0n,
        reputation: Storage.getUint16(REP_KEY + addr) ?? 0,
      });
    }
    return result;
  }

  public authorizeArbitrationContract(addr: string, caller: string): void {
    if (Storage.getString(ADMIN_KEY) !== caller) throw new Error("StakingContract: admin only");
    Storage.setBool(ARB_AUTH + addr, true);
  }

  private adjustRep(addr: string, delta: number): void {
    const cur = Storage.getUint16(REP_KEY + addr) ?? 0;
    let   upd = cur + delta;
    if (upd < REP_MIN) upd = REP_MIN;
    if (upd > REP_MAX) upd = REP_MAX;
    Storage.setUint16(REP_KEY + addr, upd);
  }

  private requireAuth(): void {
    if (!Storage.getBool(ARB_AUTH + Blockchain.callerAddress()))
      throw new Error("StakingContract: ArbitrationContract only");
  }
}
