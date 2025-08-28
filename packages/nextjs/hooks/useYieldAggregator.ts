import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface YieldData {
  totalYield: bigint;
  protocols: string[];
  lastUpdated: number;
}

interface CacheEntry {
  data: YieldData;
  timestamp: number;
}

const CACHE_DURATION = 30000; // 30 seconds
const cache = new Map<string, CacheEntry>();

export const useYieldAggregator = () => {
  const { address } = useAccount();
  const [data, setData] = useState<YieldData>({
    totalYield: BigInt(0),
    protocols: [],
    lastUpdated: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read contract functions
  const { data: totalYield } = useScaffoldReadContract({
    contractName: "yield-aggregator",
    functionName: "getTotalYield",
    args: [address],
  });

  const { data: protocols } = useScaffoldReadContract({
    contractName: "yield-aggregator",
    functionName: "getProtocols",
  });

  // Write contract function
  const { writeContractAsync: addProtocolWrite } = useScaffoldWriteContract("yield-aggregator");

  const fetchYieldData = useCallback(async () => {
    if (!address) return;

    const cacheKey = `yield_${address}`;
    const cached = cache.get(cacheKey);

    // Check if we have valid cached data
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setData(cached.data);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the data from contract reads
      const newData: YieldData = {
        totalYield: totalYield || BigInt(0),
        protocols: (protocols as string[]) || [],
        lastUpdated: Date.now(),
      };

      // Cache the data
      cache.set(cacheKey, {
        data: newData,
        timestamp: Date.now(),
      });

      setData(newData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch yield data");
    } finally {
      setIsLoading(false);
    }
  }, [address, totalYield, protocols]);

  const addProtocol = useCallback(
    async (protocolAddress: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await addProtocolWrite({
          functionName: "addProtocol",
          args: [protocolAddress as `0x${string}`],
        });

        // Invalidate cache after adding protocol
        if (address) {
          cache.delete(`yield_${address}`);
        }

        // Wait a bit for transaction to be mined
        setTimeout(() => {
          fetchYieldData();
        }, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add protocol");
      } finally {
        setIsLoading(false);
      }
    },
    [address, addProtocolWrite, fetchYieldData],
  );

  const refreshData = useCallback(async () => {
    if (address) {
      // Invalidate cache to force refresh
      cache.delete(`yield_${address}`);
      await fetchYieldData();
    }
  }, [address, fetchYieldData]);

  // Auto-fetch data when address or contract data changes
  useEffect(() => {
    fetchYieldData();
  }, [fetchYieldData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchYieldData, 60000);
    return () => clearInterval(interval);
  }, [fetchYieldData]);

  return {
    data,
    isLoading,
    error,
    addProtocol,
    refreshData,
  };
};
