package fsutil

import (
	"os"
	"path/filepath"
	"strings"
)

// FindFiles recursively looks for files in dir that satisfy the predicate.
// Returns a list of paths relative to rootDir.
func FindFiles(dir string, predicate func(string) bool, rootDir string) ([]string, error) {
	var fileList []string

	if _, err := os.Stat(dir); err != nil {
		// Directory doesn't exist, return empty list
		return fileList, nil
	}

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if predicate(path) {
			rel, err := filepath.Rel(rootDir, path)
			if err != nil {
				return err
			}
			fileList = append(fileList, filepath.ToSlash(rel))
		}
		return nil
	})

	return fileList, err
}

// DeleteEmptyParents deletes empty parent directories of filePath up to rootDir.
func DeleteEmptyParents(filePath string, rootDir string) {
	dir := filepath.Dir(filePath)
	absRootDir, _ := filepath.Abs(rootDir)
	absDir, _ := filepath.Abs(dir)

	for absDir != absRootDir && strings.HasPrefix(absDir, absRootDir) {
		entries, err := os.ReadDir(absDir)
		if err != nil {
			break
		}
		if len(entries) == 0 {
			os.Remove(absDir)
			absDir = filepath.Dir(absDir)
		} else {
			break
		}
	}
}
