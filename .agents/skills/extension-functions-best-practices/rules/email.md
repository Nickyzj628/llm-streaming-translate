# Email Features Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Gmail unread, list preview, quick actions | Full `chrome.identity` + Gmail API loop | [MailCheckerPlus](https://github.com/AndersSahlin/MailCheckerPlus) |
| Minimal Gmail API + OAuth sample | Learn tokens and REST from scratch | [gmail-api-chrome-extension](https://github.com/anatelli10/gmail-api-chrome-extension) |

**Note**: Gmail API quotas and OAuth consent screens are configured in Google Cloud Console; Mail Checker Plus is a non-toy integration reference.

## Common Feature Types

- **Email Notifications**: Desktop notifications for new emails
- **Email Preview**: Quick view without opening inbox
- **Email Management**: Mark read, delete, archive
- **Multi-Account**: Support multiple email accounts

## Core Implementation

### Gmail API Integration

```javascript
// OAuth authentication
async function authenticate() {
  const token = await chrome.identity.getAuthToken({
    interactive: true,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ]
  });
  return token;
}

// Check unread count
async function getUnreadCount(token) {
  const response = await fetch(
    'https://www.googleapis.com/gmail/v1/users/me/labels/INBOX',
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  const data = await response.json();
  return data.messagesUnread;
}

// Get recent messages
async function getRecentMessages(token, maxResults = 10) {
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  const data = await response.json();
  
  // Fetch full message details
  const messages = await Promise.all(
    data.messages.map(async (msg) => {
      const detail = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      return detail.json();
    })
  );
  
  return messages;
}

// Parse message headers
function parseMessage(message) {
  const headers = message.payload.headers;
  return {
    id: message.id,
    subject: headers.find(h => h.name === 'Subject')?.value || '',
    from: headers.find(h => h.name === 'From')?.value || '',
    date: headers.find(h => h.name === 'Date')?.value || '',
    snippet: message.snippet
  };
}

// Quick actions
async function markAsRead(token, messageId) {
  await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD']
      })
    }
  );
}

async function archiveMessage(token, messageId) {
  await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['INBOX']
      })
    }
  );
}
```

### Desktop Notifications

```javascript
// Show notification for new email
function showEmailNotification(email) {
  chrome.notifications.create(email.id, {
    type: 'basic',
    iconUrl: 'icons/email.png',
    title: email.subject,
    message: `From: ${email.from}\n${email.snippet.substring(0, 100)}...`,
    buttons: [
      { title: 'Mark Read' },
      { title: 'Archive' }
    ]
  });
}

// Handle notification clicks
chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (btnIdx === 0) {
    markAsRead(token, notifId);
  } else if (btnIdx === 1) {
    archiveMessage(token, notifId);
  }
});
```

### Badge Updates

```javascript
// Update extension badge with unread count
async function updateBadge() {
  try {
    const token = await authenticate();
    const count = await getUnreadCount(token);
    
    chrome.action.setBadgeText({
      text: count > 0 ? count.toString() : ''
    });
    chrome.action.setBadgeBackgroundColor({ color: '#EA4335' });
  } catch (err) {
    console.error('Failed to update badge:', err);
  }
}

// Poll for updates
chrome.alarms.create('checkEmail', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkEmail') {
    updateBadge();
  }
});
```

### Popup UI

```javascript
// popup.js
async function loadEmails() {
  const token = await authenticate();
  const messages = await getRecentMessages(token, 10);
  
  const list = document.getElementById('email-list');
  list.innerHTML = '';
  
  messages.forEach(msg => {
    const email = parseMessage(msg);
    const item = document.createElement('div');
    item.className = 'email-item';
    item.innerHTML = `
      <div class="subject">${escapeHtml(email.subject)}</div>
      <div class="from">${escapeHtml(email.from)}</div>
      <div class="snippet">${escapeHtml(email.snippet)}</div>
      <div class="actions">
        <button data-action="read" data-id="${email.id}">Mark Read</button>
        <button data-action="archive" data-id="${email.id}">Archive</button>
      </div>
    `;
    list.appendChild(item);
  });
}

// Handle action buttons
document.addEventListener('click', async (e) => {
  if (e.target.dataset.action) {
    const token = await authenticate();
    const id = e.target.dataset.id;
    
    if (e.target.dataset.action === 'read') {
      await markAsRead(token, id);
    } else if (e.target.dataset.action === 'archive') {
      await archiveMessage(token, id);
    }
    
    loadEmails(); // Refresh
  }
});
```

## Permissions Required

- `identity` - OAuth authentication
- `notifications` - Desktop notifications
- `alarms` - Polling for updates
- `https://www.googleapis.com/` - Gmail API

## Best Practices

1. **Token Management**: Handle token expiration gracefully
2. **Rate Limiting**: Respect Gmail API quotas
3. **Offline Support**: Cache recent emails
4. **Privacy**: Don't send email content to other servers
5. **Multi-Account**: Support switching between accounts
6. **Error Handling**: Handle network errors gracefully

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Mail Checker Plus | Gmail preview, quick actions | https://github.com/AndersSahlin/MailCheckerPlus |
| gmail-api-chrome-extension | Minimal Gmail API + OAuth sample | https://github.com/anatelli10/gmail-api-chrome-extension |

## Gmail API Quotas

- 1 billion quota units per day
- Read operations: 5 units
- Modify operations: 100 units
- Check quotas at: https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas
