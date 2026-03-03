/**
 * OrangeShield OTC - FundingContract v1.0.0
 * OP_NET Testnet Compatible
 *
 * Accepts tBTC deposits. Min 0.001 tBTC.
 * Splits 2% fee: 50% Treasury / 30% Stakers / 20% Insurance.
 */

const MIN_DEPOSIT_SATS = 100_000n;
const PROTOCOL_FEE_BPS = 200n;
const TREASURY_BPS = 5000n;
const STAKER_BPS = 3000n;
const LOCKED_KEY = "fn:locked:";
const NET_KEY = "fn:net:";
const FEE_KEY = "fn:fee:";
const FUNDED_AT = "fn:ts:";
const TREASURY = "fn:treasury";
const STAKERS = "fn:stakers";
const INSURANCE = "fn:insurance";
const VOLUME = "fn:volume";
const CORE_ADDR = "fn:core";
const EXEC_AUTH = "fn:exec:";
const ADMIN_KEY = "fn:admin";

export class FundingContract {
  public initialize(adminAddress: string, coreAddress: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("FundingContract: already initialized");
    Storage.setString(ADMIN_KEY, adminAddress);
    Storage.setString(CORE_ADDR, coreAddress);
    Blockchain.emit("Initialized", { admin: adminAddress, core: coreAddress });
  }

  public depositFunds(escrowId: bigint, depositSats: bigint, senderAddress: string): void {
    if (depositSats < MIN_DEPOSIT_SATS)
      throw new Error(`FundingContract: min deposit is ${MIN_DEPOSIT_SATS} sats (0.001 tBTC)`);

    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (info.status !== 0) throw new Error("FundingContract: escrow must be PENDING");
    if (info.buyer !== senderAddress) throw new Error("FundingContract: only buyer can fund");
    if (depositSats < info.amount) throw new Error("FundingContract: deposit below agreed amount");

    const feeSats = (depositSats * PROTOCOL_FEE_BPS) / 10_000n;
    const netSats = depositSats - feeSats;
    const treasuryCut = (feeSats * TREASURY_BPS) / 10_000n;
    const stakerCut = (feeSats * STAKER_BPS) / 10_000n;
    const insuranceCut = feeSats - treasuryCut - stakerCut;

    const eid = escrowId.toString();
    Storage.setBool(LOCKED_KEY + eid, true);
    Storage.setUint256(NET_KEY + eid, netSats);
    Storage.setUint256(FEE_KEY + eid, feeSats);
    Storage.setUint64(FUNDED_AT + eid, Blockchain.blockTimestamp());
    Storage.setUint256(TREASURY,  (Storage.getUint256(TREASURY)  ?? 0n) + treasuryCut);
    Storage.setUint256(STAKERS,   (Storage.getUint256(STAKERS)   ?? 0n) + stakerCut);
    Storage.setUint256(INSURANCE, (Storage.getUint256(INSURANCE) ?? 0n) + insuranceCut);
    Storage.setUint256(VOLUME,    (Storage.getUint256(VOLUME)    ?? 0n) + depositSats);

    core.updateStatus(escrowId, 1, Blockchain.contractAddress());
    Blockchain.emit("FundsDeposited", {
      escrowId, depositSats, feeSats, netSats,
      treasuryCut, stakerCut, insuranceCut, senderAddress,
      timestamp: Blockchain.blockTimestamp(),
    });
  }

  public releaseFunds(escrowId: bigint, recipient: string, amountSats: bigint, callerAddress: string): void {
    if (!Storage.getBool(EXEC_AUTH + callerAddress))
      throw new Error("FundingContract: unauthorized executor");
    const eid = escrowId.toString();
    if (!Storage.getBool(LOCKED_KEY + eid)) throw new Error("FundingContract: not funded");
    const net = Storage.getUint256(NET_KEY + eid) ?? 0n;
    if (amountSats > net) throw new Error("FundingContract: exceeds locked amount");
    const remaining = net - amountSats;
    Storage.setUint256(NET_KEY + eid, remaining);
    if (remaining === 0n) Storage.setBool(LOCKED_KEY + eid, false);
    Blockchain.transferBTC(recipient, amountSats);
    Blockchain.emit("FundsReleased", { escrowId, recipient, amountSats, remaining });
  }

  public authorizeExecutor(executorAddress: string, caller: string): void {
    if (Storage.getString(ADMIN_KEY) !== caller) throw new Error("FundingContract: admin only");
    Storage.setBool(EXEC_AUTH + executorAddress, true);
  }

  public getLockedAmount(escrowId: bigint): bigint {
    return Storage.getUint256(NET_KEY + escrowId.toString()) ?? 0n;
  }
  public getTreasuryBalance(): bigint  { return Storage.getUint256(TREASURY)  ?? 0n; }
  public getStakerPool(): bigint       { return Storage.getUint256(STAKERS)   ?? 0n; }
  public getInsuranceBalance(): bigint { return Storage.getUint256(INSURANCE) ?? 0n; }
  public getTotalVolume(): bigint      { return Storage.getUint256(VOLUME)    ?? 0n; }
}
