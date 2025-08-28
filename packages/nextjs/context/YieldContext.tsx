"use client";
import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";

// Enhanced interfaces for complex state management
interface ProtocolData {
  address: string;
  name: string;
  yield: bigint;
  apy: number;
  tvl: bigint;
  lastUpdated: number;
  isActive: boolean;
  metadata?: {
    category: "lending" | "dex" | "farming" | "staking";
    version: string;
    risk: "low" | "medium" | "high";
  };
}

interface YieldState {
  protocols: Record<string, ProtocolData>;
  totalYield: bigint;
  totalTvl: bigint;
  isLoading: boolean;
  error: string | null;
  lastGlobalUpdate: number;
  optimisticUpdates: Record<string, Partial<ProtocolData>>;
  backgroundSync: boolean;
  retryQueue: Array<{ action: string; payload: any; timestamp: number }>;
}

type YieldAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "UPDATE_PROTOCOL"; payload: { address: string; data: Partial<ProtocolData> } }
  | { type: "ADD_PROTOCOL"; payload: ProtocolData }
  | { type: "REMOVE_PROTOCOL"; payload: string }
  | { type: "SET_PROTOCOLS"; payload: ProtocolData[] }
  | { type: "UPDATE_TOTALS"; payload: { totalYield: bigint; totalTvl: bigint } }
  | { type: "OPTIMISTIC_UPDATE"; payload: { address: string; data: Partial<ProtocolData> } }
  | { type: "CLEAR_OPTIMISTIC"; payload: string }
  | { type: "SET_BACKGROUND_SYNC"; payload: boolean }
  | { type: "ADD_TO_RETRY_QUEUE"; payload: { action: string; payload: any } }
  | { type: "CLEAR_RETRY_QUEUE" };

const initialState: YieldState = {
  protocols: {},
  totalYield: BigInt(0),
  totalTvl: BigInt(0),
  isLoading: false,
  error: null,
  lastGlobalUpdate: 0,
  optimisticUpdates: {},
  backgroundSync: false,
  retryQueue: [],
};

function yieldReducer(state: YieldState, action: YieldAction): YieldState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, isLoading: false };

    case "UPDATE_PROTOCOL":
      const updatedProtocol = {
        ...state.protocols[action.payload.address],
        ...action.payload.data,
        lastUpdated: Date.now(),
      };
      return {
        ...state,
        protocols: {
          ...state.protocols,
          [action.payload.address]: updatedProtocol,
        },
      };

    case "ADD_PROTOCOL":
      return {
        ...state,
        protocols: {
          ...state.protocols,
          [action.payload.address]: action.payload,
        },
      };

    case "REMOVE_PROTOCOL":
      const { [action.payload]: removed, ...remainingProtocols } = state.protocols;
      return {
        ...state,
        protocols: remainingProtocols,
      };

    case "SET_PROTOCOLS":
      const protocolsMap = action.payload.reduce(
        (acc, protocol) => {
          acc[protocol.address] = protocol;
          return acc;
        },
        {} as Record<string, ProtocolData>,
      );
      return {
        ...state,
        protocols: protocolsMap,
        lastGlobalUpdate: Date.now(),
      };

    case "UPDATE_TOTALS":
      return {
        ...state,
        totalYield: action.payload.totalYield,
        totalTvl: action.payload.totalTvl,
      };

    case "OPTIMISTIC_UPDATE":
      return {
        ...state,
        optimisticUpdates: {
          ...state.optimisticUpdates,
          [action.payload.address]: action.payload.data,
        },
      };

    case "CLEAR_OPTIMISTIC":
      const { [action.payload]: cleared, ...remainingOptimistic } = state.optimisticUpdates;
      return {
        ...state,
        optimisticUpdates: remainingOptimistic,
      };

    case "SET_BACKGROUND_SYNC":
      return { ...state, backgroundSync: action.payload };

    case "ADD_TO_RETRY_QUEUE":
      return {
        ...state,
        retryQueue: [...state.retryQueue, { ...action.payload, timestamp: Date.now() }],
      };

    case "CLEAR_RETRY_QUEUE":
      return { ...state, retryQueue: [] };

    default:
      return state;
  }
}

interface YieldContextType {
  state: YieldState;
  dispatch: React.Dispatch<YieldAction>;
  addProtocol: (address: string) => Promise<void>;
  removeProtocol: (address: string) => Promise<void>;
  refreshProtocol: (address: string) => Promise<void>;
  refreshAllProtocols: () => Promise<void>;
  getProtocolWithOptimistic: (address: string) => ProtocolData | undefined;
}

const YieldContext = createContext<YieldContextType | undefined>(undefined);

export const YieldProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(yieldReducer, initialState);
  const { address } = useAccount();

  // Optimistic protocol addition
  const addProtocol = useCallback(async (protocolAddress: string) => {
    // Optimistic update
    const optimisticProtocol: ProtocolData = {
      address: protocolAddress,
      name: "Loading...",
      yield: BigInt(0),
      apy: 0,
      tvl: BigInt(0),
      lastUpdated: Date.now(),
      isActive: true,
      metadata: {
        category: "lending",
        version: "1.0",
        risk: "medium",
      },
    };

    dispatch({ type: "OPTIMISTIC_UPDATE", payload: { address: protocolAddress, data: optimisticProtocol } });

    try {
      // Actual contract call would go here
      // For now, simulate the call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const actualProtocol: ProtocolData = {
        ...optimisticProtocol,
        name: `Protocol ${protocolAddress.slice(0, 6)}...`,
        yield: BigInt(Math.floor(Math.random() * 10000000000000000)), // Random yield
        apy: Math.random() * 20,
        tvl: BigInt(Math.floor(Math.random() * 1000000000000000000)), // Random TVL
      };

      dispatch({ type: "ADD_PROTOCOL", payload: actualProtocol });
      dispatch({ type: "CLEAR_OPTIMISTIC", payload: protocolAddress });
    } catch (error) {
      dispatch({ type: "CLEAR_OPTIMISTIC", payload: protocolAddress });
      dispatch({ type: "ADD_TO_RETRY_QUEUE", payload: { action: "addProtocol", payload: protocolAddress } });
      throw error;
    }
  }, []);

  const removeProtocol = useCallback(async (protocolAddress: string) => {
    // Optimistic removal
    dispatch({ type: "OPTIMISTIC_UPDATE", payload: { address: protocolAddress, data: { isActive: false } } });

    try {
      // Actual contract call would go here
      await new Promise(resolve => setTimeout(resolve, 500));
      dispatch({ type: "REMOVE_PROTOCOL", payload: protocolAddress });
      dispatch({ type: "CLEAR_OPTIMISTIC", payload: protocolAddress });
    } catch (error) {
      dispatch({ type: "CLEAR_OPTIMISTIC", payload: protocolAddress });
      throw error;
    }
  }, []);

  const refreshProtocol = useCallback(async (protocolAddress: string) => {
    try {
      // Simulate fetching fresh data
      const updatedData = {
        yield: BigInt(Math.floor(Math.random() * 10000000000000000)),
        apy: Math.random() * 20,
        tvl: BigInt(Math.floor(Math.random() * 1000000000000000000)),
      };

      dispatch({ type: "UPDATE_PROTOCOL", payload: { address: protocolAddress, data: updatedData } });
    } catch (error) {
      console.error("Failed to refresh protocol:", error);
    }
  }, []);

  const refreshAllProtocols = useCallback(async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const protocolAddresses = Object.keys(state.protocols);
      await Promise.all(protocolAddresses.map(refreshProtocol));

      // Update totals
      const totalYield = Object.values(state.protocols).reduce((sum, protocol) => sum + protocol.yield, BigInt(0));
      const totalTvl = Object.values(state.protocols).reduce((sum, protocol) => sum + protocol.tvl, BigInt(0));

      dispatch({ type: "UPDATE_TOTALS", payload: { totalYield, totalTvl } });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Failed to refresh protocols" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [state.protocols, refreshProtocol]);

  const getProtocolWithOptimistic = useCallback(
    (address: string): ProtocolData | undefined => {
      const baseProtocol = state.protocols[address];
      const optimistic = state.optimisticUpdates[address];

      if (!baseProtocol && !optimistic) return undefined;

      return {
        ...baseProtocol,
        ...optimistic,
      } as ProtocolData;
    },
    [state.protocols, state.optimisticUpdates],
  );

  // Background sync effect
  useEffect(() => {
    if (!state.backgroundSync || !address) return;

    const interval = setInterval(() => {
      refreshAllProtocols();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [state.backgroundSync, address, refreshAllProtocols]);

  // Retry queue processor
  useEffect(() => {
    if (state.retryQueue.length === 0) return;

    const processRetryQueue = async () => {
      for (const item of state.retryQueue) {
        try {
          if (item.action === "addProtocol") {
            await addProtocol(item.payload);
          }
          // Add other retry actions as needed
        } catch (error) {
          console.error("Retry failed:", error);
        }
      }
      dispatch({ type: "CLEAR_RETRY_QUEUE" });
    };

    const timeout = setTimeout(processRetryQueue, 5000); // Retry after 5 seconds
    return () => clearTimeout(timeout);
  }, [state.retryQueue, addProtocol]);

  const contextValue: YieldContextType = {
    state,
    dispatch,
    addProtocol,
    removeProtocol,
    refreshProtocol,
    refreshAllProtocols,
    getProtocolWithOptimistic,
  };

  return <YieldContext.Provider value={contextValue}>{children}</YieldContext.Provider>;
};

export const useYieldContext = () => {
  const context = useContext(YieldContext);
  if (context === undefined) {
    throw new Error("useYieldContext must be used within a YieldProvider");
  }
  return context;
};
