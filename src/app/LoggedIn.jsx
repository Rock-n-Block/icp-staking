import React, { useEffect } from "react";
// import { AccountIdentifier, LedgerCanister } from "@dfinity/nns";
import { LedgerCanister, AccountIdentifier } from "@dfinity/ledger-icp";
import { Principal } from "@dfinity/principal";
import { TokenAmount, ICPToken } from "@dfinity/utils";
import { useAuth } from "./use-auth-client";
import { canisterId as stakingCanisterId } from "../declarations/staking";
import { toast } from "react-toastify";
import { AnonymousIdentity, HttpAgent } from "@dfinity/agent";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const whoamiStyles = {
  border: "1px solid #1a1a1a",
  marginBottom: "1rem",
};

export const E8S_PER_ICP = 100_000_000;
export const DEFAULT_TRANSACTION_FEE_E8S = 10_000;
export const ONE_TRILLION = 1_000_000_000_000;

export const ICP_DISPLAYED_DECIMALS = 2;

export const ICP_DISPLAYED_HEIGHT_DECIMALS = 8;

/**
 * TODO: remove and replace with Icrc "decimals"
 * @deprecated use decimals in IcrcTokenMetadata
 */
export const ICP_DISPLAYED_DECIMALS_DETAILED = 8;

const countDecimals = (value) => {
  // "1e-7" -> 0.00000001
  const asText = value.toFixed(10).replace(/0*$/, "");
  const split = asText.split(".");

  return Math.max(split[1]?.length ?? 0, ICP_DISPLAYED_DECIMALS);
};

/**
 * Jira L2-666:
 * - If ICP is zero then 0 should be displayed - i.e. without decimals
 * - ICP with round number (12.0) should be displayed 12.00
 * - ICP should be displayed with max. 2 decimals (12.1 → 12.10, 12.12353 → 12.12, 12.00003 → 12.00) in Accounts, but with up to 8 decimals without tailing 0s in transaction details.
 * - However, if ICP value is lower than 0.01 then it should be as it is without tailing 0s up to 8 decimals (e.g., 0.000003 is displayed as 0.000003)
 *
 * Jira GIX-1563:
 * - However, if requested, some amount might be displayed with a fix length of 8 decimals, regardless if leading zero or no leading zero
 */
// https://github.com/dfinity/nns-dapp/blob/main/frontend/src/lib/utils/token.utils.ts#L39
export const formatToken = ({ value, detailed = false, roundingMode }) => {
  if (value === BigInt(0)) {
    return "0";
  }

  const converted = Number(value) / E8S_PER_ICP;

  const decimalsICP = () =>
    converted < 0.01
      ? Math.max(countDecimals(converted), ICP_DISPLAYED_DECIMALS)
      : detailed
      ? Math.min(countDecimals(converted), ICP_DISPLAYED_DECIMALS_DETAILED)
      : ICP_DISPLAYED_DECIMALS;

  const decimals =
    detailed === "height_decimals"
      ? ICP_DISPLAYED_HEIGHT_DECIMALS
      : decimalsICP();

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    // "roundingMode" not present in `NumberFormatOptions`.
    // But it's supported by most modern browsers: https://caniuse.com/mdn-javascript_builtins_intl_numberformat_numberformat_options_roundingmode_parameter
    // eslint-disable-next-line
    // @ts-ignore
    roundingMode,
  })
    .format(converted)
    .replace(/,/g, "'");
};

function LoggedIn() {
  const [result, setResult] = React.useState("");
  // const [principal2, setPrincipal] = React.useState("");
  const [balance, setBalance] = React.useState(
    "Ledger canister is not deployed locally"
  );
  const [tokenInfo, setTokenInfo] = React.useState({});
  const [tokenBalance, setTokenBalance] = React.useState(undefined);
  const [stakeInfo, setStakeInfo] = React.useState({});
  const [depositAmount, setDepositAmount] = React.useState("");
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [totalStaked, setTotalStaked] = React.useState("");
  const [totalRewardDebt, setTotalRewardDebt] = React.useState("");
  const [stakingTokenBalance, setStakingTokenBalance] = React.useState("");
  const [pendingReward, setPendingReward] = React.useState(0);

  const {
    whoamiActor,
    tokenActor,
    stakingActor,
    logout,

    identity,
    authClient,
    principal,
  } = useAuth();

  // const handleGetBalance = async () => {
  //   // DFX_NETWORK='local'
  //   // 127.0.0.1:4943
  //   // const onlineHost = "https://ic0.app";
  //   // const agent = await createAgent({
  //   //   identity,
  //   //   host: HOST,
  //   // });
  //   // const agent: HttpAgent = new HttpAgent({
  //   //   host: HOST,
  //   //   identity,
  //   // });

  //   const agent = new HttpAgent({
  //     identity,
  //     // host: "http://127.0.0.1:4943",
  //     // host: "http://127.0.0.1:56147",
  //   });

  //   const accountIdentifier = AccountIdentifier.fromPrincipal({
  //     principal: Principal.fromText(
  //       "pu5xr-k2zer-kcw6b-oczsa-b2giv-7la5f-4smhh-zjfro-y6j2b-53aed-iae"
  //     ),
  //     // principal,
  //   });
  //   const ledger = LedgerCanister.create({
  //     canisterId
  //     // agent: new HttpAgent({
  //     //   identity: new AnonymousIdentity(),
  //     // }),
  //   });
  //   const balance = await ledger.accountBalance({ accountIdentifier });
  //   // const ledger = LedgerCanister.create();
  //   // const accountIdentifier = AccountIdentifier.fromPrincipal(
  //   //   "efa01544f509c56dd85449edf2381244a48fad1ede5183836229c00ab00d52df"
  //   // );
  //   // const balance = await ledger.accountBalance({ accountIdentifier });
  //   const formateedToken = formatToken({
  //     value: balance,
  //     detailed: true,
  //     roundingMode: "floor",
  //   });
  //   console.log(formateedToken);
  //   setBalance(formateedToken);
  // };

  const handleGetTokenInfo = async () => {
    const tokenMetadata = await tokenActor.getMetadata();
    setTokenInfo({ ...tokenMetadata });

    const tokenBalance_ = await tokenActor.balanceOf(principal);
    setTokenBalance(
      Number(tokenBalance_) / Math.pow(10, Number(tokenMetadata.decimals))
    );
    // setTokenName(getToken
  };

  useEffect(() => {
    const identity = authClient.getIdentity();
    // const principal2 = identity.getPrincipal();
    // setPrincipal(principal2);
    // handleGetBalance();
    handleGetTokenInfo();
    handleUpdate();
  }, []);

  const handleClick = async () => {
    const whoami = await whoamiActor.whoami();
    setResult(whoami);
  };

  const handleUpdate = async () => {
    const tokenDecimals = await tokenActor.decimals();

    const stakingTotalStaked = await stakingActor.totalStaked();
    setTotalStaked(
      Number(stakingTotalStaked) / Math.pow(10, Number(tokenDecimals))
    );
    const stakingRewardDebt = await stakingActor.totalRewardDebt();
    setTotalRewardDebt(
      Number(stakingRewardDebt) / Math.pow(10, Number(tokenDecimals))
    );
    const stakingTokenBalance_ = await stakingActor.myTokenBalance();
    setStakingTokenBalance(
      Number(stakingTokenBalance_) / Math.pow(10, Number(tokenDecimals))
    );

    try {
      const myStakeInfo = await stakingActor.stakeInfoOf(principal);
      myStakeInfo.amount =
        Number(myStakeInfo.amount) / Math.pow(10, Number(tokenDecimals));
      setStakeInfo(myStakeInfo);
    } catch {
      setStakeInfo({});
    }

    const pendingReward_ = await stakingActor.getPendingReward(principal);
    setPendingReward(
      Number(pendingReward_) / Math.pow(10, Number(tokenDecimals))
    );

    handleGetTokenInfo();
  };

  const handleDeposit = async () => {
    const depositAmount_ = BigInt(
      Number(depositAmount) * Math.pow(10, Number(tokenInfo.decimals))
    );
    await tokenActor.approve(
      Principal.fromText(stakingCanisterId),
      depositAmount_
    );
    await stakingActor.deposit(depositAmount_);

    toast.success(`${depositAmount_} deposited`);
    handleUpdate();
  };

  const handleClaim = async () => {
    await stakingActor.claim();

    toast.success("token claimed");
    handleUpdate();
  };

  const handleWithdraw = async () => {
    try {
      await stakingActor.withdraw(
        BigInt(
          Number(withdrawAmount) * Math.pow(10, Number(tokenInfo.decimals))
        )
      );

      toast.success(`${withdrawAmount} tokens has been withdrawn claimed`);
      handleUpdate();
    } catch (error) {
      const errMsg = error?.toString?.().split("Reject text: ");
      if (errMsg[1]) {
        toast.error(errMsg[1]);
      }
      throw error;
    }
  };

  return (
    <div className="container">
      <h1>Internet Identity Client</h1>
      <h2>Staking</h2>
      <hr />
      <p>Your Identity principal: {principal?.toText?.()}</p>
      <button
        type="button"
        id="whoamiButton"
        className="primary"
        onClick={handleClick}
      >
        Who am I?
      </button>
      <input
        type="text"
        readOnly
        id="whoami"
        value={result}
        placeholder="your Identity"
        style={whoamiStyles}
      />
      <p>Your ICP balance: {balance.toString()}</p>
      <hr />
      <div>
        {Object.entries(tokenInfo ?? {}).map(([key, value]) => (
          <p key={key}>
            <b>{key}</b>: {JSON.stringify(value)}
          </p>
        ))}
        {tokenInfo.logo && (
          <img
            src={tokenInfo.logo}
            alt="logo"
            style={{ minWidth: 32, width: 32, height: 32 }}
          />
        )}
        {/* {JSON.stringify(tokenInfo)} */}
        <p>balance: {tokenBalance}</p>
      </div>
      <hr />
      {/* <p>To see how a canister views you, click this button!</p>
      <hr /> */}
      Staking canister
      <p>
        <b>Total staked:</b> {JSON.stringify(totalStaked)}
      </p>
      <p>
        <b>Total reward debt:</b> {JSON.stringify(totalRewardDebt)}
      </p>
      <p>
        <b>Staking token balance:</b> {JSON.stringify(stakingTokenBalance)}
      </p>
      <hr />
      <input
        placeholder="Stake amount"
        onChange={(e) => setDepositAmount(e.target.value)}
      />
      <button onClick={handleDeposit}>deposit</button>
      <button onClick={handleUpdate}>Update</button>
      stake info:
      <div>
        {Object.entries(stakeInfo ?? {}).map(([key, value]) => (
          <div key={key}>
            <b>{key}</b>: {JSON.stringify(value)}
          </div>
        ))}
      </div>
      pending staking reward:
      <p>{pendingReward}</p>
      <button onClick={handleClaim}>claim</button>
      <input
        placeholder="Withdraw amount"
        onChange={(e) => setWithdrawAmount(e.target.value)}
      />
      <button onClick={handleWithdraw}>withdraw</button>
      <hr />
      <button id="logout" onClick={logout}>
        log out
      </button>
    </div>
  );
}

export default LoggedIn;
