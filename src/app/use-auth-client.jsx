import { AuthClient } from "@dfinity/auth-client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  canisterId as whoamiCanisterId,
  createActor as createWhoamiActor,
} from "../declarations/whoami";
import {
  canisterId as tokenCanisterId,
  createActor as createTokenActor,
} from "../declarations/token";
import {
  canisterId as stakingCanisterId,
  createActor as createStakingActor,
} from "../declarations/staking";

const AuthContext = createContext();

const IS_MAINNET = process.env.DFX_NETWORK === "ic";

export const LEDGER_HOST = IS_MAINNET ? "ic0.app" : "127.0.0.1:4943";

const defaultOptions = {
  /**
   *  @type {import("@dfinity/auth-client").AuthClientCreateOptions}
   */
  createOptions: {
    idleOptions: {
      // Set to true if you do not want idle functionality
      disableIdle: true,
    },
  },
  /**
   * @type {import("@dfinity/auth-client").AuthClientLoginOptions}
   */
  loginOptions: {
    identityProvider: IS_MAINNET
      ? "https://identity.ic0.app/#authorize"
      : `http://${LEDGER_HOST}?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai#authorize`,
  },
};

/**
 *
 * @param options - Options for the AuthClient
 * @param {AuthClientCreateOptions} options.createOptions - Options for the AuthClient.create() method
 * @param {AuthClientLoginOptions} options.loginOptions - Options for the AuthClient.login() method
 * @returns
 */
export const useAuthClient = (options = defaultOptions) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authClient, setAuthClient] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [whoamiActor, setWhoamiActor] = useState(null);
  const [tokenActor, setTokenActor] = useState(null);
  const [stakingActor, setStakingActor] = useState(null);

  useEffect(() => {
    // Initialize AuthClient
    AuthClient.create(options.createOptions).then(async (client) => {
      updateClient(client);
    });
  }, []);

  const login = () => {
    authClient.login({
      ...options.loginOptions,
      onSuccess: () => {
        updateClient(authClient);
      },
    });
  };

  async function updateClient(client) {
    const isAuthenticated = await client.isAuthenticated();
    setIsAuthenticated(isAuthenticated);

    const identity = client.getIdentity();
    setIdentity(identity);

    const principal = identity.getPrincipal();
    setPrincipal(principal);

    setAuthClient(client);

    const actor = createWhoamiActor(whoamiCanisterId, {
      agentOptions: {
        identity,
      },
    });

    const actor2 = createTokenActor(tokenCanisterId, {
      agentOptions: {
        identity,
      },
    });

    const actor3 = createStakingActor(stakingCanisterId, {
      agentOptions: {
        identity,
      },
    });

    setWhoamiActor(actor);
    setTokenActor(actor2);
    setStakingActor(actor3);
  }

  async function logout() {
    await authClient?.logout();
    await updateClient(authClient);
  }

  return {
    isAuthenticated,
    login,
    logout,
    authClient,
    identity,
    principal,
    whoamiActor,
    tokenActor,
    stakingActor,
  };
};

/**
 * @type {React.FC}
 */
export const AuthProvider = ({ children }) => {
  const auth = useAuthClient();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
