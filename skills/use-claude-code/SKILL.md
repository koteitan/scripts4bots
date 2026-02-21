---
name: use-claude-code
description: Use Claude Code CLI for automated coding tasks with completion notifications. Handles non-interactive mode, permission skipping, and webhook notifications to Discord/OpenClaw.
metadata: { "openclaw": { "requires": { "bins": ["claude", "node"] }, "emoji": "🤖" } }
---

# Use Claude Code

This skill teaches you how to use Claude Code CLI from OpenClaw in fully automated mode with completion notifications.

## When to use this skill

Use this skill when:
- You need to run Claude Code CLI for coding tasks from OpenClaw
- You want automated, non-interactive execution (no approval prompts)
- You need completion notifications via Discord webhook or OpenClaw
- You're working on multi-step development workflows

## Basic usage

### Direct command (manual notification)

```bash
# Non-interactive mode with all permissions skipped
claude -p --dangerously-skip-permissions "プロンプト"

# With color output disabled (saves API tokens)
NO_COLOR=1 claude -p --dangerously-skip-permissions "プロンプト"
```

**Options:**
- `-p` = Non-interactive mode (no output until completion)
- `--dangerously-skip-permissions` = Skip all approval prompts
- `NO_COLOR=1` = Disable ANSI color codes (reduces API costs)

### Automated wrapper script (with notifications)

Use the bundled `claude-hook.js` script for automatic completion notifications:

```bash
# Basic usage (uses current directory)
node {baseDir}/scripts/claude-hook.js "プロンプト内容"

# Specify working directory
node {baseDir}/scripts/claude-hook.js --cwd /path/to/project "プロンプト内容"
```

**Features:**
- ✅ Runs Claude Code with `-p --dangerously-skip-permissions`
- ✅ Automatically notifies Discord webhook when completed
- ✅ Streams stdout/stderr in real-time
- ✅ Reports exit code and elapsed time

**Environment variables:**
- `DISCORD_WEBHOOK_URL` - Discord webhook URL (default: hardcoded)
- `DISCORD_THREAD_ID` - Discord thread ID for notifications (default: hardcoded)

## Common mistakes to avoid

❌ **Using interactive mode from OpenClaw**
```bash
# This will hang waiting for approval prompts
claude "プロンプト"
```

✅ **Always use non-interactive mode**
```bash
claude -p --dangerously-skip-permissions "プロンプト"
```

---

❌ **Forgetting to disable color output**
- ANSI color codes increase API token usage

✅ **Set NO_COLOR=1 environment variable**
```bash
NO_COLOR=1 claude -p --dangerously-skip-permissions "プロンプト"
```

---

❌ **Pushing without local build test**
- Results in GitHub Actions build errors

✅ **Test build locally before pushing**
```bash
npm run build  # or appropriate build command
git push
```

## Workflow integration

### 1. Run coding task

```bash
node {baseDir}/scripts/claude-hook.js --cwd ~/project "実装内容"
```

### 2. Local build test (required!)

```bash
cd ~/project
npm run build  # or your build command
```

### 3. Commit and push

```bash
git add -A
git commit -m "コミットメッセージ"
git push
```

### 4. Monitor deployment (if using GitHub Actions)

```bash
gh run list --repo user/repo --limit 3
gh run view <run-id> --repo user/repo
```

## Advanced: Custom notification integration

See [references/README.md](references/README.md) for:
- Custom webhook integration patterns
- OpenClaw `/hooks/wake` endpoint usage
- Error handling and retry logic
- Alternative notification channels

## Troubleshooting

**Problem:** Claude Code hangs waiting for input
**Solution:** Always use `-p --dangerously-skip-permissions`

**Problem:** Stop hook doesn't fire with `-p` mode
**Solution:** Use `claude-hook.js` wrapper script (spawns Claude and notifies on exit)

**Problem:** High API costs from color output
**Solution:** Set `NO_COLOR=1` environment variable

## Notes

- Claude Code's Stop hook does NOT fire when using `-p --dangerously-skip-permissions`
- The wrapper script works around this by spawning Claude and watching the exit event
- Notifications are sent to Discord webhook (can be customized via environment variables)
