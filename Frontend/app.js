// LedgerNet Frontend Application app.js here
// Web3 integration here for decentralized DNS system

class LedgerNetApp {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAccount = null;
        
        // Contract configuration -* UPDATE VALUES
        this.contractAddress = "0x..."; // Replace with deployed contract address here
        this.contractABI = [
            "function registerDomain(string memory _domainName, string memory _ipAddress) external payable",
            "function updateDomain(string memory _domainName, string memory _newIpAddress) external",
            "function resolveDomain(string memory _domainName) external view returns (string memory)",
            "function getDomainInfo(string memory _domainName) external view returns (address owner, string memory ipAddress, uint256 expirationTime, bool isActive)",
            "function getDomainsByOwner(address _owner) external view returns (string[] memory)",
            "function transferDomain(string memory _domainName, address _newOwner) external",
            "function isDomainAvailable(string memory _domainName) external view returns (bool)",
            "function registrationFee() external view returns (uint256)",
            "event DomainRegistered(string indexed domainName, address indexed owner, string ipAddress)",
            "event DomainUpdated(string indexed domainName, string newIpAddress)",
            "event DomainTransferred(string indexed domainName, address indexed oldOwner, address indexed newOwner)"
        ];
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.checkWalletConnection();
        this.setupTabNavigation();
    }
    
    // Setup event listener here
    setupEventListeners() {
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        document.getElementById('disconnectWallet').addEventListener('click', () => this.disconnectWallet());
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegisterDomain(e));
        document.getElementById('resolveForm').addEventListener('submit', (e) => this.handleResolveDomain(e));
        document.getElementById('updateForm').addEventListener('submit', (e) => this.handleUpdateDomain(e));
        document.getElementById('loadDomains').addEventListener('click', () => this.loadUserDomains());
    }
    
    // Setup tab navigation
    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all tabs and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }
    
    // Check if wallet is already connected
    async checkWalletConnection() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await this.initializeWeb3();
                }
            } catch (error) {
                console.error('Error checking wallet connection:', error);
            }
        }
    }
    
    // Connect wallet
    async connectWallet() {
        if (typeof window.ethereum === 'undefined') {
            this.showMessage('Please install MetaMask or another Web3 wallet', 'error');
            return;
        }
        
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            await this.initializeWeb3();
            this.showMessage('Wallet connected successfully!', 'success');
        } catch (error) {
            console.error('Error connecting wallet:', error);
            this.showMessage('Failed to connect wallet', 'error');
        }
    }
    
    // Initialize Web3 connection
    async initializeWeb3() {
        try {
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            this.userAccount = await this.signer.getAddress();
            
            // Initialize contract
            this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);
            
            // Update UI
            this.updateWalletUI();
            this.updateNetworkStatus();
            
            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnectWallet();
                } else {
                    this.initializeWeb3();
                }
            });
            
            // Listen for network changes
            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
            
        } catch (error) {
            console.error('Error initializing Web3:', error);
            this.showMessage('Failed to initialize Web3 connection', 'error');
        }
    }
    
    // Update wallet UI
    updateWalletUI() {
        const connectBtn = document.getElementById('connectWallet');
        const walletInfo = document.getElementById('walletInfo');
        const walletAddress = document.getElementById('walletAddress');
        
        if (this.userAccount) {
            connectBtn.classList.add('hidden');
            walletInfo.classList.remove('hidden');
            walletAddress.textContent = this.formatAddress(this.userAccount);
        } else {
            connectBtn.classList.remove('hidden');
            walletInfo.classList.add('hidden');
        }
    }
    
    // Update network status
    async updateNetworkStatus() {
        try {
            const network = await this.provider.getNetwork();
            const networkStatus = document.getElementById('networkStatus');
            const networkName = document.getElementById('networkName');
            
            networkStatus.classList.remove('hidden');
            networkName.textContent = `Connected to ${network.name} (${network.chainId})`;
        } catch (error) {
            console.error('Error getting network info:', error);
        }
    }
    
    // Disconnect wallet
    disconnectWallet() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAccount = null;
        
        this.updateWalletUI();
        document.getElementById('networkStatus').classList.add('hidden');
        document.getElementById('domainsList').innerHTML = '';
        
        this.showMessage('Wallet disconnected', 'info');
    }
    
    // Handle domain registration
    async handleRegisterDomain(e) {
        e.preventDefault();
        
        if (!this.contract) {
            this.showMessage('Please connect your wallet first', 'warning');
            return;
        }
        
        const domainName = document.getElementById('domainName').value.trim();
        const ipAddress = document.getElementById('ipAddress').value.trim();
        const submitBtn = document.getElementById('registerBtn');
        
        if (!this.validateDomainName(domainName) || !this.validateIPAddress(ipAddress)) {
            return;
        }
        
        try {
            this.setButtonLoading(submitBtn, true);
            
            // Check if domain is available
            const isAvailable = await this.contract.isDomainAvailable(domainName);
            if (!isAvailable) {
                this.showMessage('Domain is already registered and active', 'error');
                return;
            }
            
            // Get registration fee
            const registrationFee = await this.contract.registrationFee();
            
            // Register domain
            const tx = await this.contract.registerDomain(domainName, ipAddress, {
                value: registrationFee
            });
            
            this.showMessage('Transaction submitted. Waiting for confirmation...', 'info');
            
            const receipt = await tx.wait();
            
            this.showMessage(`Domain "${domainName}" registered successfully!`, 'success');
            
            // Clear form
            document.getElementById('registerForm').reset();
            
        } catch (error) {
            console.error('Error registering domain:', error);
            this.showMessage('Failed to register domain: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }
    
    // Handle domain resolution
    async handleResolveDomain(e) {
        e.preventDefault();
        
        if (!this.contract) {
            this.showMessage('Please connect your wallet first', 'warning');
            return;
        }
        
        const domainName = document.getElementById('resolveDomain').value.trim();
        const resolveBtn = document.getElementById('resolveBtn');
        const resultCard = document.getElementById('resolveResult');
        
        if (!domainName) {
            this.showMessage('Please enter a domain name', 'warning');
            return;
        }
        
        try {
            this.setButtonLoading(resolveBtn, true);
            
            // Get domain info
            const [owner, ipAddress, expirationTime, isActive] = await this.contract.getDomainInfo(domainName);
            
            if (!isActive) {
                this.showMessage('Domain not found or inactive', 'error');
                resultCard.classList.add('hidden');
                return;
            }
            
            // Update result display
            document.getElementById('resultDomain').textContent = domainName;
            document.getElementById('resultIP').textContent = ipAddress;
            document.getElementById('resultOwner').textContent = this.formatAddress(owner);
            document.getElementById('resultExpiry').textContent = this.formatDate(expirationTime);
            
            resultCard.classList.remove('hidden');
            
        } catch (error) {
            console.error('Error resolving domain:', error);
            this.showMessage('Failed to resolve domain: ' + this.getErrorMessage(error), 'error');
            resultCard.classList.add('hidden');
        } finally {
            this.setButtonLoading(resolveBtn, false);
        }
    }
    
    // Handle domain update
    async handleUpdateDomain(e) {
        e.preventDefault();
        
        if (!this.contract) {
            this.showMessage('Please connect your wallet first', 'warning');
            return;
        }
        
        const domainName = document.getElementById('updateDomainName').value.trim();
        const newIpAddress = document.getElementById('newIpAddress').value.trim();
        const updateBtn = document.getElementById('updateBtn');
        
        if (!this.validateDomainName(domainName) || !this.validateIPAddress(newIpAddress)) {
            return;
        }
        
        try {
            this.setButtonLoading(updateBtn, true);
            
            // Update domain
            const tx = await this.contract.updateDomain(domainName, newIpAddress);
            
            this.showMessage('Transaction submitted. Waiting for confirmation...', 'info');
            
            const receipt = await tx.wait();
            
            this.showMessage(`Domain "${domainName}" updated successfully!`, 'success');
            
            // Clear form
            document.getElementById('updateForm').reset();
            
            // Refresh user domains if loaded
            if (document.getElementById('domainsList').children.length > 0) {
                this.loadUserDomains();
            }
            
        } catch (error) {
            console.error('Error updating domain:', error);
            this.showMessage('Failed to update domain: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.setButtonLoading(updateBtn, false);
        }
    }
    
    // Load user domains
    async loadUserDomains() {
        if (!this.contract || !this.userAccount) {
            this.showMessage('Please connect your wallet first', 'warning');
            return;
        }
        
        const loadBtn = document.getElementById('loadDomains');
        const domainsList = document.getElementById('domainsList');
        
        try {
            this.setButtonLoading(loadBtn, true);
            
            // Get domains owned by user
            const domains = await this.contract.getDomainsByOwner(this.userAccount);
            
            if (domains.length === 0) {
                domainsList.innerHTML = `
                    <div class="empty-state">
                        <h3>No domains found</h3>
                        <p>Register your first domain to get started!</p>
                    </div>
                `;
                return;
            }
            
            // Fetch domain details
            const domainDetails = await Promise.all(
                domains.map(async (domain) => {
                    const [owner, ipAddress, expirationTime, isActive] = await this.contract.getDomainInfo(domain);
                    return { name: domain, owner, ipAddress, expirationTime, isActive };
                })
            );
            
            // Render domains
            domainsList.innerHTML = domainDetails.map(domain => `
                <div class="domain-card">
                    <div class="domain-info">
                        <div class="domain-name">${domain.name}</div>
                        <div class="domain-details">
                            <div>IP: ${domain.ipAddress}</div>
                            <div>Expires: ${this.formatDate(domain.expirationTime)}</div>
                            <div>Status: ${domain.isActive && Date.now() / 1000 < domain.expirationTime ? 'Active' : 'Expired'}</div>
                        </div>
                    </div>
                    <div class="domain-actions">
                        <button class="update-btn" onclick="app.fillUpdateForm('${domain.name}', '${domain.ipAddress}')">
                            Update
                        </button>
                        <button class="transfer-btn" onclick="app.initTransfer('${domain.name}')">
                            Transfer
                        </button>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading domains:', error);
            this.showMessage('Failed to load domains: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.setButtonLoading(loadBtn, false);
        }
    }
    
    // Fill update form with domain data
    fillUpdateForm(domainName, currentIP) {
        document.getElementById('updateDomainName').value = domainName;
        document.getElementById('newIpAddress').value = currentIP;
        
        // Switch to manage tab
        document.querySelector('.tab-btn[data-tab="manage"]').click();
        
        // Scroll to update form
        document.getElementById('updateForm').scrollIntoView({ behavior: 'smooth' });
    }
    
    // Initialize domain transfer
    async initTransfer(domainName) {
        const newOwner = prompt(`Enter the address to transfer "${domainName}" to:`);
        
        if (!newOwner) return;
        
        if (!ethers.utils.isAddress(newOwner)) {
            this.showMessage('Invalid address format', 'error');
            return;
        }
        
        try {
            const tx = await this.contract.transferDomain(domainName, newOwner);
            
            this.showMessage('Transfer transaction submitted. Waiting for confirmation...', 'info');
            
            await tx.wait();
            
            this.showMessage(`Domain "${domainName}" transferred successfully!`, 'success');
            
            // Refresh domains list
            this.loadUserDomains();
            
        } catch (error) {
            console.error('Error transferring domain:', error);
            this.showMessage('Failed to transfer domain: ' + this.getErrorMessage(error), 'error');
        }
    }
    
    // Validation functions
    validateDomainName(domain) {
        if (!domain || domain.length < 3) {
            this.showMessage('Domain name must be at least 3 characters long', 'warning');
            return false;
        }
        
        if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
            this.showMessage('Domain name contains invalid characters', 'warning');
            return false;
        }
        
        return true;
    }
    
    validateIPAddress(ip) {
        if (!ip) {
            this.showMessage('IP address is required', 'warning');
            return false;
        }
        
        // Basic IP validation (both IPv4 and IPv6)
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        
        if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
            this.showMessage('Invalid IP address format', 'warning');
            return false;
        }
        
        return true;
    }
    
    // Utility functions
    formatAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    
    formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    getErrorMessage(error) {
        if (error.reason) return error.reason;
        if (error.message) {
            if (error.message.includes('user rejected')) {
                return 'Transaction was rejected by user';
            }
            if (error.message.includes('insufficient funds')) {
                return 'Insufficient funds for transaction';
            }
            return error.message;
        }
        return 'Unknown error occurred';
    }
    
    setButtonLoading(button, loading) {
        const span = button.querySelector('span');
        const loader = button.querySelector('.loader');
        
        if (loading) {
            button.disabled = true;
            span.style.opacity = '0.7';
            loader.classList.remove('hidden');
        } else {
            button.disabled = false;
            span.style.opacity = '1';
            loader.classList.add('hidden');
        }
    }
    
    showMessage(text, type = 'info') {
        const messagesContainer = document.getElementById('statusMessages');
        const messageDiv = document.createElement('div');
        
        messageDiv.className = `status-message ${type}`;
        messageDiv.textContent = text;
        
        // Add click to dismiss
        messageDiv.addEventListener('click', () => {
            messageDiv.remove();
        });
        
        messagesContainer.appendChild(messageDiv);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LedgerNetApp();
});

// Helper functions for footer links
function showInfo() {
    window.app.showMessage('LedgerNet: Building the decentralized future of DNS', 'info');
}

function showDocs() {
    window.app.showMessage('Documentation: Check our GitHub repository for detailed guides', 'info');
}

function showSupport() {
    window.app.showMessage('Support: Join our Discord community for help and updates', 'info');
}

// Update contract address placeholder
window.addEventListener('load', () => {
    if (window.CONTRACT_ADDRESS && window.CONTRACT_ADDRESS !== "0x...") {
        if (window.app) {
            window.app.contractAddress = window.CONTRACT_ADDRESS;
        }
    } else {
        console.warn('Please update CONTRACT_ADDRESS in index.html with your deployed contract address');
    }
});
