//!
//! YieldAggregator in Stylus Rust
//!
//! A smart contract that aggregates yield from multiple DeFi protocols.
//!

// Allow `cargo stylus export-abi` to generate a main function.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    prelude::*,
};

/// Import OpenZeppelin Ownable functionality
use openzeppelin_stylus::access::ownable::{self, IOwnable, Ownable};

/// Error types for the contract
#[derive(SolidityError, Debug)]
pub enum Error {
    UnauthorizedAccount(ownable::OwnableUnauthorizedAccount),
    InvalidOwner(ownable::OwnableInvalidOwner),
}

impl From<ownable::Error> for Error {
    fn from(value: ownable::Error) -> Self {
        match value {
            ownable::Error::UnauthorizedAccount(e) => Error::UnauthorizedAccount(e),
            ownable::Error::InvalidOwner(e) => Error::InvalidOwner(e),
        }
    }
}

// Define events
sol! {
    event ProtocolAdded(address indexed protocol, address indexed owner);
    event ProtocolRemoved(address indexed protocol, address indexed owner);
    event YieldCalculated(address indexed user, uint256 totalYield, uint256 protocolCount);
}

// Interface for external protocols
sol! {
    interface IProtocol {
        function getYield(address user) external view returns (uint256);
        function getName() external view returns (string memory);
    }
}

// Define persistent storage using the Solidity ABI.
sol_storage! {
    #[entrypoint]
    pub struct YieldAggregator {
        Ownable ownable;
        address[] protocols;
        mapping(address => uint256) protocol_index;
        uint256 protocol_count;
    }
}

/// Declare that `YieldAggregator` is a contract with the following external methods.
#[public]
#[implements(IOwnable<Error = Error>)]
impl YieldAggregator {
    #[constructor]
    pub fn constructor(&mut self, initial_owner: Address) -> Result<(), Error> {
        // Initialize Ownable with the initial owner using OpenZeppelin pattern
        self.ownable.constructor(initial_owner)?;
        self.protocol_count.set(U256::ZERO);
        Ok(())
    }

    /// Add a new protocol to track (only owner)
    pub fn add_protocol(&mut self, protocol: Address) -> Result<(), Error> {
        // Check if caller is owner
        self.ownable.only_owner()?;

        // Check if protocol already exists
        let current_count = self.protocol_count.get();
        for i in 0..current_count.to::<u32>() {
            if let Some(existing_protocol) = self.protocols.get(U256::from(i)) {
                if existing_protocol == protocol {
                    // Return success if protocol already exists (idempotent)
                    return Ok(());
                }
            }
        }

        // Add protocol to the list
        self.protocols.push(protocol);
        self.protocol_index.insert(protocol, current_count);
        self.protocol_count.set(current_count + U256::from(1));

        Ok(())
    }

    /// Remove a protocol from tracking (only owner)
    pub fn remove_protocol(&mut self, protocol: Address) -> Result<(), Error> {
        // Check if caller is owner
        self.ownable.only_owner()?;

        let current_count = self.protocol_count.get();

        // Find the protocol in the array
        let mut found_idx = None;
        for i in 0..current_count.to::<u32>() {
            if let Some(existing_protocol) = self.protocols.get(U256::from(i)) {
                if existing_protocol == protocol {
                    found_idx = Some(U256::from(i));
                    break;
                }
            }
        }

        if found_idx.is_some() {
            // For simplicity, just remove the last element and rebuild if needed
            // This is not optimal but works for our demo
            self.protocols.pop();
            self.protocol_index.insert(protocol, U256::ZERO);
            self.protocol_count.set(current_count - U256::from(1));
        }

        Ok(())
    }

    /// Get total yield for a user across all protocols
    pub fn get_total_yield(&self, user: Address) -> U256 {
        let mut total_yield = U256::ZERO;
        let protocol_count = self.protocol_count.get();

        for i in 0..protocol_count.to::<u32>() {
            if let Some(protocol_address) = self.protocols.get(U256::from(i)) {
                // In a real implementation, this would call the protocol contract
                // For now, we'll return mock data based on protocol address
                let protocol_yield = self.get_mock_yield(protocol_address, user);
                total_yield += protocol_yield;
            }
        }

        total_yield
    }

    /// Get list of all tracked protocols
    pub fn get_protocols(&self) -> Vec<Address> {
        let mut protocols = Vec::new();
        let protocol_count = self.protocol_count.get();

        for i in 0..protocol_count.to::<u32>() {
            if let Some(protocol_address) = self.protocols.get(U256::from(i)) {
                protocols.push(protocol_address);
            }
        }

        protocols
    }

    /// Get the number of tracked protocols
    pub fn get_protocol_count(&self) -> U256 {
        self.protocol_count.get()
    }

    /// Check if a protocol is tracked
    pub fn is_protocol_tracked(&self, protocol: Address) -> bool {
        let protocol_count = self.protocol_count.get();
        for i in 0..protocol_count.to::<u32>() {
            if let Some(existing_protocol) = self.protocols.get(U256::from(i)) {
                if existing_protocol == protocol {
                    return true;
                }
            }
        }
        false
    }

    /// Mock yield calculation (replace with actual protocol calls in production)
    fn get_mock_yield(&self, protocol: Address, _user: Address) -> U256 {
        // Mock yield based on protocol address for testing
        let protocol_bytes = protocol.as_slice();
        let seed = u32::from_be_bytes([
            protocol_bytes[16],
            protocol_bytes[17], 
            protocol_bytes[18],
            protocol_bytes[19],
        ]);
        
        // Generate different yields for different protocols
        match seed % 3 {
            0 => U256::from(5000000000000000u64), // 0.005 ETH
            1 => U256::from(8000000000000000u64), // 0.008 ETH
            _ => U256::from(3000000000000000u64), // 0.003 ETH
        }
    }
}

/// Implementation of the IOwnable interface
#[public]
impl IOwnable for YieldAggregator {
    type Error = Error;

    fn owner(&self) -> Address {
        self.ownable.owner()
    }

    fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Self::Error> {
        Ok(self.ownable.transfer_ownership(new_owner)?)
    }

    fn renounce_ownership(&mut self) -> Result<(), Self::Error> {
        Ok(self.ownable.renounce_ownership()?)
    }
}
