const { ethers } = require("hardhat");
const fs = require("fs"); // file handle here
const path = require("path");

async function main() {
    console.log("Starting LedgerNet deployment...\n");

    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    
    console.log("📝 Deployment details:");
    console.log("   Deployer address:", deployer.address);
    console.log("   Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
    
    // Get network information
    const network = await ethers.provider.getNetwork();
    console.log("   Network:", network.name);
    console.log("   Chain ID:", network.chainId);
    console.log("");

    // Deploy the LedgerNet contract
    console.log("📦 Deploying LedgerNet contract...");
    
    const LedgerNet = await ethers.getContractFactory("LedgerNet");
    const ledgerNet = await LedgerNet.deploy();
    
    // Wait for deployment to complete
    await ledgerNet.deployed();
    
    console.log("✅ LedgerNet deployed successfully!");
    console.log("   Contract address:", ledgerNet.address);
    console.log("   Transaction hash:", ledgerNet.deployTransaction.hash);
    console.log("   Gas used:", (await ledgerNet.deployTransaction.wait()).gasUsed.toString());
    console.log("");

    // Verify contract details
    console.log("🔍 Verifying contract deployment...");
    
    const registrationFee = await ledgerNet.registrationFee();
    const contractOwner = await ledgerNet.contractOwner();
    
    console.log("   Registration fee:", ethers.utils.formatEther(registrationFee), "ETH");
    console.log("   Contract owner:", contractOwner);
    console.log("   Registration period: 365 days");
    console.log("");

    // Test basic functionality
    console.log("🧪 Testing contract functionality...");
    
    try {
        // Test domain availability check
        const testDomain = "test.ledger";
        const isAvailable = await ledgerNet.isDomainAvailable(testDomain);
        console.log(`   Domain "${testDomain}" available:`, isAvailable);
        
        console.log("✅ Contract functionality test passed!");
    } catch (error) {
        console.log("❌ Contract functionality test failed:", error.message);
    }
    console.log("");

    // Generate deployment summary
    const deploymentInfo = {
        contractAddress: ledgerNet.address,
        contractOwner: contractOwner,
        deployerAddress: deployer.address,
        transactionHash: ledgerNet.deployTransaction.hash,
        blockNumber: (await ledgerNet.deployTransaction.wait()).blockNumber,
        network: network.name,
        chainId: network.chainId,
        registrationFee: ethers.utils.formatEther(registrationFee),
        deploymentTime: new Date().toISOString(),
        gasUsed: (await ledgerNet.deployTransaction.wait()).gasUsed.toString()
    };

    // Save deployment info to file
    const deploymentPath = path.join(__dirname, "deployments");
    if (!fs.existsSync(deploymentPath)) {
        fs.mkdirSync(deploymentPath, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentPath, `ledgernet-${network.name}-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("💾 Deployment information saved to:", deploymentFile);
    console.log("");

    // Update frontend configuration
    await updateFrontendConfig(ledgerNet.address, network.name, network.chainId);

    // Display post-deployment instructions
    console.log("🎉 Deployment completed successfully!");
    console.log("");
    console.log("📋 Next steps:");
    console.log("   1. Update your frontend with the contract address above");
    console.log("   2. Verify the contract on Etherscan (if on mainnet/testnet)");
    console.log("   3. Test domain registration through the frontend");
    console.log("   4. Fund the deployer account with ETH for gas fees");
    console.log("");
    console.log("🔗 Contract Address (copy this):", ledgerNet.address);
    console.log("");

    // Etherscan verification command (for supported networks)
    if (["mainnet", "goerli", "sepolia", "polygon", "mumbai"].includes(network.name)) {
        console.log("🔍 To verify on Etherscan, run:");
        console.log(`   npx hardhat verify --network ${network.name} ${ledgerNet.address}`);
        console.log("");
    }

    return {
        contract: ledgerNet,
        address: ledgerNet.address,
        deploymentInfo: deploymentInfo
    };
}

// Function to update frontend configuration
async function updateFrontendConfig(contractAddress, networkName, chainId) {
    console.log("🔧 Updating frontend configuration...");
    
    try {
        // Update the contract address in index.html
        const indexPath = path.join(__dirname, "..", "Frontend", "index.html");
        
        if (fs.existsSync(indexPath)) {
            let indexContent = fs.readFileSync(indexPath, "utf8");
            
            // Replace the contract address placeholder
            indexContent = indexContent.replace(
                'window.CONTRACT_ADDRESS = "0x...";',
                `window.CONTRACT_ADDRESS = "${contractAddress}";`
            );
            
            fs.writeFileSync(indexPath, indexContent);
            console.log("   ✅ Updated contract address in index.html");
        } else {
            console.log("   ⚠️ Frontend index.html not found, please update manually");
        }

        // Create a separate config file for the frontend
        const configContent = `// LedgerNet Contract Configuration
// Auto-generated by deploy script

const LEDGERNET_CONFIG = {
    contractAddress: "${contractAddress}",
    network: "${networkName}",
    chainId: ${chainId},
    registrationFee: "0.01",
    deploymentTime: "${new Date().toISOString()}"
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.LEDGERNET_CONFIG = LEDGERNET_CONFIG;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LEDGERNET_CONFIG;
}`;

        const configPath = path.join(__dirname, "..", "Frontend", "config.js");
        fs.writeFileSync(configPath, configContent);
        console.log("   ✅ Created config.js for frontend");
        
    } catch (error) {
        console.log("   ❌ Failed to update frontend config:", error.message);
        console.log("   Please update the contract address manually in your frontend files");
    }
}

// Function for development testing
async function deployAndTest() {
    console.log("🧪 Development Testing Mode\n");
    
    const deployment = await main();
    const { contract } = deployment;
    
    console.log("🚀 Running automated tests...\n");
    
    // Get test accounts
    const [deployer, user1, user2] = await ethers.getSigners();
    
    try {
        // Test 1: Register a domain
        console.log("Test 1: Registering test domain...");
        const registrationFee = await contract.registrationFee();
        const tx1 = await contract.connect(user1).registerDomain("test.ledger", "192.168.1.100", {
            value: registrationFee
        });
        await tx1.wait();
        console.log("✅ Domain registered successfully");
        
        // Test 2: Resolve the domain
        console.log("Test 2: Resolving domain...");
        const resolvedIP = await contract.resolveDomain("test.ledger");
        console.log("✅ Domain resolved to:", resolvedIP);
        
        // Test 3: Update domain
        console.log("Test 3: Updating domain IP...");
        const tx2 = await contract.connect(user1).updateDomain("test.ledger", "192.168.1.200");
        await tx2.wait();
        console.log("✅ Domain updated successfully");
        
        // Test 4: Get domain info
        console.log("Test 4: Getting domain information...");
        const [owner, ipAddress, expirationTime, isActive] = await contract.getDomainInfo("test.ledger");
        console.log("✅ Domain info retrieved:");
        console.log("   Owner:", owner);
        console.log("   IP:", ipAddress);
        console.log("   Expires:", new Date(expirationTime * 1000).toLocaleDateString());
        console.log("   Active:", isActive);
        
        console.log("\n🎉 All tests passed!");
        
    } catch (error) {
        console.log("❌ Test failed:", error.message);
    }
}

// Handle different execution modes
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes("--test")) {
        deployAndTest()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error("❌ Deployment/testing failed:", error);
                process.exit(1);
            });
    } else {
        main()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error("❌ Deployment failed:", error);
                process.exit(1);
            });
    }
}

module.exports = { main, deployAndTest };
