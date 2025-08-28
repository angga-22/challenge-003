// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * Mock Uniswap Protocol Contract
 * Simulates yield from liquidity provision
 */
contract MockUniswap {
    mapping(address => uint256) public liquidityPositions;
    mapping(address => uint256) public lastUpdateTime;
    
    uint256 public constant YIELD_RATE = 5; // 5% annual yield (simplified)
    
    function addLiquidity() external payable {
        liquidityPositions[msg.sender] += msg.value;
        lastUpdateTime[msg.sender] = block.timestamp;
    }
    
    function getUserYield(address user) external view returns (uint256) {
        uint256 position = liquidityPositions[user];
        if (position == 0) return 0;
        
        uint256 timeElapsed = block.timestamp - lastUpdateTime[user];
        // Simplified yield calculation (normally would be much more complex)
        return (position * YIELD_RATE * timeElapsed) / (365 days * 100);
    }
    
    function withdraw() external {
        uint256 position = liquidityPositions[msg.sender];
        uint256 yield = this.getUserYield(msg.sender);
        
        liquidityPositions[msg.sender] = 0;
        lastUpdateTime[msg.sender] = block.timestamp;
        
        payable(msg.sender).transfer(position + yield);
    }
}
