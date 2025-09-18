const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LedgerNet", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployLedgerNetFixture() {
    const registrationFee = ethers.utils.parseEther("0.01");
    const registrationPeriod = 365 * 24 * 60 * 60; // 1 year in seconds

    // Contracts are deployed using the first signer/account by default
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const LedgerNet = await ethers.getContractFactory("LedgerNet");
    const ledgerNet = await LedgerNet.deploy();

    return { ledgerNet, registrationFee, registrationPeriod, owner, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { ledgerNet, owner } = await loadFixture(deployLedgerNetFixture);

      expect(await ledgerNet.contractOwner()).to.equal(owner.address);
    });

    it("Should set the correct registration fee", async function () {
      const { ledgerNet, registrationFee } = await loadFixture(deployLedgerNetFixture);

      expect(await ledgerNet.registrationFee()).to.equal(registrationFee);
    });

    it("Should set the correct registration period", async function () {
      const { ledgerNet, registrationPeriod } = await loadFixture(deployLedgerNetFixture);

      expect(await ledgerNet.REGISTRATION_PERIOD()).to.equal(registrationPeriod);
    });
  });

  describe("Domain Registration", function () {
    describe("Validations", function () {
      it("Should revert with insufficient registration fee", async function () {
        const { ledgerNet, user1 } = await loadFixture(deployLedgerNetFixture);

        await expect(
          ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
            value: ethers.utils.parseEther("0.005") // Less than required fee
          })
        ).to.be.revertedWith("Insufficient registration fee");
      });

      it("Should revert with empty domain name", async function () {
        const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

        await expect(
          ledgerNet.connect(user1).registerDomain("", "192.168.1.1", {
            value: registrationFee
          })
        ).to.be.revertedWith("Domain name cannot be empty");
      });

      it("Should revert with empty IP address", async function () {
        const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

        await expect(
          ledgerNet.connect(user1).registerDomain("test.eth", "", {
            value: registrationFee
          })
        ).to.be.revertedWith("IP address cannot be empty");
      });

      it("Should revert when trying to register an already active domain", async function () {
        const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

        // Register domain with user1
        await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
          value: registrationFee
        });

        // Try to register same domain with user2
        await expect(
          ledgerNet.connect(user2).registerDomain("test.eth", "192.168.1.2", {
            value: registrationFee
          })
        ).to.be.revertedWith("Domain already registered and active");
      });
    });

    describe("Events", function () {
      it("Should emit DomainRegistered event", async function () {
        const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

        await expect(
          ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
            value: registrationFee
          })
        )
          .to.emit(ledgerNet, "DomainRegistered")
          .withArgs("test.eth", user1.address, "192.168.1.1");
      });
    });

    describe("Success Cases", function () {
      it("Should register a domain successfully", async function () {
        const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

        await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
          value: registrationFee
        });

        const [owner, ipAddress, expirationTime, isActive] = await ledgerNet.getDomainInfo("test.eth");
        
        expect(owner).to.equal(user1.address);
        expect(ipAddress).to.equal("192.168.1.1");
        expect(isActive).to.be.true;
        expect(expirationTime).to.be.greaterThan(await time.latest());
      });

      it("Should add domain to owner's list", async function () {
        const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

        await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
          value: registrationFee
        });

        const ownerDomains = await ledgerNet.getDomainsByOwner(user1.address);
        expect(ownerDomains).to.include("test.eth");
        expect(ownerDomains.length).to.equal(1);
      });

      it("Should allow registration of expired domain", async function () {
        const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

        // Register domain
        await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
          value: registrationFee
        });

        // Fast forward time beyond expiration
        await time.increase(366 * 24 * 60 * 60); // 366 days

        // New user should be able to register expired domain
        await expect(
          ledgerNet.connect(user2).registerDomain("test.eth", "192.168.1.2", {
            value: registrationFee
          })
        ).to.not.be.reverted;

        const [owner, ipAddress] = await ledgerNet.getDomainInfo("test.eth");
        expect(owner).to.equal(user2.address);
        expect(ipAddress).to.equal("192.168.1.2");
      });
    });
  });

  describe("Domain Resolution", function () {
    it("Should resolve domain to correct IP address", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      const resolvedIP = await ledgerNet.resolveDomain("test.eth");
      expect(resolvedIP).to.equal("192.168.1.1");
    });

    it("Should revert when resolving inactive domain", async function () {
      const { ledgerNet } = await loadFixture(deployLedgerNetFixture);

      await expect(ledgerNet.resolveDomain("nonexistent.eth"))
        .to.be.revertedWith("Domain not found or inactive");
    });

    it("Should revert when resolving expired domain", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      // Fast forward time beyond expiration
      await time.increase(366 * 24 * 60 * 60);

      await expect(ledgerNet.resolveDomain("test.eth"))
        .to.be.revertedWith("Domain has expired");
    });
  });

  describe("Domain Updates", function () {
    it("Should update domain IP address successfully", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      // Register domain
      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      // Update IP address
      await ledgerNet.connect(user1).updateDomain("test.eth", "192.168.1.100");

      const resolvedIP = await ledgerNet.resolveDomain("test.eth");
      expect(resolvedIP).to.equal("192.168.1.100");
    });

    it("Should emit DomainUpdated event", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await expect(
        ledgerNet.connect(user1).updateDomain("test.eth", "192.168.1.100")
      )
        .to.emit(ledgerNet, "DomainUpdated")
        .withArgs("test.eth", "192.168.1.100");
    });

    it("Should revert when non-owner tries to update", async function () {
      const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await expect(
        ledgerNet.connect(user2).updateDomain("test.eth", "192.168.1.100")
      ).to.be.revertedWith("Not the domain owner");
    });

    it("Should revert when updating with empty IP address", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await expect(
        ledgerNet.connect(user1).updateDomain("test.eth", "")
      ).to.be.revertedWith("IP address cannot be empty");
    });

    it("Should revert when updating expired domain", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      // Fast forward time beyond expiration
      await time.increase(366 * 24 * 60 * 60);

      await expect(
        ledgerNet.connect(user1).updateDomain("test.eth", "192.168.1.100")
      ).to.be.revertedWith("Domain has expired");
    });
  });

  describe("Domain Transfer", function () {
    it("Should transfer domain successfully", async function () {
      const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

      // Register domain
      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      // Transfer domain
      await ledgerNet.connect(user1).transferDomain("test.eth", user2.address);

      const [owner] = await ledgerNet.getDomainInfo("test.eth");
      expect(owner).to.equal(user2.address);
    });

    it("Should emit DomainTransferred event", async function () {
      const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await expect(
        ledgerNet.connect(user1).transferDomain("test.eth", user2.address)
      )
        .to.emit(ledgerNet, "DomainTransferred")
        .withArgs("test.eth", user1.address, user2.address);
    });

    it("Should update ownership lists correctly", async function () {
      const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await ledgerNet.connect(user1).transferDomain("test.eth", user2.address);

      const user1Domains = await ledgerNet.getDomainsByOwner(user1.address);
      const user2Domains = await ledgerNet.getDomainsByOwner(user2.address);

      expect(user1Domains).to.not.include("test.eth");
      expect(user2Domains).to.include("test.eth");
    });

    it("Should revert when transferring to zero address", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await expect(
        ledgerNet.connect(user1).transferDomain("test.eth", ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid new owner address");
    });

    it("Should revert when transferring to self", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      await expect(
        ledgerNet.connect(user1).transferDomain("test.eth", user1.address)
      ).to.be.revertedWith("Cannot transfer to yourself");
    });
  });

  describe("Domain Availability", function () {
    it("Should return true for unregistered domain", async function () {
      const { ledgerNet } = await loadFixture(deployLedgerNetFixture);

      const isAvailable = await ledgerNet.isDomainAvailable("unregistered.eth");
      expect(isAvailable).to.be.true;
    });

    it("Should return false for active domain", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      const isAvailable = await ledgerNet.isDomainAvailable("test.eth");
      expect(isAvailable).to.be.false;
    });

    it("Should return true for expired domain", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      // Fast forward time beyond expiration
      await time.increase(366 * 24 * 60 * 60);

      const isAvailable = await ledgerNet.isDomainAvailable("test.eth");
      expect(isAvailable).to.be.true;
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to set registration fee", async function () {
      const { ledgerNet, owner } = await loadFixture(deployLedgerNetFixture);

      const newFee = ethers.utils.parseEther("0.02");
      await ledgerNet.connect(owner).setRegistrationFee(newFee);

      expect(await ledgerNet.registrationFee()).to.equal(newFee);
    });

    it("Should revert when non-owner tries to set fee", async function () {
      const { ledgerNet, user1 } = await loadFixture(deployLedgerNetFixture);

      const newFee = ethers.utils.parseEther("0.02");
      await expect(
        ledgerNet.connect(user1).setRegistrationFee(newFee)
      ).to.be.revertedWith("Not the contract owner");
    });

    it("Should allow owner to withdraw funds", async function () {
      const { ledgerNet, owner, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      // Register a domain to add funds to contract
      await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });

      const initialBalance = await owner.getBalance();
      const contractBalance = await ethers.provider.getBalance(ledgerNet.address);

      expect(contractBalance).to.equal(registrationFee);

      // Withdraw funds
      const tx = await ledgerNet.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const finalBalance = await owner.getBalance();
      const expectedBalance = initialBalance.add(registrationFee).sub(gasUsed);

      expect(finalBalance).to.equal(expectedBalance);
      expect(await ethers.provider.getBalance(ledgerNet.address)).to.equal(0);
    });

    it("Should revert when non-owner tries to withdraw", async function () {
      const { ledgerNet, user1 } = await loadFixture(deployLedgerNetFixture);

      await expect(
        ledgerNet.connect(user1).withdraw()
      ).to.be.revertedWith("Not the contract owner");
    });
  });

  describe("Multiple Domains", function () {
    it("Should allow user to register multiple domains", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      await ledgerNet.connect(user1).registerDomain("domain1.eth", "192.168.1.1", {
        value: registrationFee
      });
      
      await ledgerNet.connect(user1).registerDomain("domain2.eth", "192.168.1.2", {
        value: registrationFee
      });

      const ownerDomains = await ledgerNet.getDomainsByOwner(user1.address);
      expect(ownerDomains.length).to.equal(2);
      expect(ownerDomains).to.include("domain1.eth");
      expect(ownerDomains).to.include("domain2.eth");
    });

    it("Should handle domain list updates correctly on transfer", async function () {
      const { ledgerNet, user1, user2, registrationFee } = await loadFixture(deployLedgerNetFixture);

      // Register multiple domains
      await ledgerNet.connect(user1).registerDomain("domain1.eth", "192.168.1.1", {
        value: registrationFee
      });
      await ledgerNet.connect(user1).registerDomain("domain2.eth", "192.168.1.2", {
        value: registrationFee
      });

      // Transfer one domain
      await ledgerNet.connect(user1).transferDomain("domain1.eth", user2.address);

      const user1Domains = await ledgerNet.getDomainsByOwner(user1.address);
      const user2Domains = await ledgerNet.getDomainsByOwner(user2.address);

      expect(user1Domains.length).to.equal(1);
      expect(user1Domains).to.include("domain2.eth");
      expect(user2Domains.length).to.equal(1);
      expect(user2Domains).to.include("domain1.eth");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle domain names with special characters", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      const domainName = "test-domain.sub.eth";
      await ledgerNet.connect(user1).registerDomain(domainName, "192.168.1.1", {
        value: registrationFee
      });

      const resolvedIP = await ledgerNet.resolveDomain(domainName);
      expect(resolvedIP).to.equal("192.168.1.1");
    });

    it("Should handle IPv6 addresses", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      const ipv6Address = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
      await ledgerNet.connect(user1).registerDomain("test.eth", ipv6Address, {
        value: registrationFee
      });

      const resolvedIP = await ledgerNet.resolveDomain("test.eth");
      expect(resolvedIP).to.equal(ipv6Address);
    });

    it("Should handle long domain names", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      const longDomain = "a".repeat(100) + ".eth";
      await ledgerNet.connect(user1).registerDomain(longDomain, "192.168.1.1", {
        value: registrationFee
      });

      const resolvedIP = await ledgerNet.resolveDomain(longDomain);
      expect(resolvedIP).to.equal("192.168.1.1");
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should use reasonable gas for domain registration", async function () {
      const { ledgerNet, user1, registrationFee } = await loadFixture(deployLedgerNetFixture);

      const tx = await ledgerNet.connect(user1).registerDomain("test.eth", "192.168.1.1", {
        value: registrationFee
      });
      const receipt = await tx.wait();

      // Gas should be reasonable (less than 300k for registration)
      expect(receipt.gasUsed.toNumber()).to.be.lessThan(300000);
    });
  });
});
