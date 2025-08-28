import type { NextPage } from "next";
import { YieldProvider } from "~~/context/YieldContext";
import { OptimizedYieldAggregatorUI } from "~~/components/scaffold-eth/YieldAggregator/OptimizedYieldAggregatorUI";

const YieldAggregator: NextPage = () => {
  return (
    <YieldProvider>
      <OptimizedYieldAggregatorUI />
    </YieldProvider>
  );
};

export default YieldAggregator;
