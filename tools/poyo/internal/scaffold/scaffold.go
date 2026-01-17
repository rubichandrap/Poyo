package scaffold

import (
	"fmt"
	"os"
	"path/filepath"
	"poyo-cli/internal/config"
	"poyo-cli/internal/routes"
)

type ScaffoldOptions struct {
	NoView bool
}

type ControllerInfo struct {
	Name   string
	Action string
}

func ScaffoldRouteFiles(name string, files routes.Files, options ScaffoldOptions, controller *ControllerInfo) error {
	pageFullPath := filepath.Join(config.ClientDir, files.React)
	viewFullPath := filepath.Join(config.ServerDir, files.View)

	// 1. React Page
	if _, err := os.Stat(pageFullPath); os.IsNotExist(err) {
		if err := os.MkdirAll(filepath.Dir(pageFullPath), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(pageFullPath, []byte(ReactPage(name)), 0644); err != nil {
			return err
		}
		fmt.Printf("[CREATED] React Page: %s\n", files.React)
	} else {
		fmt.Printf("[EXISTS] React Page: %s\n", files.React)
	}

	// 2. MVC View
	if !options.NoView {
		if _, err := os.Stat(viewFullPath); os.IsNotExist(err) {
			if err := os.MkdirAll(filepath.Dir(viewFullPath), 0755); err != nil {
				return err
			}
			if err := os.WriteFile(viewFullPath, []byte(MVCView(name)), 0644); err != nil {
				return err
			}
			fmt.Printf("[CREATED] MVC View: %s\n", files.View)
		} else {
			fmt.Printf("[EXISTS] MVC View: %s\n", files.View)
		}
	} else {
		fmt.Println("[SKIP] MVC View generation skipped (--no-view)")
	}

	// 3. Controller Injection
	if controller != nil {
		_, err := EnsureController(
			config.ControllersDir,
			controller.Name,
			controller.Action,
			files.View,
		)
		if err != nil {
			// If action exists, we just log it, not fail everything
			if err.Error() == "action already exists" {
				fmt.Printf("[INFO] Action '%s' already exists in %sController\n", controller.Action, controller.Name)
			} else {
				return err
			}
		} else {
			fmt.Printf("[UPDATED] Controller: %sController.cs (Injected action '%s')\n", controller.Name, controller.Action)
		}
	}

	return nil
}
