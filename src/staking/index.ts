import {
  Canister,
  query,
  text,
  update,
  Void,
  ic,
  Principal,
  nat,
  StableBTreeMap,
  Record,
  nat8,
  Result,
  Variant,
  Null,
  init,
  Opt,
} from "azle";
import { duration } from "moment";

const IdentityId = Principal;
const TokenAmount = nat;

const TxReceipt = Result(
  nat,
  Variant({
    InsufficientAllowance: Null,
    InsufficientBalance: Null,
    ErrorOperationStyle: Null,
    Unauthorized: Null,
    LedgerTrap: Null,
    ErrorTo: Null,
    Other: text,
    BlockUsed: Null,
    AmountTooSmall: Null,
  })
);

// https://github.com/Psychedelic/DIP20/blob/main/spec.md
// https://github.com/akshay-rakheja/supernova2022/blob/master/azle/src/dip20.ts
const Dip20Canister = Canister({
  transfer: update([IdentityId, TokenAmount], TxReceipt),
  transferFrom: update([IdentityId, IdentityId, TokenAmount], TxReceipt),
  approve: update([IdentityId, TokenAmount], TxReceipt),
  balanceOf: query([IdentityId], TokenAmount),
  decimals: query([], nat8),
  allowance: query([IdentityId, IdentityId], nat),
});

const TOKEN_CANISTER_ID = "ajuq4-ruaaa-aaaaa-qaaga-cai"; // dfx canister id token

const tokenCanister = Dip20Canister(Principal.fromText(TOKEN_CANISTER_ID));

const STAKE_YEAR_PERCENT = 15;

// let totalStaked = BigInt(0);
// let totalRewardDebt = BigInt(0);

const Stake = Record({
  amount: nat,
  createdAt: nat,
  updatedAt: nat,
  rewardDebt: nat,
  // totalRewardGot: nat,
});

enum StableStorageKey {
  TotalStaked = "totalStaked",
  TotalRewardDebt = "totalRewardDebt",
}

const stableStorage = StableBTreeMap(text, nat, 0);

const getOptSomeOrDefault = <T>(opt: Opt<T>, defaultValue: T) => {
  if ("None" in opt) {
    return defaultValue;
  }
  return opt.Some;
};

const getTotalStaked = () => {
  return getOptSomeOrDefault(
    stableStorage.get(StableStorageKey.TotalStaked),
    BigInt(0)
  );
};

const getTotalRewardDebt = () => {
  return getOptSomeOrDefault(
    stableStorage.get(StableStorageKey.TotalRewardDebt),
    BigInt(0)
  );
};

const setTotalStaked = (totalStaked: nat) => {
  return stableStorage.insert(StableStorageKey.TotalStaked, totalStaked);
};

const setTotalRewardDebt = (totalRewardDebt: nat) => {
  return stableStorage.insert(
    StableStorageKey.TotalRewardDebt,
    totalRewardDebt
  );
};

const stakeInfo = StableBTreeMap(IdentityId, Stake, 1);

const getPendingReward = (who: Principal) => {
  const stakeOpt = stakeInfo.get(who);
  if ("None" in stakeOpt) {
    return BigInt(0);
  }
  const stake = stakeOpt.Some;

  const nanosecondsPassed = Number(ic.time() - stake.updatedAt);
  // const yearSeconds = BigInt(duration({ year: 1 }).asSeconds());
  const yearNanoseconds = duration({ hour: 1 }).asSeconds() * 1e9;
  console.log(
    `getPendingReward: amount=${stake.amount}, nanosecondsPassed=${nanosecondsPassed}, yearNanoseconds=${yearNanoseconds}`
  );
  const reward =
    Number(stake.amount) *
    (STAKE_YEAR_PERCENT / 100) *
    (nanosecondsPassed / yearNanoseconds);

  return BigInt(Math.floor(reward));
};

const giveReward = async (who: Principal, amount: nat) => {
  console.log(`giveReward: to=${who.toText()}, amount=${amount.toString()}`);
  const stake = stakeInfo.get(who).Some!;
  const totalStaked = getTotalStaked();
  const stakingTokenBalance = await ic.call(tokenCanister.balanceOf, {
    args: [ic.id()],
  });
  console.log(`giveReward: stakingTokenBalance=${stakingTokenBalance}`);

  let transferAmount: nat;
  // when staking
  if (stakingTokenBalance >= totalStaked + amount) {
    transferAmount = amount;
  } else {
    transferAmount = stakingTokenBalance - totalStaked;

    const stakeRewardDebt = amount - transferAmount;
    const totalRewardDebt = getTotalRewardDebt();
    setTotalRewardDebt(totalRewardDebt + stakeRewardDebt);
    stake.rewardDebt += stakeRewardDebt;
  }

  console.log(`giveReward: transferAmount=${transferAmount}`);
  if (transferAmount > BigInt(0)) {
    console.log(
      `giveReward: calling tokenCanister.transfer to ${who.toText()}, amount=${transferAmount}`
    );
    // transfer amount from balance of this canister to balance of identity
    const transferTxReceipt = await ic.call(tokenCanister.transfer, {
      args: [who, transferAmount],
    });
    console.log(
      `giveReward: transferTxReceipt=${transferTxReceipt.Ok}, err=${transferTxReceipt.Err}`
    );
  }

  stakeInfo.insert(who, stake);
};

const claimReward = async (who: Principal) => {
  const stakeOpt = stakeInfo.get(who);
  if ("None" in stakeOpt) {
    return; // if user don't have a stake do nothing
  }
  const stake = stakeOpt.Some;

  let pendingReward = getPendingReward(who);
  console.log(`claimReward: pendingReward=${pendingReward}`);
  const stakeRewardDebt = stake.rewardDebt;
  if (stakeRewardDebt > 0) {
    const totalRewardDebt = getTotalRewardDebt();
    setTotalRewardDebt(totalRewardDebt - stakeRewardDebt);
    pendingReward += stakeRewardDebt;

    stake.rewardDebt = BigInt(0);
  }
  if (pendingReward > 0) {
    await giveReward(who, pendingReward);
  }

  stake.updatedAt = ic.time();
  stakeInfo.insert(who, stake);
};

const IS_DEV = true;

export default Canister({
  init: init([], () => {
    console.log("Canister is initialized");
    stableStorage.insert(StableStorageKey.TotalStaked, BigInt(0));
    stableStorage.insert(StableStorageKey.TotalRewardDebt, BigInt(0));
  }),
  ...(IS_DEV && {
    myId: query([], Principal, () => ic.id()),
    whoami: query([], Principal, () => {
      return ic.caller();
    }),
    tokenId: query([], text, () => {
      return process.env.TOKEN_CANISTER_ID!;
    }),
    tokenBalanceOf: query([Principal], nat, async (id) => {
      return await ic.call(tokenCanister.balanceOf, { args: [id] });
    }),
    myTokenBalance: query([], nat, async () => {
      return await ic.call(tokenCanister.balanceOf, { args: [ic.id()] });
    }),
    myAllowance: query([Principal], nat, async (owner) => {
      return await ic.call(tokenCanister.allowance, { args: [owner, ic.id()] });
    }),
    totalStaked: query([], nat, async () => {
      const totalStaked = getTotalStaked();
      console.log(`totalStaked: totalStaked=${totalStaked}`);
      return totalStaked;
    }),
    totalRewardDebt: query([], nat, async () => {
      const totalRewardDebt = getTotalRewardDebt();
      console.log(`totalRewardDebt: totalRewardDebt=${totalRewardDebt}`);
      return totalRewardDebt;
    }),
    stakeInfoOf: query([Principal], Stake, (who) => {
      const stakeInfoOpt = stakeInfo.get(who);
      if ("None" in stakeInfoOpt) {
        ic.trap("No stake");
      }
      return stakeInfoOpt.Some!;
    }),
    transferTokenFromToMe: update(
      [Principal, nat],
      TxReceipt,
      async (who, amount) => {
        return await ic.call(tokenCanister.transferFrom, {
          args: [who, ic.id(), amount],
        });
      }
    ),
    getPendingReward: query([Principal], nat, (who) => getPendingReward(who)),
    testCurrentIcTime: query([], nat, () => ic.time()),
    testMomentWeek: query([], nat, () =>
      BigInt(duration({ week: 1 }).asSeconds() * 1e9)
    ),
    testMomentYear: query([], nat, () =>
      BigInt(duration({ year: 1 }).asSeconds() * 1e9)
    ),
  }),
  deposit: update([TokenAmount], Void, async (amount) => {
    if (amount <= 0) {
      ic.trap("Amount must be positive");
    }

    const stakingAllowance = await ic.call(tokenCanister.allowance, {
      args: [ic.caller(), ic.id()],
    });
    console.log(`deposit: stakingAllowance=${stakingAllowance}`);
    if (amount > stakingAllowance) {
      ic.trap(
        "Staking canister is not allowed to spend this amount of tokens, please call approve first"
      );
    }
    console.log(`deposit: depositing amount=${amount} to canister`);
    await ic.call(tokenCanister.transferFrom, {
      args: [ic.caller(), ic.id(), amount],
    });

    const stakeOpt = stakeInfo.get(ic.caller());
    let stake: typeof Stake;
    if ("None" in stakeOpt) {
      console.log(`deposit: creating new stake`);
      stake = {
        amount: amount,
        createdAt: ic.time(),
        updatedAt: ic.time(),
        rewardDebt: BigInt(0),
      };
    } else {
      console.log(`deposit: claim reward from previous stake`);
      await claimReward(ic.caller());

      console.log(`deposit: increasing old stake: amount={stake.amount}, `);
      stake = stakeOpt.Some;
      stake.createdAt = ic.time();
      stake.amount += amount;
    }

    console.log(`deposit: stake amount=${stake.amount}`);
    stakeInfo.insert(ic.caller(), stake);

    const totalStaked = getTotalStaked();
    setTotalStaked(totalStaked + stake.amount);
  }),
  withdraw: update([TokenAmount], Void, async (amount) => {
    const stakeOpt = stakeInfo.get(ic.caller());
    if ("None" in stakeOpt) {
      return; // if user don't have a stake do nothing
    }
    const stake = stakeOpt.Some;

    if (amount > stake.amount) {
      ic.trap("Amount is more than staked amount");
    }
    // const weekSeconds = BigInt(duration({ week: 1 }).asSeconds() * 1e9);
    const weekSeconds = BigInt(duration({ minutes: 2 }).asSeconds() * 1e9);
    if (ic.time() < stake.createdAt + weekSeconds) {
      ic.trap("Can't withdraw right now. Please wait 7 days since deposit");
    }

    await claimReward(ic.caller());

    await giveReward(ic.caller(), amount);

    const totalStaked = getTotalStaked();
    setTotalStaked(totalStaked - amount);
    stake.amount -= amount;
    stakeInfo.insert(ic.caller(), stake);
  }),
  claim: update([], Void, async () => await claimReward(ic.caller())),
});
