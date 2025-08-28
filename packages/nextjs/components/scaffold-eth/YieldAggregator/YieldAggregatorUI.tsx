"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useYieldAggregator } from "~~/hooks/useYieldAggregator";

export const YieldAggregatorUI = () => {
  const { address } = useAccount();
  const [newProtocolAddress, setNewProtocolAddress] = useState("");
  const { data, isLoading, error, addProtocol, refreshData } = useYieldAggregator();

  const handleAddProtocol = async () => {
    if (newProtocolAddress) {
      await addProtocol(newProtocolAddress);
      setNewProtocolAddress("");
    }
  };

  const formatEth = (wei: bigint) => {
    return (Number(wei) / 1e18).toFixed(6);
  };

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      <div className="px-5">
        <h1 className="text-center">
          <span className="block text-4xl font-bold">Cross-Protocol Yield Tracker</span>
        </h1>
        <div className="flex justify-center items-center space-x-2 flex-col sm:flex-row">
          <p className="my-2 font-medium">Advanced dashboard aggregating data from multiple DeFi protocols</p>
        </div>
      </div>

      <div className="flex-grow bg-base-300 w-full mt-16 px-8 py-12">
        <div className="flex justify-center items-center gap-12 flex-col sm:flex-row">
          {/* Your Total Yield Section */}
          <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
            <h2 className="text-2xl font-bold mb-4">Your Total Yield</h2>
            {isLoading ? (
              <div className="loading loading-spinner loading-lg"></div>
            ) : (
              <div className="text-4xl font-bold text-primary">{formatEth(data.totalYield)} ETH</div>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Connected Wallet: <Address address={address} />
            </p>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <button className="btn btn-sm btn-outline mt-4" onClick={refreshData}>
              Refresh
            </button>
          </div>

          {/* Tracked Protocols Section */}
          <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
            <h2 className="text-2xl font-bold mb-4">Tracked Protocols</h2>
            {data.protocols.length === 0 ? (
              <p className="text-gray-500">No protocols added yet</p>
            ) : (
              <ul className="space-y-2">
                {data.protocols.map((protocol: string, index: number) => (
                  <li key={index} className="text-sm">
                    <Address address={protocol as `0x${string}`} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Protocol Section */}
          <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
            <h2 className="text-2xl font-bold mb-4">Add New Protocol</h2>
            <div className="space-y-4">
              <input
                type="text"
                value={newProtocolAddress}
                onChange={e => setNewProtocolAddress(e.target.value)}
                placeholder="Protocol Contract Address"
                className="input input-bordered w-full"
              />
              <button
                className="btn btn-primary w-full"
                onClick={handleAddProtocol}
                disabled={!newProtocolAddress || isLoading}
              >
                {isLoading ? "Adding..." : "Add Protocol"}
              </button>
            </div>

            {/* Example Addresses */}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold">Example Test Addresses:</p>
              <div className="space-y-1">
                <button
                  className="btn btn-xs btn-outline w-full"
                  onClick={() => setNewProtocolAddress("0x1111111111111111111111111111111111111111")}
                >
                  Mock Uniswap
                </button>
                <button
                  className="btn btn-xs btn-outline w-full"
                  onClick={() => setNewProtocolAddress("0x2222222222222222222222222222222222222222")}
                >
                  Mock Aave
                </button>
                <button
                  className="btn btn-xs btn-outline w-full"
                  onClick={() => setNewProtocolAddress("0x3333333333333333333333333333333333333333")}
                >
                  Mock Compound
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4">Only contract owner can add protocols</p>
          </div>
        </div>

        {/* Protocol Integration Examples */}
        <div className="mt-12">
          <h3 className="text-2xl font-bold text-center mb-8">Supported Protocol Examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Uniswap V3</h2>
                <p>Track liquidity provision yields from Uniswap V3 pools</p>
                <div className="card-actions justify-end">
                  <div className="badge badge-outline">DEX</div>
                  <div className="badge badge-outline">LP Rewards</div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Aave</h2>
                <p>Monitor lending and borrowing yields from Aave protocol</p>
                <div className="card-actions justify-end">
                  <div className="badge badge-outline">Lending</div>
                  <div className="badge badge-outline">Interest</div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Compound</h2>
                <p>Track compound interest from lending protocols</p>
                <div className="card-actions justify-end">
                  <div className="badge badge-outline">Lending</div>
                  <div className="badge badge-outline">Compound</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
