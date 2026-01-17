package scaffold

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func EnsureController(path, name, action, view string) (string, error) {
	if !strings.HasSuffix(name, "Controller") {
		name += "Controller"
	}

	file := filepath.Join(path, name+".cs")

	// Create if not exists
	if _, err := os.Stat(file); err != nil {
		content := ControllerTemplate(name, action, view)
		return name, os.WriteFile(file, []byte(content), 0644)
	}

	// Read existing
	data, err := os.ReadFile(file)
	if err != nil {
		return "", err
	}
	content := string(data)

	// Check if action exists
	re := regexp.MustCompile(`(?i)IActionResult\s+` + regexp.QuoteMeta(action) + `\s*\(`)
	if re.MatchString(content) {
		return "", errors.New("action already exists")
	}

	// Inject action before last brace
	idx := strings.LastIndex(content, "}")
	if idx == -1 {
		return "", errors.New("invalid controller file")
	}

	out := content[:idx] + ActionTemplate(action, view) + content[idx:]
	return name, os.WriteFile(file, []byte(out), 0644)
}
