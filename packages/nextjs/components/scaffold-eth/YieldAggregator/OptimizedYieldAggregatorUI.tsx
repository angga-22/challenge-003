"use client";
import React, { memo, useMemo, useCallback, useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useYieldContext } from "~~/context/YieldContext";
import { useMultiProtocolIntegration } from "~~/hooks/useMultiProtocolIntegration";

// Memoized sub-components for performance
const ProtocolCard = memo(
  ({
    protocol,
    onRefresh,
    onRemove,
  }: {
    protocol: any;
    onRefresh: (address: string) => void;
    onRemove: (address: string) => void;
  }) => {
    const formatEth = useCallback((wei: bigint) => {
      return (Number(wei) / 1e18).toFixed(6);
    }, []);

    const getRiskColor = useCallback((risk: string) => {
      switch (risk) {
        case "low":
          return "text-green-500";
        case "medium":
          return "text-yellow-500";
        case "high":
          return "text-red-500";
        default:
          return "text-gray-500";
      }
    }, []);

    return (
      <div className="card bg-base-100 shadow-xl border">
        <div className="card-body p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="card-title text-sm">{protocol.name}</h3>
              <Address address={protocol.address} size="xs" />
            </div>
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-ghost btn-xs">
                ⋮
              </label>
              <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-32">
                <li>
                  <a onClick={() => onRefresh(protocol.address)}>Refresh</a>
                </li>
                <li>
                  <a onClick={() => onRemove(protocol.address)} className="text-error">
                    Remove
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-xs text-gray-500">Yield</p>
              <p className="text-sm font-bold">{formatEth(protocol.yield)} ETH</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">APY</p>
              <p className="text-sm font-bold">{protocol.apy.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">TVL</p>
              <p className="text-sm">{formatEth(protocol.tvl)} ETH</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Risk</p>
              <p className={`text-sm font-bold ${getRiskColor(protocol.metadata?.risk)}`}>
                {protocol.metadata?.risk?.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mt-2">
            <div className="badge badge-outline badge-xs">{protocol.metadata?.category}</div>
            <div className="badge badge-outline badge-xs">v{protocol.metadata?.version}</div>
            {protocol.isActive && <div className="badge badge-success badge-xs">Active</div>}
          </div>
        </div>
      </div>
    );
  },
);

ProtocolCard.displayName = "ProtocolCard";

const PerformanceStats = memo(({ rpcStats, integrationStats }: { rpcStats: any; integrationStats: any }) => (
  <div className="stats stats-vertical lg:stats-horizontal shadow">
    <div className="stat">
      <div className="stat-title">RPC Calls</div>
      <div className="stat-value text-sm">{rpcStats.totalRequests}</div>
      <div className="stat-desc">
        {rpcStats.batchedRequests} batched (
        {((rpcStats.batchedRequests / Math.max(rpcStats.totalRequests, 1)) * 100).toFixed(1)}%)
      </div>
    </div>

    <div className="stat">
      <div className="stat-title">Cache Performance</div>
      <div className="stat-value text-sm">
        {((rpcStats.cacheHits / Math.max(rpcStats.cacheHits + rpcStats.cacheMisses, 1)) * 100).toFixed(1)}%
      </div>
      <div className="stat-desc">
        {rpcStats.cacheHits} hits / {rpcStats.cacheMisses} misses
      </div>
    </div>

    <div className="stat">
      <div className="stat-title">Avg Response</div>
      <div className="stat-value text-sm">{rpcStats.averageResponseTime.toFixed(0)}ms</div>
      <div className="stat-desc">{integrationStats.successRate.toFixed(1)}% success rate</div>
    </div>

    <div className="stat">
      <div className="stat-title">Active Protocols</div>
      <div className="stat-value text-sm">{integrationStats.activeProtocols}</div>
      <div className="stat-desc">{integrationStats.totalDataPoints} data points</div>
    </div>
  </div>
));

PerformanceStats.displayName = "PerformanceStats";

export const OptimizedYieldAggregatorUI = memo(() => {
  const { address } = useAccount();
  const { state, refreshAllProtocols } = useYieldContext();
  const { addProtocolWithAnalysis, updateAllProtocols, integrationStats, rpcStats, preloadProtocolData } =
    useMultiProtocolIntegration();

  const [newProtocolAddress, setNewProtocolAddress] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Memoized protocol list with optimistic updates
  const protocolList = useMemo(() => {
    return Object.values(state.protocols).map(protocol => ({
      ...protocol,
      ...state.optimisticUpdates[protocol.address],
    }));
  }, [state.protocols, state.optimisticUpdates]);

  // Memoized totals calculation
  const totals = useMemo(() => {
    const totalYield = protocolList.reduce((sum, protocol) => sum + protocol.yield, BigInt(0));
    const totalTvl = protocolList.reduce((sum, protocol) => sum + protocol.tvl, BigInt(0));
    const avgApy =
      protocolList.length > 0 ? protocolList.reduce((sum, protocol) => sum + protocol.apy, 0) / protocolList.length : 0;

    return { totalYield, totalTvl, avgApy };
  }, [protocolList]);

  const formatEth = useCallback((wei: bigint) => {
    return (Number(wei) / 1e18).toFixed(6);
  }, []);

  const handleAddProtocol = useCallback(async () => {
    if (!newProtocolAddress || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      await addProtocolWithAnalysis(newProtocolAddress as `0x${string}`);
      setNewProtocolAddress("");
    } catch (error) {
      console.error("Failed to add protocol:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [newProtocolAddress, isAnalyzing, addProtocolWithAnalysis]);

  const handleRefreshProtocol = useCallback(
    async (protocolAddress: string) => {
      if (!address) return;
      await updateAllProtocols(address);
    },
    [address, updateAllProtocols],
  );

  const handleRemoveProtocol = useCallback(async (protocolAddress: string) => {
    // Implementation would go here
    console.log("Removing protocol:", protocolAddress);
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (!address) return;
    await Promise.all([refreshAllProtocols(), updateAllProtocols(address)]);
  }, [address, refreshAllProtocols, updateAllProtocols]);

  // Preload common protocol data
  useEffect(() => {
    const commonProtocols = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ] as `0x${string}`[];

    preloadProtocolData(commonProtocols);
  }, [preloadProtocolData]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !address) return;

    const interval = setInterval(() => {
      updateAllProtocols(address);
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [autoRefresh, address, updateAllProtocols]);

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      <div className="px-5">
        <h1 className="text-center">
          <span className="block text-4xl font-bold">Optimized Yield Tracker</span>
        </h1>
        <div className="flex justify-center items-center space-x-2 flex-col sm:flex-row">
          <p className="my-2 font-medium">Advanced multi-protocol yield aggregation with RPC optimization</p>
        </div>
      </div>

      <div className="flex-grow bg-base-300 w-full mt-16 px-8 py-12">
        {/* Performance Stats */}
        {showAdvanced && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Performance Analytics</h2>
              <label className="label cursor-pointer">
                <span className="label-text mr-2">Auto Refresh</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                />
              </label>
            </div>
            <PerformanceStats rpcStats={rpcStats} integrationStats={integrationStats} />
          </div>
        )}

        {/* Main Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Total Yield */}
          <div className="card bg-gradient-to-br from-primary to-secondary text-primary-content">
            <div className="card-body">
              <h2 className="card-title">Total Yield</h2>
              <div className="text-3xl font-bold">{formatEth(totals.totalYield)} ETH</div>
              <div className="text-sm opacity-80">Average APY: {totals.avgApy.toFixed(2)}%</div>
              {state.isLoading && <progress className="progress progress-primary w-full"></progress>}
            </div>
          </div>

          {/* Total TVL */}
          <div className="card bg-gradient-to-br from-accent to-info text-accent-content">
            <div className="card-body">
              <h2 className="card-title">Total TVL</h2>
              <div className="text-3xl font-bold">{formatEth(totals.totalTvl)} ETH</div>
              <div className="text-sm opacity-80">
                Across {protocolList.length} protocol{protocolList.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Add Protocol */}
          <div className="card bg-base-100">
            <div className="card-body">
              <h2 className="card-title">Add Protocol</h2>
              <div className="form-control">
                <input
                  type="text"
                  value={newProtocolAddress}
                  onChange={e => setNewProtocolAddress(e.target.value)}
                  placeholder="0x..."
                  className="input input-bordered"
                  disabled={isAnalyzing}
                />
              </div>
              <div className="card-actions justify-end">
                <button
                  className="btn btn-primary"
                  onClick={handleAddProtocol}
                  disabled={!newProtocolAddress || isAnalyzing}
                >
                  {isAnalyzing ? "Analyzing..." : "Add & Analyze"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Protocol Grid */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Tracked Protocols</h2>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-outline" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? "Hide" : "Show"} Advanced
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleRefreshAll} disabled={state.isLoading}>
                Refresh All
              </button>
            </div>
          </div>

          {protocolList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No protocols added yet</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Mock Uniswap", "Mock Aave", "Mock Compound"].map((name, index) => (
                  <button
                    key={name}
                    className="btn btn-sm btn-outline"
                    onClick={() => setNewProtocolAddress(`0x${(index + 1).toString().repeat(40)}`)}
                  >
                    Try {name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {protocolList.map(protocol => (
                <ProtocolCard
                  key={protocol.address}
                  protocol={protocol}
                  onRefresh={handleRefreshProtocol}
                  onRemove={handleRemoveProtocol}
                />
              ))}
            </div>
          )}
        </div>

        {/* Error Display */}
        {state.error && (
          <div className="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{state.error}</span>
          </div>
        )}

        {/* Background Sync Indicator */}
        {state.backgroundSync && (
          <div className="fixed bottom-4 right-4">
            <div className="badge badge-info gap-2">
              <div className="loading loading-spinner loading-xs"></div>
              Syncing...
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

OptimizedYieldAggregatorUI.displayName = "OptimizedYieldAggregatorUI";
