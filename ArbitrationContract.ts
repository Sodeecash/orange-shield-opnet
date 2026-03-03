/**
 * OrangeShield OTC - ArbitrationContract v1.0.0
 * OP_NET Testnet Compatible
 *
 * 3-of-5 majority voting. Votes: BUYER_WINS | SELLER_WINS | SPLIT_50_50.
 * Auto-finalizes at majority or all 5 votes.
 * Updates StakingContract reputation. Executes via MultiSigExecution.
 */

const CASE_OPEN = "arb:open:";
const VOTE_CAST = "arb:vote:";
const VOTE_VAL = "arb:vval:";
const VOTES_B = "arb:vb:";
const VOTES_S = "arb:vs:";
const VOTES_SP = "arb:vsp:";
const TOTAL_V = "arb:tot:";
const RESULT_KEY = "arb:result:";
const FINAL_KEY = "arb:final:";
const CORE_ADDR = "arb:core";
const STAKE_ADDR = "arb:stake";
const MULTISIG_ADDR = "arb:ms";
const DISPUTE_ADDR = "arb:disp";
const ADMIN_KEY = "arb:admin";

export const enum VoteOption { BUYER_WINS = 0, SELLER_WINS = 1, SPLIT_50_50 = 2 }
export const enum ArbResult { PENDING = 0, BUYER_WINS = 1, SELLER_WINS = 2, SPLIT_50_50 = 3 }

export class ArbitrationContract {
  public initialize(
    admin: string, core: string, stake: string, multisig: string, dispute: string,
  ): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("ArbitrationContract: already initialized");
    Storage.setString(ADMIN_KEY, admin);
    Storage.setString(CORE_ADDR, core);
    Storage.setString(STAKE_ADDR, stake);
    Storage.setString(MULTISIG_ADDR, multisig);
    Storage.setString(DISPUTE_ADDR, dispute);
  }

  public openArbitrationCase(
    escrowId: bigint, arbitrators: string[], filer: string, reason: string,
  ): void {
    if (Blockchain.callerAddress() !== Storage.getString(DISPUTE_ADDR))
      throw new Error("ArbitrationContract: only DisputeContract");
    const eid = escrowId.toString();
    if (Storage.getBool(CASE_OPEN + eid)) throw new Error("ArbitrationContract: case already open");
    Storage.setBool(CASE_OPEN + eid, true);
    Storage.setUint8(VOTES_B  + eid, 0);
    Storage.setUint8(VOTES_S  + eid, 0);
    Storage.setUint8(VOTES_SP + eid, 0);
    Storage.setUint8(TOTAL_V  + eid, 0);
    Storage.setUint8(RESULT_KEY + eid, ArbResult.PENDING);
    Blockchain.emit("ArbitrationCaseOpened", { escrowId, arbitrators, filer, reason });
  }

  public submitVote(escrowId: bigint, vote: VoteOption, callerAddress: string): void {
    const eid = escrowId.toString();
    if (!Storage.getBool(CASE_OPEN + eid)) throw new Error("ArbitrationContract: no open case");
    if (Storage.getBool(FINAL_KEY + eid)) throw new Error("ArbitrationContract: already finalized");

    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (!info.arbitrators.includes(callerAddress))
      throw new Error("ArbitrationContract: not an assigned arbitrator");

    const voteKey = `${VOTE_CAST}${eid}:${callerAddress}`;
    if (Storage.getBool(voteKey)) throw new Error("ArbitrationContract: already voted");
    Storage.setBool(voteKey, true);
    Storage.setUint8(`${VOTE_VAL}${eid}:${callerAddress}`, vote);

    const total = (Storage.getUint8(TOTAL_V + eid) ?? 0) + 1;
    Storage.setUint8(TOTAL_V + eid, total);
    if (vote === 0) Storage.setUint8(VOTES_B  + eid, (Storage.getUint8(VOTES_B  + eid) ?? 0) + 1);
    else if (vote === 1) Storage.setUint8(VOTES_S  + eid, (Storage.getUint8(VOTES_S  + eid) ?? 0) + 1);
    else Storage.setUint8(VOTES_SP + eid, (Storage.getUint8(VOTES_SP + eid) ?? 0) + 1);

    Blockchain.emit("VoteSubmitted", { escrowId, arbitrator: callerAddress, vote, total });

    const bv = Storage.getUint8(VOTES_B  + eid) ?? 0;
    const sv = Storage.getUint8(VOTES_S  + eid) ?? 0;
    const spv= Storage.getUint8(VOTES_SP + eid) ?? 0;
    if (bv >= 3 || sv >= 3 || spv >= 3 || total === 5) {
      this.finalize(escrowId, eid, info, bv, sv, spv);
    }
  }

  private finalize(escrowId: bigint, eid: string, info: any, bv: number, sv: number, spv: number): void {
    Storage.setBool(FINAL_KEY + eid, true);
    let result: ArbResult;
    if (bv >= sv && bv >= spv) result = ArbResult.BUYER_WINS;
    else if (sv >= bv && sv >= spv) result = ArbResult.SELLER_WINS;
    else result = ArbResult.SPLIT_50_50;
    Storage.setUint8(RESULT_KEY + eid, result);

    Blockchain.getContract(Storage.getString(MULTISIG_ADDR)!).executePayout(escrowId, result, info);
    const staking = Blockchain.getContract(Storage.getString(STAKE_ADDR)!);
    for (let i = 0; i < 5; i++) {
      const arb = info.arbitrators[i];
      const voted = Storage.getBool(`${VOTE_CAST}${eid}:${arb}`) ?? false;
      if (!voted) { staking.penalizeAbsence(arb); }
      else {
        const arbVote = Storage.getUint8(`${VOTE_VAL}${eid}:${arb}`) ?? 99;
        if (arbVote === result - 1) staking.rewardCorrectVote(arb);
        else staking.penalizeWrongVote(arb);
      }
    }
    Blockchain.emit("ArbitrationFinalized", {
      escrowId, result, buyerVotes: bv, sellerVotes: sv, splitVotes: spv,
      timestamp: Blockchain.blockTimestamp(),
    });
  }

  public getCaseStatus(escrowId: bigint) {
    const eid = escrowId.toString();
    return {
      isOpen:      Storage.getBool(CASE_OPEN  + eid) ?? false,
      isFinalized: Storage.getBool(FINAL_KEY  + eid) ?? false,
      result:      Storage.getUint8(RESULT_KEY + eid) ?? 0,
      totalVotes:  Storage.getUint8(TOTAL_V   + eid) ?? 0,
      buyerVotes:  Storage.getUint8(VOTES_B   + eid) ?? 0,
      sellerVotes: Storage.getUint8(VOTES_S   + eid) ?? 0,
      splitVotes:  Storage.getUint8(VOTES_SP  + eid) ?? 0,
    };
  }
}
