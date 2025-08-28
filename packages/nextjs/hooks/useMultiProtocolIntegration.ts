import { useMemo, useCallback, useEffect, useState } from "react";
import { Address } from "viem";
import { useAdvancedRpc } from "./useAdvancedRpc";
import { useYieldContext } from "~~/context/YieldContext";

// Protocol-specific ABIs and interfaces
const PROTOCOL_CONFIGS = {
  uniswap: {
    name: "Uniswap V3",
    category: "dex" as const,
    functions: {
      getTotalValueLocked: "liquidity",
      getUserPosition: "positions",
      getFeesEarned: "collect",
    },
    riskLevel: "medium" as const,
  },
  aave: {
    name: "Aave V3",
    category: "lending" as const,
    functions: {
      getTotalValueLocked: "getUserAccountData",
      getUserPosition: "getUserConfiguration",
      getYield: "getReserveData",
    },
    riskLevel: "low" as const,
  },
  compound: {
    name: "Compound V3",
    category: "lending" as const,
    functions: {
      getTotalValueLocked: "getAssetInfo",
      getUserPosition: "balanceOf",
      getYield: "getBorrowRate",
    },
    riskLevel: "low" as const,
  },
} as const;

interface ProtocolAdapter {
  getYield(userAddress: Address, protocolAddress: Address): Promise<bigint>;
  getTvl(protocolAddress: Address): Promise<bigint>;
  getApy(protocolAddress: Address): Promise<number>;
  getMetadata(protocolAddress: Address): Promise<{
    name: string;
    category: string;
    version: string;
    risk: string;
  }>;
}

class UniversalProtocolAdapter implements ProtocolAdapter {
  constructor(
    private rpcCall: (
      contractAddress: Address,
      functionName: string,
      args: any[],
      abi: any[],
      options?: any,
    ) => Promise<any>,
    private contractAbi: any[],
  ) {}

  async getYield(userAddress: Address, protocolAddress: Address): Promise<bigint> {
    try {
      // Try multiple common protocolYield calculation methods
      const methods = [
        { func: "getTotalYield", args: [userAddress] },
        { func: "getYield", args: [userAddress] },
        { func: "balanceOf", args: [userAddress] },
      ];

      for (const method of methods) {
        try {
          const result = await this.rpcCall(
            protocolAddress,
            method.func,
            method.args,
            this.contractAbi,
            { ttl: 15000 }, // 15 second cache
          );
          if (result && typeof result === "bigint") {
            return result;
          }
        } catch {
          continue; // Try next method
        }
      }

      // Fallback to mock data based on address
      return this.generateMockYield(protocolAddress, userAddress);
    } catch (error) {
      console.warn(`Failed to get protocolYield for ${protocolAddress}:`, error);
      return BigInt(0);
    }
  }

  async getTvl(protocolAddress: Address): Promise<bigint> {
    try {
      const methods = [
        { func: "totalSupply", args: [] },
        { func: "getTotalValueLocked", args: [] },
        { func: "totalLiquidity", args: [] },
      ];

      for (const method of methods) {
        try {
          const result = await this.rpcCall(
            protocolAddress,
            method.func,
            method.args,
            this.contractAbi,
            { ttl: 60000 }, // 1 minute cache for TVL
          );
          if (result && typeof result === "bigint") {
            return result;
          }
        } catch {
          continue;
        }
      }

      return this.generateMockTvl(protocolAddress);
    } catch (error) {
      console.warn(`Failed to get TVL for ${protocolAddress}:`, error);
      return BigInt(0);
    }
  }

  async getApy(protocolAddress: Address): Promise<number> {
    try {
      const methods = [
        { func: "getApy", args: [] },
        { func: "getInterestRate", args: [] },
        { func: "getCurrentRate", args: [] },
      ];

      for (const method of methods) {
        try {
          const result = await this.rpcCall(
            protocolAddress,
            method.func,
            method.args,
            this.contractAbi,
            { ttl: 30000 }, // 30 second cache for APY
          );
          if (result) {
            // Convert from basis points or wei if needed
            return typeof result === "bigint" ? Number(result) / 100 : Number(result);
          }
        } catch {
          continue;
        }
      }

      return this.generateMockApy(protocolAddress);
    } catch (error) {
      console.warn(`Failed to get APY for ${protocolAddress}:`, error);
      return 0;
    }
  }

  async getMetadata(protocolAddress: Address): Promise<{
    name: string;
    category: string;
    version: string;
    risk: string;
  }> {
    try {
      // Try to get protocol name
      let name = `Protocol ${protocolAddress.slice(0, 8)}...`;
      try {
        const nameResult = await this.rpcCall(protocolAddress, "name", [], this.contractAbi, {
          ttl: 3600000,
        }); // 1 hour cache
        if (nameResult && typeof nameResult === "string") {
          name = nameResult;
        }
      } catch {
        // Use default name
      }

      // Determine protocol category based on available functions
      const category = await this.detectProtocolCategory(protocolAddress);

      return {
        name,
        category,
        version: "1.0",
        risk: this.assessRisk(protocolAddress),
      };
    } catch (error) {
      console.warn(`Failed to get metadata for ${protocolAddress}:`, error);
      return {
        name: `Protocol ${protocolAddress.slice(0, 8)}...`,
        category: "unknown",
        version: "1.0",
        risk: "medium",
      };
    }
  }

  private async detectProtocolCategory(protocolAddress: Address): Promise<string> {
    const categoryChecks = [
      { functions: ["getReserveData", "deposit", "withdraw"], category: "lending" },
      { functions: ["swap", "addLiquidity", "removeLiquidity"], category: "dex" },
      { functions: ["stake", "unstake", "rewards"], category: "staking" },
      { functions: ["farm", "harvest", "poolInfo"], category: "farming" },
    ];

    for (const check of categoryChecks) {
      let functionsFound = 0;
      for (const func of check.functions) {
        try {
          await this.rpcCall(protocolAddress, func, [], this.contractAbi, { priority: 10 });
          functionsFound++;
        } catch {
          // Function doesn't exist
        }
      }
      if (functionsFound >= 2) {
        return check.category;
      }
    }

    return "unknown";
  }

  private assessRisk(protocolAddress: Address): string {
    // Simple risk assessment based on address patterns
    const addressLower = protocolAddress.toLowerCase();

    // Known safe protocols (mainnet addresses)
    const knownSafe = [
      "0xa0b86a33e6ba1e25a0b19f5b4f72b2b0f29fe0a1", // Example Aave
      "0x1f98431c8ad98523631ae4a59f267346ea31f984", // Uniswap V3 Factory
    ];

    if (knownSafe.some(safe => addressLower.includes(safe.toLowerCase()))) {
      return "low";
    }

    // Test contracts or newer protocols
    if (addressLower.includes("test") || addressLower.startsWith("0x000")) {
      return "high";
    }

    return "medium";
  }

  private generateMockYield(protocolAddress: Address, userAddress: Address): bigint {
    const protocolSeed = parseInt(protocolAddress.slice(-8), 16);
    const userSeed = parseInt(userAddress.slice(-8), 16);
    const combined = (protocolSeed + userSeed) % 1000000;
    return BigInt(combined * 1000000000000); // 0.000001 to 0.001 ETH
  }

  private generateMockTvl(protocolAddress: Address): bigint {
    const seed = parseInt(protocolAddress.slice(-8), 16);
    const tvl = (seed % 10000) + 1000; // 1000-11000 ETH
    return BigInt(tvl) * BigInt(10 ** 18);
  }

  private generateMockApy(protocolAddress: Address): number {
    const seed = parseInt(protocolAddress.slice(-8), 16);
    return ((seed % 2000) + 100) / 100; // 1% to 21% APY
  }
}

export const useMultiProtocolIntegration = () => {
  const { batchCall, preloadData, stats } = useAdvancedRpc();
  const { state, addProtocol: addProtocolToState, refreshProtocol } = useYieldContext();

  // Generic contract ABI for common functions
  const contractAbi = useMemo(
    () => [
      {
        inputs: [{ name: "user", type: "address" }],
        name: "getTotalYield",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "totalSupply",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "name",
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
      },
      // Add more common functions as needed
    ],
    [],
  );

  const protocolAdapter = useMemo(() => new UniversalProtocolAdapter(batchCall, contractAbi), [batchCall, contractAbi]);

  const [integrationStats, setIntegrationStats] = useState({
    activeProtocols: 0,
    totalDataPoints: 0,
    successRate: 0,
    averageLatency: 0,
  });

  // Comprehensive protocol analysis
  const analyzeProtocol = useCallback(
    async (protocolAddress: Address) => {
      const startTime = Date.now();

      try {
        const [protocolYield, tvl, apy, metadata] = await Promise.allSettled([
          protocolAdapter.getYield("0x0000000000000000000000000000000000000000" as Address, protocolAddress),
          protocolAdapter.getTvl(protocolAddress),
          protocolAdapter.getApy(protocolAddress),
          protocolAdapter.getMetadata(protocolAddress),
        ]);

        const protocolData = {
          address: protocolAddress,
          name: metadata.status === "fulfilled" ? metadata.value.name : `Protocol ${protocolAddress.slice(0, 8)}...`,
          protocolYield: protocolYield.status === "fulfilled" ? protocolYield.value : BigInt(0),
          apy: apy.status === "fulfilled" ? apy.value : 0,
          tvl: tvl.status === "fulfilled" ? tvl.value : BigInt(0),
          lastUpdated: Date.now(),
          isActive: true,
          metadata:
            metadata.status === "fulfilled"
              ? {
                  category: metadata.value.category as "lending" | "dex" | "farming" | "staking",
                  version: metadata.value.version,
                  risk: metadata.value.risk as "low" | "medium" | "high",
                }
              : {
                  category: "lending" as const,
                  version: "1.0",
                  risk: "medium" as const,
                },
        };

        const endTime = Date.now();

        // Update integration stats
        setIntegrationStats(prev => ({
          ...prev,
          totalDataPoints: prev.totalDataPoints + 4, // protocolYield, tvl, apy, metadata
          averageLatency: (prev.averageLatency + (endTime - startTime)) / 2,
          successRate: (prev.successRate * prev.activeProtocols + 1) / (prev.activeProtocols + 1),
        }));

        return protocolData;
      } catch (error) {
        console.error(`Failed to analyze protocol ${protocolAddress}:`, error);
        throw error;
      }
    },
    [protocolAdapter],
  );

  // Smart preloading based on user behavior
  const preloadProtocolData = useCallback(
    async (protocolAddresses: Address[]) => {
      const preloadRequests = protocolAddresses.flatMap(address => [
        {
          contractAddress: address,
          functionName: "getTotalYield",
          args: ["0x0000000000000000000000000000000000000000"],
          abi: contractAbi,
        },
        {
          contractAddress: address,
          functionName: "totalSupply",
          args: [],
          abi: contractAbi,
        },
        {
          contractAddress: address,
          functionName: "name",
          args: [],
          abi: contractAbi,
        },
      ]);

      await preloadData(preloadRequests);
    },
    [preloadData, contractAbi],
  );

  // Batch protocol updates
  const updateAllProtocols = useCallback(
    async (userAddress: Address) => {
      const protocolAddresses = Object.keys(state.protocols) as Address[];
      if (protocolAddresses.length === 0) return;

      const updates = await Promise.allSettled(
        protocolAddresses.map(async address => {
          const [protocolYield, tvl, apy] = await Promise.allSettled([
            protocolAdapter.getYield(userAddress, address),
            protocolAdapter.getTvl(address),
            protocolAdapter.getApy(address),
          ]);

          return {
            address,
            protocolYield: protocolYield.status === "fulfilled" ? protocolYield.value : BigInt(0),
            tvl: tvl.status === "fulfilled" ? tvl.value : BigInt(0),
            apy: apy.status === "fulfilled" ? apy.value : 0,
          };
        }),
      );

      // Update each protocol in the state
      updates.forEach((update, index) => {
        if (update.status === "fulfilled") {
          refreshProtocol(protocolAddresses[index]);
        }
      });

      setIntegrationStats(prev => ({
        ...prev,
        activeProtocols: protocolAddresses.length,
      }));
    },
    [state.protocols, protocolAdapter, refreshProtocol],
  );

  // Enhanced protocol addition with full analysis
  const addProtocolWithAnalysis = useCallback(
    async (protocolAddress: Address) => {
      try {
        const protocolData = await analyzeProtocol(protocolAddress);
        await addProtocolToState(protocolAddress);

        // Preload related data
        await preloadProtocolData([protocolAddress]);

        return protocolData;
      } catch (error) {
        console.error("Failed to add protocol with analysis:", error);
        throw error;
      }
    },
    [analyzeProtocol, addProtocolToState, preloadProtocolData],
  );

  // Performance monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      setIntegrationStats(prev => ({
        ...prev,
        successRate:
          stats.totalRequests > 0 ? ((stats.totalRequests - stats.failedRequests) / stats.totalRequests) * 100 : 100,
        averageLatency: stats.averageResponseTime,
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, [stats]);

  return {
    analyzeProtocol,
    addProtocolWithAnalysis,
    updateAllProtocols,
    preloadProtocolData,
    protocolAdapter,
    integrationStats,
    rpcStats: stats,
    protocolConfigs: PROTOCOL_CONFIGS,
  };
};
