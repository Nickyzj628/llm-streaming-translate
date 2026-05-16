# Web3 Wallet Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| EIP-1193 provider, signing, network switching | De facto DApp compatibility baseline | [metamask-extension](https://github.com/MetaMask/metamask-extension) |
| Multi-chain, tx preview / simulation | Pre-execution hints, signing UI | [Rabby](https://github.com/RabbyHub/Rabby) |
| Modern wallet UI (alternate style) | Rainbow product extension source | [rainbow browser-extension](https://github.com/rainbow-me/browser-extension) |

**Note**: Private keys never leave the background; `window.ethereum` injection and content/background bridges in these repos are production-grade references.

## Common Feature Types

- **Wallet Management**: Account creation, import, key storage
- **Transaction Signing**: Sign transactions and messages
- **DApp Connection**: Connect to decentralized applications
- **Multi-Chain Support**: Ethereum, Layer 2s, other EVM chains

## Core Implementation

### Wallet Creation and Import

```javascript
// Generate mnemonic (BIP39)
function generateMnemonic() {
  const wordlist = ['abandon', 'ability', 'able', ...]; // 2048 words
  const entropy = crypto.getRandomValues(new Uint8Array(16));
  
  // Convert to mnemonic (simplified - use proper library in production)
  const words = [];
  for (let i = 0; i < 12; i++) {
    const index = (entropy[i * 2] << 8 | entropy[i * 2 + 1]) % 2048;
    words.push(wordlist[index]);
  }
  
  return words.join(' ');
}

// Derive private key from mnemonic (BIP32/BIP44)
async function derivePrivateKey(mnemonic, path = "m/44'/60'/0'/0/0") {
  const seed = await pbkdf2(mnemonic, 'mnemonic', 2048, 64, 'sha512');
  // Derive key using BIP32
  // Use library like ethers.js in production
}

// Import from private key
function importFromPrivateKey(privateKeyHex) {
  // Remove 0x prefix if present
  const cleanKey = privateKeyHex.replace(/^0x/, '');
  
  // Validate key format
  if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key format');
  }
  
  return {
    privateKey: cleanKey,
    address: privateKeyToAddress(cleanKey)
  };
}
```

### Secure Key Storage

```javascript
// Encrypt and store keys
async function storeWallet(wallet, password) {
  const encrypted = await encryptWallet(wallet, password);
  
  await chrome.storage.local.set({
    wallets: [{
      address: wallet.address,
      encrypted: encrypted,
      createdAt: Date.now()
    }],
    activeWallet: wallet.address
  });
}

// Encrypt wallet using Web Crypto
async function encryptWallet(wallet, password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify({
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic
  }));
  
  const key = await deriveKeyFromPassword(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  return {
    ciphertext: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    salt: Array.from(key.salt)
  };
}

// Unlock wallet
async function unlockWallet(address, password) {
  const { wallets } = await chrome.storage.local.get('wallets');
  const wallet = wallets.find(w => w.address === address);
  
  if (!wallet) throw new Error('Wallet not found');
  
  const decrypted = await decryptWallet(wallet.encrypted, password);
  return JSON.parse(decrypted);
}
```

### EIP-1193 Provider Injection

```javascript
// Inject Ethereum provider into page
function injectProvider() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-provider.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// injected-provider.js
window.ethereum = {
  isMetaMask: false,
  isRabby: true,
  
  // Required methods per EIP-1193
  request: async (args) => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substr(2, 9);
      
      window.addEventListener('message', function handler(event) {
        if (event.data.type === 'WALLET_RESPONSE' && event.data.id === id) {
          window.removeEventListener('message', handler);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      });
      
      window.postMessage({
        type: 'WALLET_REQUEST',
        id,
        method: args.method,
        params: args.params
      }, '*');
    });
  },
  
  on: (event, handler) => {
    // Event handling
  },
  
  removeListener: (event, handler) => {
    // Remove handler
  }
};

// Background script handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'WALLET_REQUEST') {
    handleWalletRequest(msg.method, msg.params)
      .then(result => sendResponse({ result }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Async
  }
});
```

### Transaction Signing

```javascript
// Sign Ethereum transaction
async function signTransaction(txParams, privateKey) {
  const { ethers } = await import('ethers');
  
  const wallet = new ethers.Wallet(privateKey);
  
  const tx = {
    to: txParams.to,
    value: ethers.parseEther(txParams.value || '0'),
    gasLimit: txParams.gas,
    gasPrice: txParams.gasPrice,
    nonce: txParams.nonce,
    data: txParams.data
  };
  
  const signedTx = await wallet.signTransaction(tx);
  return signedTx;
}

// Sign message
async function signMessage(message, privateKey) {
  const { ethers } = await import('ethers');
  const wallet = new ethers.Wallet(privateKey);
  
  return wallet.signMessage(message);
}

// Sign typed data (EIP-712)
async function signTypedData(domain, types, value, privateKey) {
  const { ethers } = await import('ethers');
  const wallet = new ethers.Wallet(privateKey);
  
  return wallet.signTypedData(domain, types, value);
}
```

### Multi-Chain Support

```javascript
const CHAINS = {
  ethereum: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://eth.llamarpc.com'],
    blockExplorerUrls: ['https://etherscan.io']
  },
  polygon: {
    chainId: '0x89',
    chainName: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://polygonscan.com']
  },
  arbitrum: {
    chainId: '0xa4b1',
    chainName: 'Arbitrum One',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://arbiscan.io']
  }
};

// Switch chain
async function switchChain(chainId) {
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }]
    });
  } catch (error) {
    // Chain not added, need to add it
    if (error.code === 4902) {
      const chain = Object.values(CHAINS).find(c => c.chainId === chainId);
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [chain]
      });
    }
  }
}
```

### Transaction Confirmation UI

```javascript
// Show transaction details before signing
function showTransactionPopup(txParams) {
  return new Promise((resolve, reject) => {
    const popup = document.createElement('div');
    popup.className = 'tx-confirmation-popup';
    popup.innerHTML = `
      <div class="tx-header">Confirm Transaction</div>
      <div class="tx-details">
        <div class="tx-row">
          <span>To:</span>
          <span>${txParams.to}</span>
        </div>
        <div class="tx-row">
          <span>Value:</span>
          <span>${ethers.formatEther(txParams.value || '0')} ETH</span>
        </div>
        <div class="tx-row">
          <span>Gas Fee:</span>
          <span>${calculateGasFee(txParams)} ETH</span>
        </div>
      </div>
      <div class="tx-actions">
        <button class="reject">Reject</button>
        <button class="confirm">Confirm</button>
      </div>
    `;
    
    popup.querySelector('.confirm').onclick = () => {
      popup.remove();
      resolve(true);
    };
    
    popup.querySelector('.reject').onclick = () => {
      popup.remove();
      reject(new Error('User rejected'));
    };
    
    document.body.appendChild(popup);
  });
}
```

## Permissions Required

- `storage` - Store encrypted wallets
- `activeTab` - Inject provider
- `scripting` - Content script injection
- `alarms` - Balance updates

## Security Best Practices

1. **Never expose private keys** to content scripts
2. **Hardware wallet support** for large amounts
3. **Phishing detection** warn on suspicious sites
4. **Transaction simulation** show expected outcomes
5. **Audit smart contracts** before approval
6. **Session timeout** auto-lock after inactivity

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| MetaMask | Industry standard | https://github.com/MetaMask/metamask-extension |
| Rabby | Multi-chain, transaction simulation | https://github.com/RabbyHub/Rabby |
| Rainbow | Wallet UI / injection patterns | https://github.com/rainbow-me/browser-extension |

## Libraries

- **ethers.js**: https://docs.ethers.org/
- **web3.js**: https://web3js.readthedocs.io/
- **viem**: https://viem.sh/

## Standards

- **EIP-1193**: Ethereum Provider JavaScript API
- **EIP-1102**: Opt-in account exposure
- **EIP-712**: Typed data signing
