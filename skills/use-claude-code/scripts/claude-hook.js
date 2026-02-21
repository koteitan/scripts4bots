#!/usr/bin/env node

/**
 * Claude Code Hook Wrapper
 * 
 * Usage:
 *   node claude-hook.js "プロンプト内容"
 *   node claude-hook.js --cwd /path/to/project "プロンプト内容"
 *   node claude-hook.js -t THREAD_ID -u USER_ID "プロンプト内容"
 * 
 * Options:
 *   --cwd <path>       Working directory (default: current directory)
 *   -t, --thread <id>  Discord thread ID (default: env DISCORD_THREAD_ID or お天気アプリ)
 *   -u, --user <id>    Mention user ID (default: env DISCORD_MENTION_USER_ID or かってちゃん)
 * 
 * Environment variables:
 *   DISCORD_WEBHOOK_URL       Discord webhook URL
 *   DISCORD_THREAD_ID         Default thread ID
 *   DISCORD_MENTION_USER_ID   Default mention user ID
 * 
 * Features:
 * - Runs Claude Code with -p --dangerously-skip-permissions
 * - Notifies Discord webhook when completed
 * - Supports custom working directory
 * - Streams stdout/stderr in real-time
 */

const { spawn } = require('child_process');

const DEFAULT_WEBHOOK_URL = 'https://discord.com/api/webhooks/1474795628243456190/8blW0JU7arluvhAr6a9E5JbuufY_NFmVqye50jg48g75_oUpI0oLCeNppc9Wv5vXKfe3';
const DEFAULT_THREAD_ID = '1474736380868296774'; // お天気アプリスレッド
const DEFAULT_USER_ID = '1468615209609330819'; // かってちゃんの Discord ID

async function notifyOpenClaw(exitCode, elapsed, threadId, userId) {
  const success = exitCode === 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  
  const content = success 
    ? `<@${userId}> ✅ Claude Code完了 (${minutes}m ${seconds}s)` 
    : `<@${userId}> ❌ Claude Codeエラー (code: ${exitCode}, ${minutes}m ${seconds}s)`;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const url = `${webhookUrl}?thread_id=${threadId}`;
  const payload = { content };
  
  console.error(`[Hook] Discord Webhook URL: ${url}`);
  console.error(`[Hook] Payload: ${JSON.stringify(payload)}`);

  try {
    console.error('[Hook] Sending POST request to Discord...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.error(`[Hook] Response status: ${response.status}`);
    
    if (!response.ok) {
      const body = await response.text();
      console.error(`[Hook] Response body: ${body}`);
      console.error('[Hook] ❌ Discord webhook failed');
    } else {
      console.error('[Hook] ✅ Notified Discord successfully');
    }
  } catch (error) {
    console.error('[Hook] ❌ Exception:', error.message);
    console.error('[Hook] Stack trace:', error.stack);
  }
}

function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let cwd = process.cwd();
  let threadId = process.env.DISCORD_THREAD_ID || DEFAULT_THREAD_ID;
  let userId = process.env.DISCORD_MENTION_USER_ID || DEFAULT_USER_ID;
  let prompt = null;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--cwd' && i + 1 < args.length) {
      cwd = args[i + 1];
      i++;
    } else if ((arg === '-t' || arg === '--thread') && i + 1 < args.length) {
      threadId = args[i + 1];
      i++;
    } else if ((arg === '-u' || arg === '--user') && i + 1 < args.length) {
      userId = args[i + 1];
      i++;
    } else if (!prompt) {
      // First non-option argument is the prompt
      prompt = arg;
    }
  }
  
  if (!prompt) {
    console.error('Usage: claude-hook.js [OPTIONS] "プロンプト内容"');
    console.error('');
    console.error('Options:');
    console.error('  --cwd <path>       Working directory');
    console.error('  -t, --thread <id>  Discord thread ID');
    console.error('  -u, --user <id>    Mention user ID');
    process.exit(1);
  }
  
  console.error(`[Hook] Starting Claude Code...`);
  console.error(`[Hook] Working directory: ${cwd}`);
  console.error(`[Hook] Thread ID: ${threadId}`);
  console.error(`[Hook] Mention user ID: ${userId}`);
  console.error(`[Hook] Prompt: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`);
  
  const startTime = Date.now();
  
  const proc = spawn('claude', [
    '-p',
    '--dangerously-skip-permissions',
    prompt
  ], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'inherit', 'inherit'] // Stream stdout/stderr
  });
  
  proc.on('error', (error) => {
    console.error('[Hook] Failed to start Claude Code:', error.message);
    process.exit(1);
  });
  
  proc.on('exit', async (code) => {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`[Hook] Claude Code exited with code ${code} after ${elapsed.toFixed(1)}s`);
    console.error(`[Hook] Attempting to notify Discord...`);
    
    try {
      await notifyOpenClaw(code, elapsed, threadId, userId);
      console.error('[Hook] Notification complete, exiting...');
    } catch (error) {
      console.error('[Hook] Error during notification:', error);
    } finally {
      process.exit(code);
    }
  });
}

main();
