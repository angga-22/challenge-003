import { useMemo, useRef, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { Address, encodeFunctionData, decodeFunctionResult } from "viem";

interface BatchRequest {
  id: string;
  contractAddress: Address;
  functionName: string;
  args: any[];
  abi: any[];
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: number;
}

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  blockNumber?: bigint;
}

interface RpcStats {
  totalRequests: number;
  batchedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  failedRequests: number;
}

class AdvancedRpcManager {
  private batchQueue: BatchRequest[] = [];
  private cache = new Map<string, CacheEntry>();
  private stats: RpcStats = {
    totalRequests: 0,
    batchedRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageResponseTime: 0,
    failedRequests: 0,
  };
  private publicClient: any;
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_DELAY = 100; // ms
  private readonly DEFAULT_TTL = 30000; // 30 seconds

  constructor(publicClient: any) {
    this.publicClient = publicClient;
  }

  private generateCacheKey(contractAddress: Address, functionName: string, args: any[], blockTag?: string): string {
    return `${contractAddress}:${functionName}:${JSON.stringify(args)}:${blockTag || "latest"}`;
  }

  private isValidCache(entry: CacheEntry, blockNumber?: bigint): boolean {
    const now = Date.now();
    const isNotExpired = now - entry.timestamp < entry.ttl;

    // For block-dependent data, also check if we have newer block
    if (entry.blockNumber && blockNumber && blockNumber > entry.blockNumber) {
      return false;
    }

    return isNotExpired;
  }

  private scheduleBatchExecution(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(() => {
      this.executeBatch();
      this.batchTimer = null;
    }, this.BATCH_DELAY);
  }

  private async executeBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
    const startTime = Date.now();

    try {
      // Group requests by contract for multicall optimization
      const contractGroups = batch.reduce(
        (groups, request) => {
          const key = request.contractAddress;
          if (!groups[key]) groups[key] = [];
          groups[key].push(request);
          return groups;
        },
        {} as Record<string, BatchRequest[]>,
      );

      // Execute multicalls for each contract
      const promises = Object.entries(contractGroups).map(async ([contractAddress, requests]) => {
        try {
          const calls = requests.map(req => ({
            address: req.contractAddress,
            abi: req.abi,
            functionName: req.functionName,
            args: req.args,
          }));

          const results = await this.publicClient.multicall({ contracts: calls });

          requests.forEach((request, index) => {
            const result = results[index];

            if (result.status === "success") {
              // Cache the result
              const cacheKey = this.generateCacheKey(request.contractAddress, request.functionName, request.args);

              this.cache.set(cacheKey, {
                data: result.result,
                timestamp: Date.now(),
                ttl: this.DEFAULT_TTL,
              });

              request.resolve(result.result);
            } else {
              request.reject(new Error(result.error?.message || "Unknown error"));
            }
          });
        } catch (error) {
          requests.forEach(request =>
            request.reject(error instanceof Error ? error : new Error("Batch execution failed")),
          );
        }
      });

      await Promise.all(promises);

      // Update stats
      const endTime = Date.now();
      this.stats.batchedRequests += batch.length;
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime * this.stats.totalRequests + (endTime - startTime)) /
        (this.stats.totalRequests + batch.length);
      this.stats.totalRequests += batch.length;
    } catch (error) {
      // Handle batch failure
      batch.forEach(request => request.reject(error instanceof Error ? error : new Error("Batch execution failed")));
      this.stats.failedRequests += batch.length;
    }
  }

  async call<T = any>(
    contractAddress: Address,
    functionName: string,
    args: any[] = [],
    abi: any[],
    options: {
      priority?: number;
      ttl?: number;
      bypassCache?: boolean;
      blockTag?: string;
    } = {},
  ): Promise<T> {
    const { priority = 0, ttl = this.DEFAULT_TTL, bypassCache = false, blockTag } = options;

    // Check cache first
    if (!bypassCache) {
      const cacheKey = this.generateCacheKey(contractAddress, functionName, args, blockTag);
      const cached = this.cache.get(cacheKey);

      if (cached && this.isValidCache(cached)) {
        this.stats.cacheHits++;
        return cached.data;
      }
      this.stats.cacheMisses++;
    }

    // For immediate/high priority requests, execute directly
    if (priority > 5) {
      try {
        const result = await this.publicClient.readContract({
          address: contractAddress,
          abi,
          functionName,
          args,
          blockTag,
        });

        // Cache the result
        if (!bypassCache) {
          const cacheKey = this.generateCacheKey(contractAddress, functionName, args, blockTag);
          this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
            ttl,
          });
        }

        this.stats.totalRequests++;
        return result;
      } catch (error) {
        this.stats.failedRequests++;
        throw error;
      }
    }

    // Add to batch queue for regular priority requests
    return new Promise<T>((resolve, reject) => {
      const request: BatchRequest = {
        id: Math.random().toString(36),
        contractAddress,
        functionName,
        args,
        abi,
        resolve,
        reject,
        timestamp: Date.now(),
        priority,
      };

      // Insert based on priority (higher priority first)
      const insertIndex = this.batchQueue.findIndex(req => req.priority < priority);
      if (insertIndex === -1) {
        this.batchQueue.push(request);
      } else {
        this.batchQueue.splice(insertIndex, 0, request);
      }

      this.scheduleBatchExecution();
    });
  }

  // Smart cache invalidation
  invalidateCache(pattern?: string | RegExp): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (typeof pattern === "string" && key.includes(pattern)) {
        this.cache.delete(key);
      } else if (pattern instanceof RegExp && pattern.test(key)) {
        this.cache.delete(key);
      }
    });
  }

  // Preload commonly used data
  async preloadData(
    requests: Array<{
      contractAddress: Address;
      functionName: string;
      args?: any[];
      abi: any[];
    }>,
  ): Promise<void> {
    const promises = requests.map(
      req =>
        this.call(req.contractAddress, req.functionName, req.args || [], req.abi, { priority: -1 }).catch(() => {}), // Ignore preload failures
    );

    await Promise.allSettled(promises);
  }

  getStats(): RpcStats {
    return { ...this.stats };
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  // Clean up expired cache entries
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidCache(entry)) {
        this.cache.delete(key);
      }
    }
  }
}

export const useAdvancedRpc = () => {
  const publicClient = usePublicClient();
  const rpcManagerRef = useRef<AdvancedRpcManager | null>(null);

  // Initialize RPC manager
  if (!rpcManagerRef.current && publicClient) {
    rpcManagerRef.current = new AdvancedRpcManager(publicClient);

    // Auto cleanup cache every 5 minutes
    setInterval(() => {
      rpcManagerRef.current?.cleanupCache();
    }, 300000);
  }

  const rpcManager = rpcManagerRef.current;

  const batchCall = useCallback(
    async <T = any>(
      contractAddress: Address,
      functionName: string,
      args: any[] = [],
      abi: any[],
      options?: {
        priority?: number;
        ttl?: number;
        bypassCache?: boolean;
      },
    ): Promise<T> => {
      if (!rpcManager) throw new Error("RPC manager not initialized");
      return rpcManager.call<T>(contractAddress, functionName, args, abi, options);
    },
    [rpcManager],
  );

  const preloadData = useCallback(
    async (
      requests: Array<{
        contractAddress: Address;
        functionName: string;
        args?: any[];
        abi: any[];
      }>,
    ) => {
      if (!rpcManager) return;
      await rpcManager.preloadData(requests);
    },
    [rpcManager],
  );

  const invalidateCache = useCallback(
    (pattern?: string | RegExp) => {
      rpcManager?.invalidateCache(pattern);
    },
    [rpcManager],
  );

  const stats = useMemo(
    () =>
      rpcManager?.getStats() || {
        totalRequests: 0,
        batchedRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        averageResponseTime: 0,
        failedRequests: 0,
      },
    [rpcManager],
  );

  return {
    batchCall,
    preloadData,
    invalidateCache,
    stats,
    cacheSize: rpcManager?.getCacheSize() || 0,
  };
};
