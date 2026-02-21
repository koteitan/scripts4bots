# Claude Code Integration Reference

Advanced reference for Claude Code automation and notification patterns.

## Webhook integration patterns

### Discord webhook (default in claude-hook.js)

```javascript
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN';
const DISCORD_THREAD_ID = 'YOUR_THREAD_ID'; // Optional, for forum threads

const webhookUrl = `${DISCORD_WEBHOOK_URL}?thread_id=${DISCORD_THREAD_ID}`;
const payload = {
  content: '<@USER_ID> ✅ Claude Code completed (1m 23s)'
};

await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
```

### OpenClaw `/hooks/wake` endpoint

```javascript
const OPENCLAW_URL = 'http://localhost:18789/hooks/wake';
const OPENCLAW_TOKEN = 'your-secret-token';

await fetch(OPENCLAW_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENCLAW_TOKEN}`
  },
  body: JSON.stringify({
    text: '✅ Claude Code completed'
  })
});
```

**OpenClaw wake endpoint behavior:**
- Wakes the main session immediately
- Agent receives the message as a system event
- Can trigger agent to post to Discord/Telegram/etc.

### OpenClaw `/hooks/agent` endpoint (isolated agent)

```javascript
const OPENCLAW_AGENT_URL = 'http://localhost:18789/hooks/agent';
const OPENCLAW_TOKEN = 'your-secret-token';

await fetch(OPENCLAW_AGENT_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENCLAW_TOKEN}`
  },
  body: JSON.stringify({
    message: '✅ Claude Code completed (1m 23s)',
    name: 'Claude Code',
    delivery: {
      mode: 'announce',
      channel: 'discord',
      to: 'CHANNEL_ID'
    }
  })
});
```

**Note:** As of 2026-02-21, the `delivery` parameter only delivers the isolated agent's **response**, not the message itself. For direct Discord posting, use Discord webhook instead.

## Error handling and retry logic

### Basic error handling

```javascript
proc.on('error', (error) => {
  console.error('Failed to start Claude Code:', error.message);
  notifyError(`Failed to start: ${error.message}`);
  process.exit(1);
});

proc.on('exit', async (code, signal) => {
  if (signal) {
    await notifyError(`Claude Code killed by signal: ${signal}`);
  } else if (code !== 0) {
    await notifyError(`Claude Code failed with exit code: ${code}`);
  } else {
    await notifySuccess('Claude Code completed successfully');
  }
});
```

### Retry logic for webhook failures

```javascript
async function notifyWithRetry(payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        console.log('Notification sent successfully');
        return;
      }
      
      console.warn(`Attempt ${i + 1} failed: ${response.status}`);
    } catch (error) {
      console.warn(`Attempt ${i + 1} error: ${error.message}`);
    }
    
    // Exponential backoff
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
  
  console.error('All retry attempts failed');
}
```

## Alternative notification channels

### Slack webhook

```javascript
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';

await fetch(SLACK_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '✅ Claude Code completed',
    username: 'Claude Code Bot',
    icon_emoji: ':robot_face:'
  })
});
```

### Telegram bot

```javascript
const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN';
const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID';

await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: '✅ Claude Code completed'
  })
});
```

### Email (via SMTP)

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password'
  }
});

await transporter.sendMail({
  from: '"Claude Code Bot" <bot@example.com>',
  to: 'you@example.com',
  subject: 'Claude Code Completed',
  text: '✅ Claude Code finished successfully'
});
```

## Claude Code Stop hook (legacy, does not work with `-p`)

**⚠️ Important:** Stop hook does NOT fire when using `-p --dangerously-skip-permissions`

For reference, the Stop hook configuration (does not work in automated mode):

```json
// ~/.claude/settings.json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:18789/hooks/wake -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d '{\"text\": \"Claude completed\"}'"
          }
        ]
      }
    ]
  }
}
```

This configuration only works in interactive mode (without `-p`). For automated mode, use the wrapper script pattern instead.

## Performance optimization

### Disable color output to save API tokens

```javascript
proc.env.NO_COLOR = '1';
```

ANSI color codes increase token usage when Claude Code output is captured. Setting `NO_COLOR=1` prevents color codes from being included.

### Stream output for real-time monitoring

```javascript
// Inherit stdout/stderr to see Claude Code output in real-time
const proc = spawn('claude', args, {
  stdio: ['ignore', 'inherit', 'inherit']
});
```

**Alternative:** Capture and process output

```javascript
const proc = spawn('claude', args, {
  stdio: ['ignore', 'pipe', 'pipe']
});

proc.stdout.on('data', (data) => {
  console.log(`[Claude] ${data}`);
});

proc.stderr.on('data', (data) => {
  console.error(`[Claude Error] ${data}`);
});
```

## Security considerations

### Webhook URL protection

- Store webhook URLs in environment variables, not in code
- Use `.gitignore` to exclude configuration files with secrets
- Consider using a secrets manager for production environments

### Permission skipping risks

`--dangerously-skip-permissions` bypasses all safety checks. Only use when:
- You trust the prompt source
- The working directory is isolated
- You're aware of the potential for destructive operations

### Sandboxing

For untrusted prompts, consider:
- Running Claude Code in a Docker container
- Using a separate virtual machine
- Implementing file system restrictions (chroot, namespaces)

## Debugging

### Enable verbose logging

```javascript
console.error(`[Hook] Working directory: ${cwd}`);
console.error(`[Hook] Prompt: ${prompt}`);
console.error(`[Hook] Exit code: ${code}`);
```

### Check Claude Code installation

```bash
which claude
claude --version
```

### Test webhook connectivity

```bash
curl -X POST http://localhost:18789/hooks/wake \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"text": "test"}'
```

### Monitor process exit

```javascript
proc.on('exit', (code, signal) => {
  console.log(`Exit: code=${code}, signal=${signal}`);
});
```

## Examples

### Example 1: Simple coding task

```bash
node claude-hook.js "Add a function to calculate fibonacci numbers"
```

### Example 2: Multi-file refactoring

```bash
node claude-hook.js --cwd ~/my-project "Refactor all components to use TypeScript strict mode"
```

### Example 3: Bug fix with context

```bash
node claude-hook.js --cwd ~/my-project "Fix the memory leak in UserService.ts. The issue is in the event listener cleanup."
```

### Example 4: Generate documentation

```bash
node claude-hook.js "Generate JSDoc comments for all exported functions in this project"
```

## Troubleshooting common issues

### Issue: "claude: command not found"

**Solution:** Install Claude Code CLI or add it to PATH

```bash
# Check if claude is installed
which claude

# If not, install via npm
npm install -g @anthropic/claude-code
```

### Issue: Webhook returns 404

**Solution:** Verify the webhook URL and token

```bash
# Test OpenClaw webhook
curl -X POST http://localhost:18789/hooks/wake \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"text": "test"}'

# Should return 200 OK
```

### Issue: Discord webhook returns 401 Unauthorized

**Solution:** Check webhook URL (contains token)

Discord webhook URLs include the token:
```
https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
```

No Authorization header needed.

### Issue: Notifications not received

**Checklist:**
1. Verify webhook URL is correct
2. Check network connectivity
3. Ensure process.exit waits for async notification
4. Check Discord/OpenClaw logs for errors

### Issue: Claude Code runs but doesn't complete

**Solution:** Check for:
- Infinite loops in generated code
- Missing permissions (try without `--dangerously-skip-permissions` once to see prompts)
- File system access issues (read-only directories)
