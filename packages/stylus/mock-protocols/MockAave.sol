// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * Mock Aave Protocol Contract
 * Simulates yield from lending
 */
contract MockAave {
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public depositTime;
    
    uint256 public constant LENDING_RATE = 8; // 8% annual lending rate
    
    function deposit() external payable {
        deposits[msg.sender] += msg.value;
        depositTime[msg.sender] = block.timestamp;
    }
    
    function getUserYield(address user) external view returns (uint256) {
        uint256 depositAmount = deposits[user];
        if (depositAmount == 0) return 0;
        
        uint256 timeElapsed = block.timestamp - depositTime[user];
        // Simplified interest calculation
        return (depositAmount * LENDING_RATE * timeElapsed) / (365 days * 100);
    }
    
    function withdraw() external {
        uint256 depositAmount = deposits[msg.sender];
        uint256 interest = this.getUserYield(msg.sender);
        
        deposits[msg.sender] = 0;
        depositTime[msg.sender] = block.timestamp;
        
        payable(msg.sender).transfer(depositAmount + interest);
    }
}
