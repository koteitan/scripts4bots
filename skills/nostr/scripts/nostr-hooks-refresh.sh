#!/bin/bash
set -euo pipefail

echo "[nostr-hooks-refresh] Stopping existing hook processes..."
pkill -f "check-replies.mjs --hook" || true
pkill -f "nostr-search.mjs --hook" || true
echo "[nostr-hooks-refresh] Stopped."

sleep 1

# --- Parse .env files ---
KATTE_ENV="$HOME/.openclaw/workspace/.env"
MAGE_ENV="$HOME/.openclaw/workspace-mage/.env"

_get_env() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d'=' -f2- || true; }

# katte vars
KATTE_HOOK_URL=$(_get_env "$KATTE_ENV" "DISCORD_HOOK_FOR_NOSTR_REPLY")
KATTE_SEARCH_HOOK=$(_get_env "$KATTE_ENV" "DISCORD_WEBHOOK_FOR_NOSTR_SEARCH")

# mage vars
MAGE_HOOK_URL=$(_get_env "$MAGE_ENV" "DISCORD_HOOK_FOR_NOSTR_REPLY")
MAGE_SEARCH_HOOK=$(_get_env "$MAGE_ENV" "DISCORD_WEBHOOK_FOR_NOSTR_SEARCH")

# --- katte ---
KATTE_DIR="$HOME/.openclaw/workspace/skills/nostr/scripts"

echo "[nostr-hooks-refresh] Starting katte reply hook..."
echo "[nostr-hooks-refresh]   HOOK_URL set (length: ${#KATTE_HOOK_URL})"
cd "$KATTE_DIR"
DISCORD_HOOK_FOR_NOSTR_REPLY="$KATTE_HOOK_URL" NOSTR_NSEC_FILE="$HOME/katte/nostr/nsec" setsid nohup node check-replies.mjs --hook > /tmp/katte-hook.log 2>&1 &
echo "[nostr-hooks-refresh] katte reply hook started (PID $!)."

echo "[nostr-hooks-refresh] Starting katte search hook (かってちゃん)..."
echo "[nostr-hooks-refresh]   SEARCH_HOOK / DISCORD_WEBHOOK_FOR_NOSTR_SEARCH set (length: ${#KATTE_SEARCH_HOOK})"
cd "$KATTE_DIR"
SEARCH_HOOK="$KATTE_SEARCH_HOOK" DISCORD_WEBHOOK_FOR_NOSTR_SEARCH="$KATTE_SEARCH_HOOK" setsid nohup node nostr-search.mjs --hook "かってちゃん" > /tmp/katte-search.log 2>&1 &
echo "[nostr-hooks-refresh] katte search hook started (PID $!)."

# --- mage ---
MAGE_DIR="$HOME/.openclaw/workspace-mage/skills/nostr/scripts"

echo "[nostr-hooks-refresh] Starting mage reply hook..."
echo "[nostr-hooks-refresh]   HOOK_URL set (length: ${#MAGE_HOOK_URL})"
cd "$MAGE_DIR"
DISCORD_HOOK_FOR_NOSTR_REPLY="$MAGE_HOOK_URL" setsid nohup node check-replies.mjs --hook > /tmp/mage-hook.log 2>&1 &
echo "[nostr-hooks-refresh] mage reply hook started (PID $!)."

echo "[nostr-hooks-refresh] Starting mage search hook (すしめいじ)..."
echo "[nostr-hooks-refresh]   SEARCH_HOOK / DISCORD_WEBHOOK_FOR_NOSTR_SEARCH set (length: ${#MAGE_SEARCH_HOOK})"
cd "$MAGE_DIR"
SEARCH_HOOK="$MAGE_SEARCH_HOOK" DISCORD_WEBHOOK_FOR_NOSTR_SEARCH="$MAGE_SEARCH_HOOK" setsid nohup node nostr-search.mjs --hook "すしめいじ" > /tmp/mage-search.log 2>&1 &
echo "[nostr-hooks-refresh] mage search hook 1 started (PID $!)."

echo "[nostr-hooks-refresh] Starting mage search hook (めいちゃん)..."
cd "$MAGE_DIR"
SEARCH_HOOK="$MAGE_SEARCH_HOOK" DISCORD_WEBHOOK_FOR_NOSTR_SEARCH="$MAGE_SEARCH_HOOK" setsid nohup node nostr-search.mjs --hook "めいちゃん" > /tmp/mage-search2.log 2>&1 &
echo "[nostr-hooks-refresh] mage search hook 2 started (PID $!)."

echo "[nostr-hooks-refresh] All hooks launched."
