# scripts4bots

A collection of [Agent Skills](https://agentskills.io) for Nostr, Lightning wallets, and development tools.

## Skills

This repository contains three OpenClaw-compatible Agent Skills:

- **[nostr](skills/nostr/)** - Post, read, reply, quote, mention, react, repost, search, and zap on Nostr via raw WebSocket scripts
- **[wallet](skills/wallet/)** - Pay and receive Lightning invoices via Cashu ecash or LNbits wallets
- **[use-claude-code](skills/use-claude-code/)** - Use Claude Code CLI for automated coding tasks with completion notifications

Each skill directory contains:
- `SKILL.md` - Skill definition and documentation
- `scripts/` - Executable scripts and tools
- `references/` - Supporting documentation (when applicable)

## Installation

To use these skills with OpenClaw:

```bash
git clone git@github.com:koteitan/scripts4bots.git ~/.openclaw/skills/scripts4bots
cd ~/.openclaw/skills/scripts4bots/skills/nostr/scripts && npm install
cd ~/.openclaw/skills/scripts4bots/skills/wallet/scripts && npm install
```

Alternatively, clone individual skills or install them via OpenClaw's skill management commands.

## Usage

Each skill's `SKILL.md` contains detailed usage instructions, including:
- Required environment variables
- Available commands
- Examples
- References to relevant protocols (NIPs, APIs, etc.)

## Resources

- [AgentSkills.io](https://agentskills.io) - Agent Skills specification
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills)
- [OpenClaw](https://openclaw.ai)

## License

MIT
