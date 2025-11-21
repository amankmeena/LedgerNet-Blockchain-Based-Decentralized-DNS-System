// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title LedgerNet
 * @dev Blockchain-based Decentralized DNS System
 * @author LedgerNet Team
 */
contract LedgerNet {
    
    // Struct to store domain information
    struct Domain {
        address owner;
        string ipAddress;
        uint256 expirationTime;
        bool isActive;
    }
    
    // Mapping from domain name to domain information here
    mapping(string => Domain) public domains;
    
    // Mapping to track domains owned by each address
    mapping(address => string[]) public ownerDomains;
    
    // Events
    event DomainRegistered(string indexed domainName, address indexed owner, string ipAddress);
    event DomainUpdated(string indexed domainName, string newIpAddress);
    event DomainTransferred(string indexed domainName, address indexed oldOwner, address indexed newOwner);
    event DomainRenewed(string indexed domainName, uint256 newExpirationTime);
    event DomainDeactivated(string indexed domainName);
    
    // Registration fee (in wei)
    uint256 public registrationFee = 0.01 ether;
    
    // Contract owner
    address public contractOwner;
    
    // Domain registration period (1 year in seconds)
    uint256 public constant REGISTRATION_PERIOD = 365 days;
    
    modifier onlyDomainOwner(string memory _domainName) {
        require(domains[_domainName].owner == msg.sender, "Not the domain owner");
        require(domains[_domainName].isActive, "Domain is not active");
        require(block.timestamp < domains[_domainName].expirationTime, "Domain has expired");
        _;
    }
    
    modifier onlyContractOwner() {
        require(msg.sender == contractOwner, "Not the contract owner");
        _;
    }
    
    constructor() {
        contractOwner = msg.sender;
    }
    
    /**
     * @dev Register a new domain name
     * @param _domainName The domain name to register
     * @param _ipAddress The IP address to associate with the domain
     */
    function registerDomain(string memory _domainName, string memory _ipAddress) 
        external 
        payable 
    {
        require(msg.value >= registrationFee, "Insufficient registration fee");
        require(bytes(_domainName).length > 0, "Domain name cannot be empty");
        require(bytes(_ipAddress).length > 0, "IP address cannot be empty");
        require(!domains[_domainName].isActive || block.timestamp >= domains[_domainName].expirationTime, 
                "Domain already registered and active");
        
        // If domain was previously registered but expired, remove from old owner's list
        if (domains[_domainName].owner != address(0)) {
            _removeDomainFromOwner(domains[_domainName].owner, _domainName);
        }
        
        // Register the domain
        domains[_domainName] = Domain({
            owner: msg.sender,
            ipAddress: _ipAddress,
            expirationTime: block.timestamp + REGISTRATION_PERIOD,
            isActive: true
        });
        
        // Add to owner's domain list
        ownerDomains[msg.sender].push(_domainName);
        
        emit DomainRegistered(_domainName, msg.sender, _ipAddress);
    }
    
    /**
     * @dev Update the IP address of a registered domain
     * @param _domainName The domain name to update
     * @param _newIpAddress The new IP address
     */
    function updateDomain(string memory _domainName, string memory _newIpAddress) 
        external 
        onlyDomainOwner(_domainName) 
    {
        require(bytes(_newIpAddress).length > 0, "IP address cannot be empty");
        
        domains[_domainName].ipAddress = _newIpAddress;
        
        emit DomainUpdated(_domainName, _newIpAddress);
    }
    
    /**
     * @dev Resolve a domain name to its IP address
     * @param _domainName The domain name to resolve
     * @return The IP address associated with the domain
     */
    function resolveDomain(string memory _domainName) 
        external 
        view 
        returns (string memory) 
    {
        require(domains[_domainName].isActive, "Domain not found or inactive");
        require(block.timestamp < domains[_domainName].expirationTime, "Domain has expired");
        
        return domains[_domainName].ipAddress;
    }
    
    /**
     * @dev Get domain information
     * @param _domainName The domain name to query
     * @return owner The owner address
     * @return ipAddress The IP address
     * @return expirationTime The expiration timestamp
     * @return isActive Whether the domain is active
     */
    function getDomainInfo(string memory _domainName) 
        external 
        view 
        returns (address owner, string memory ipAddress, uint256 expirationTime, bool isActive) 
    {
        Domain memory domain = domains[_domainName];
        return (domain.owner, domain.ipAddress, domain.expirationTime, domain.isActive);
    }
    
    /**
     * @dev Get all domains owned by an address
     * @param _owner The owner address
     * @return Array of domain names
     */
    function getDomainsByOwner(address _owner) 
        external 
        view 
        returns (string[] memory) 
    {
        return ownerDomains[_owner];
    }
    
    /**
     * @dev Transfer domain ownership
     * @param _domainName The domain name to transfer
     * @param _newOwner The new owner address
     */
    function transferDomain(string memory _domainName, address _newOwner) 
        external 
        onlyDomainOwner(_domainName) 
    {
        require(_newOwner != address(0), "Invalid new owner address");
        require(_newOwner != msg.sender, "Cannot transfer to yourself");
        
        address oldOwner = domains[_domainName].owner;
        
        // Update domain owner
        domains[_domainName].owner = _newOwner;
        
        // Remove from old owner's list
        _removeDomainFromOwner(oldOwner, _domainName);
        
        // Add to new owner's list
        ownerDomains[_newOwner].push(_domainName);
        
        emit DomainTransferred(_domainName, oldOwner, _newOwner);
    }
    
    /**
     * @dev Set registration fee (only contract owner)
     * @param _newFee The new registration fee in wei
     */
    function setRegistrationFee(uint256 _newFee) 
        external 
        onlyContractOwner 
    {
        registrationFee = _newFee;
    }
    
    /**
     * @dev Withdraw contract balance (only contract owner)
     */
    function withdraw() 
        external 
        onlyContractOwner 
    {
        payable(contractOwner).transfer(address(this).balance);
    }
    
    /**
     * @dev Internal function to remove domain from owner's list
     */
    function _removeDomainFromOwner(address _owner, string memory _domainName) internal {
        string[] storage ownerDomainList = ownerDomains[_owner];
        for (uint i = 0; i < ownerDomainList.length; i++) {
            if (keccak256(bytes(ownerDomainList[i])) == keccak256(bytes(_domainName))) {
                ownerDomainList[i] = ownerDomainList[ownerDomainList.length - 1];
                ownerDomainList.pop();
                break;
            }
        }
    }
    
    /**
     * @dev Check if domain is available for registration
     * @param _domainName The domain name to check
     * @return Whether the domain is available
     */
    function isDomainAvailable(string memory _domainName) 
        external 
        view 
        returns (bool) 
    {
        return !domains[_domainName].isActive || block.timestamp >= domains[_domainName].expirationTime;
    }
    
    // ===== NEW FUNCTIONS =====
    
    /**
     * @dev Renew domain registration for another period
     * @param _domainName The domain name to renew
     */
    function renewDomain(string memory _domainName) 
        external 
        payable 
        onlyDomainOwner(_domainName) 
    {
        require(msg.value >= registrationFee, "Insufficient renewal fee");
        
        // Extend expiration time by another registration period
        domains[_domainName].expirationTime += REGISTRATION_PERIOD;
        
        emit DomainRenewed(_domainName, domains[_domainName].expirationTime);
    }
    
    /**
     * @dev Get time remaining until domain expiration
     * @param _domainName The domain name to check
     * @return Time remaining in seconds (0 if expired)
     */
    function getTimeUntilExpiration(string memory _domainName) 
        external 
        view 
        returns (uint256) 
    {
        require(domains[_domainName].owner != address(0), "Domain does not exist");
        
        if (block.timestamp >= domains[_domainName].expirationTime) {
            return 0;
        }
        
        return domains[_domainName].expirationTime - block.timestamp;
    }
    
    /**
     * @dev Deactivate/release a domain before expiration
     * @param _domainName The domain name to deactivate
     */
    function deactivateDomain(string memory _domainName) 
        external 
        onlyDomainOwner(_domainName) 
    {
        domains[_domainName].isActive = false;
        
        emit DomainDeactivated(_domainName);
    }
    
    /**
     * @dev Batch check availability of multiple domains
     * @param _domainNames Array of domain names to check
     * @return Array of boolean values indicating availability
     */
    function batchCheckAvailability(string[] memory _domainNames) 
        external 
        view 
        returns (bool[] memory) 
    {
        bool[] memory availability = new bool[](_domainNames.length);
        
        for (uint i = 0; i < _domainNames.length; i++) {
            availability[i] = !domains[_domainNames[i]].isActive || 
                            block.timestamp >= domains[_domainNames[i]].expirationTime;
        }
        
        return availability;
    }
}
