# Password Manager Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Cloud vault + all clients (incl. extension) | Autofill, TOTP, org policies, etc. | [bitwarden/clients](https://github.com/bitwarden/clients) |
| Local KeePass DB bridge | Secure channel to KeePassXC desktop | [keepassxc-browser](https://github.com/keepassxreboot/keepassxc-browser) |

**Note**: Use Web Crypto (see below); before building your own vault, study autofill logic, iframe detection, and native messaging in these repos.

## Common Feature Types

- **Password Storage**: Secure credential storage
- **Auto-fill**: Automatic form filling
- **Password Generation**: Strong password creation
- **Import/Export**: Data portability

## Core Implementation

### Encryption

```javascript
// AES-256-GCM encryption using Web Crypto API
async function encryptPassword(password, masterKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  const key = await deriveKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  return {
    ciphertext: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv)
  };
}

async function decryptPassword(encryptedData, masterKey) {
  const key = await deriveKey(masterKey);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
    key,
    new Uint8Array(encryptedData.ciphertext)
  );
  
  return new TextDecoder().decode(decrypted);
}

// Derive key from master password using PBKDF2
async function deriveKey(masterPassword, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt || crypto.getRandomValues(new Uint8Array(16)),
      iterations: 600000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

### Form Detection and Filling

```javascript
// Detect login forms
function detectLoginForms() {
  const forms = [];
  
  document.querySelectorAll('form').forEach(form => {
    const inputs = form.querySelectorAll('input');
    const passwordInput = Array.from(inputs).find(i => 
      i.type === 'password'
    );
    const usernameInput = Array.from(inputs).find(i =>
      i.type === 'text' || i.type === 'email'
    );
    
    if (passwordInput) {
      forms.push({
        form,
        usernameInput,
        passwordInput,
        submitButton: form.querySelector('input[type="submit"], button[type="submit"]')
      });
    }
  });
  
  return forms;
}

// Auto-fill credentials
function fillCredentials(username, password) {
  const forms = detectLoginForms();
  
  if (forms.length > 0) {
    const form = forms[0];
    
    if (form.usernameInput) {
      form.usernameInput.value = username;
      form.usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    form.passwordInput.value = password;
    form.passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Show autofill popup
function showAutofillPopup(entries) {
  const popup = document.createElement('div');
  popup.className = 'password-autofill-popup';
  popup.innerHTML = `
    <div class="autofill-header">Fill password for ${location.hostname}</div>
    ${entries.map(e => `
      <div class="autofill-item" data-username="${e.username}">
        <div class="autofill-username">${e.username}</div>
        <div class="autofill-url">${e.url}</div>
      </div>
    `).join('')}
  `;
  
  popup.addEventListener('click', async (e) => {
    const item = e.target.closest('.autofill-item');
    if (item) {
      const username = item.dataset.username;
      const entry = entries.find(e => e.username === username);
      const password = await decryptPassword(entry.encryptedPassword, masterKey);
      fillCredentials(username, password);
      popup.remove();
    }
  });
  
  document.body.appendChild(popup);
}
```

### Password Generation

```javascript
function generatePassword(options = {}) {
  const length = options.length || 16;
  const includeUppercase = options.uppercase !== false;
  const includeLowercase = options.lowercase !== false;
  const includeNumbers = options.numbers !== false;
  const includeSymbols = options.symbols !== false;
  
  let charset = '';
  if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (includeNumbers) charset += '0123456789';
  if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  return password;
}

// Generate passphrase (Diceware style)
function generatePassphrase(wordCount = 4) {
  const words = [
    'apple', 'banana', 'cherry', 'date', 'elderberry',
    'fig', 'grape', 'honeydew', 'kiwi', 'lemon'
    // Use a proper wordlist in production
  ];
  
  const array = new Uint32Array(wordCount);
  crypto.getRandomValues(array);
  
  return Array.from(array)
    .map(n => words[n % words.length])
    .join('-');
}
```

### Secure Storage

```javascript
// Store encrypted vault
async function saveVault(vault, masterKey) {
  const encrypted = await encryptPassword(
    JSON.stringify(vault),
    masterKey
  );
  
  await chrome.storage.local.set({
    vault: encrypted,
    lastSync: Date.now()
  });
}

// Load and decrypt vault
async function loadVault(masterKey) {
  const { vault: encrypted } = await chrome.storage.local.get('vault');
  
  if (!encrypted) return { entries: [] };
  
  const decrypted = await decryptPassword(encrypted, masterKey);
  return JSON.parse(decrypted);
}

// Sync with cloud (optional)
async function syncVault(encryptedVault) {
  // Send to sync server
  await fetch('https://api.passwordmanager.com/sync', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ vault: encryptedVault })
  });
}
```

## Permissions Required

- `storage` - Store encrypted passwords
- `activeTab` - Access forms
- `scripting` - Inject fill scripts
- `alarms` - Sync scheduling

## Security Best Practices

1. **Zero-Knowledge**: Never store master password
2. **Client-Side Encryption**: Encrypt before cloud sync
3. **Secure Memory**: Clear sensitive data from memory
4. **Auto-Lock**: Lock vault after inactivity
5. **2FA Support**: TOTP integration
6. **Breach Monitoring**: Check against Have I Been Pwned

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Bitwarden | Full-featured, cloud sync | https://github.com/bitwarden/clients |
| KeePassXC-Browser | KeePassXC integration | https://github.com/keepassxreboot/keepassxc-browser |

## APIs and Standards

- **Web Crypto API**: Native encryption
- **W3C WebAuthn**: Hardware key support
- **Have I Been Pwned API**: Breach checking
