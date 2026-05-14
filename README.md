# pi-plexus

A [pi](https://github.com/earendil-works/pi-mono) extension that adds [Plexus](https://github.com/mcowger/plexus) as a provider, dynamically discovering models from your Plexus instance.

## Requirements

- pi `0.74.0` or later
- A running Plexus instance with a valid API key

## Installation

### Via npm (recommended)

```bash
pi install npm:@mcowger/pi-plexus
```

### Via git

```bash
pi install git:github.com/mcowger/pi-plexus
```

## Configuration

Once installed, run the login command inside pi:

```
/plexus login
```

You will be prompted for:
1. **Base URL** — the root URL of your Plexus instance, e.g. `https://plexus.example.com` (no `/v1` suffix needed)
2. **API key** — your Plexus API key

Credentials are stored in `~/.pi/agent/auth.json` (API key, managed by pi) and `~/.pi/agent/extensions/plexus/config.json` (base URL).

### Environment variables

As an alternative to `/plexus login`, you can set environment variables before starting pi:

```bash
export PLEXUS_BASE_URL=https://plexus.example.com
export PLEXUS_API_KEY=sk-...
```

## Commands

| Command | Description |
|---|---|
| `/plexus login` | Configure base URL and API key |
| `/plexus refresh` | Re-fetch the model list from your Plexus instance and update the local cache |

## How it works

On startup, the extension loads a cached model list from `~/.pi/agent/extensions/plexus/plexus-models-cache.json` so models are available immediately. On each session start it attempts a live refresh from `/v1/models` to pick up any new or removed models.

Models are registered under the `plexus` provider and appear in `/model` alongside all other configured providers.

## Troubleshooting

The extension writes a debug log to `~/.pi/agent/extensions/plexus/plexus.log`. If models are missing or requests are failing, check that file first:

```bash
cat ~/.pi/agent/extensions/plexus/plexus.log
```
