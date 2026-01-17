package config

import (
	"os"
	"path/filepath"
)

var (
	// Assumes running from poyo-cli directory or compiled binary in tools/poyo/bin
	// If running with 'go run', we are in poyo-cli.
	// We might need better logic later, but strictly following the brief for now.
	// RootDir is now calculated dynamically
	RootDir        = findProjectRoot()
	ClientDir      = findDirWithSuffix(RootDir, ".client")
	ServerDir      = findDirWithSuffix(RootDir, ".Server")
	ControllersDir = filepath.Join(ServerDir, "Controllers")
	RoutesJSON     = filepath.Join(RootDir, "routes.json")
)

func findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}

	for {
		// Use routes.json as the stable anchor
		if _, err := os.Stat(filepath.Join(dir, "routes.json")); err == nil {
			return dir
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	
	d, _ := os.Getwd()
	return d
}

// findDirWithSuffix looks for a subdirectory ending with suffix (e.g. ".client")
// If not found, it falls back to a default "poyo" + suffix for safety, though it likely won't exist.
func findDirWithSuffix(root, suffix string) string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return filepath.Join(root, "poyo"+suffix)
	}
	for _, e := range entries {
		if e.IsDir() && (len(e.Name()) >= len(suffix)) {
            // Case insensitive check. Windows is usually case insensitive, Linux not.
            // But the convention is likely consistent case.
			if e.Name()[len(e.Name())-len(suffix):] == suffix {
				return filepath.Join(root, e.Name())
			}
		}
	}
	// Fallback
	return filepath.Join(root, "poyo"+suffix)
}
