# Poyo CLI

A general purpose CLI tool for managing Poyo projects (routes, scaffolding, etc.).

> **Note:** This tool replaces the legacy `scripts/manage-routes.js`.

## 🚀 Usage (No Go Installed)

You do **NOT** need Go installed to use this tool. Pre-built binaries are available in `tools/poyo/bin/`.

### 1. Run the binary for your platform

**Windows:**
```powershell
.\tools\poyo\bin\poyo-windows-amd64.exe route sync
```

**Mac (Apple Silicon):**
```bash
./tools/poyo/bin/poyo-darwin-arm64 route sync
```

**Linux:**
```bash
./tools/poyo/bin/poyo-linux-amd64 route sync
```

### 2. (Optional) Create a shortcut

You can make a helper script in your project root (e.g. `poyo` or `poyo.bat`) that calls the correct binary for your team's OS.

## ✨ Features

- **Route Management**: Add, update, remove, and sync routes.
- **Scaffolding**: Auto-generates React pages, MVC Views, and Controllers.
- **Interactive**: Uses a text-based UI (TUI) for complex operations like syncing.

### Commands

- `poyo route add <path>`
  - Flags: `--public`, `--guest`, `--flat`, `--no-view`, `--controller`, `--action`
  - Example: `poyo route add /Admin/Users --guest`
- `poyo route update <path>`
- `poyo route remove <path>`
- `poyo route sync`
  - Interactive tool to fix discrepancies between `routes.json` and files.

## 🛠️ Development (For Contributors)

If you want to modify the CLI source code:

1. Install Go 1.25+
2. `cd tools/poyo`
3. `go mod tidy`
4. `go run main.go ...`

### Build Release

To rebuild binaries for all platforms, run the following commands in your terminal:

**Bash (Linux / macOS):**
```bash
# In tools/poyo/ directory
GOOS=windows GOARCH=amd64 go build -o bin/poyo-windows-amd64.exe
GOOS=linux   GOARCH=amd64 go build -o bin/poyo-linux-amd64
GOOS=darwin  GOARCH=arm64 go build -o bin/poyo-darwin-arm64
```

**PowerShell (Windows):**
```powershell
# In tools/poyo/ directory
$env:GOOS="windows"; $env:GOARCH="amd64"; go build -o bin/poyo-windows-amd64.exe
$env:GOOS="linux";   $env:GOARCH="amd64"; go build -o bin/poyo-linux-amd64
$env:GOOS="darwin";  $env:GOARCH="arm64"; go build -o bin/poyo-darwin-arm64
```

