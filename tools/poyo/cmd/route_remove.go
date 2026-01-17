package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"poyo-cli/internal/config"
	"poyo-cli/internal/fsutil"
	"poyo-cli/internal/routes"
	"poyo-cli/internal/tui"

	"github.com/spf13/cobra"
)

var removeCmd = &cobra.Command{
	Use:   "remove <path>",
	Short: "Remove a route",
	Args:  cobra.ExactArgs(1),
	RunE:  runRemove,
}

func init() {
	routeCmd.AddCommand(removeCmd)
}

func runRemove(cmd *cobra.Command, args []string) error {
	urlPath := args[0]
	r, err := routes.Read(config.RoutesJSON)
	if err != nil {
		return err
	}

	idx := -1
	for i := range r {
		if strings.EqualFold(r[i].Path, urlPath) || strings.EqualFold(r[i].Path, "/"+strings.TrimPrefix(urlPath, "/")) {
			idx = i
			break
		}
	}

	if idx == -1 {
		return fmt.Errorf("route not found: %s", urlPath)
	}

	routeToRemove := r[idx]
	controller := routeToRemove.Controller
	
	deleteController := false
	if controller != "" {
		cPath := filepath.Join(config.ControllersDir, controller+".cs")
		if _, err := os.Stat(cPath); err == nil {
			q := fmt.Sprintf("Route uses custom controller '%s'. Delete this controller file?", controller)
			confirmed, err := tui.Confirm(q)
			if err != nil {
				return err
			}
			deleteController = confirmed
		}
	}

	deleteFilesQ := "Do you want to DELETE the physical files and folders related to this route?"
	deleteFiles, err := tui.Confirm(deleteFilesQ)
	if err != nil {
		return err
	}

	// Logic Execution
	if deleteController {
		cPath := filepath.Join(config.ControllersDir, controller+".cs")
		os.Remove(cPath)
		fmt.Printf("[DELETED] Controller: %s.cs\n", controller)
	}

	if deleteFiles {
		reactPath := filepath.Join(config.ClientDir, routeToRemove.Files.React)
		viewPath := filepath.Join(config.ServerDir, routeToRemove.Files.View)

		if _, err := os.Stat(reactPath); err == nil {
			os.Remove(reactPath)
			fmt.Printf("[DELETED] React Page: %s\n", routeToRemove.Files.React)
			fsutil.DeleteEmptyParents(reactPath, config.ClientDir)
		}

		if _, err := os.Stat(viewPath); err == nil {
			os.Remove(viewPath)
			fmt.Printf("[DELETED] MVC View: %s\n", routeToRemove.Files.View)
			fsutil.DeleteEmptyParents(viewPath, config.ServerDir)
		}
	}

	// Remove from list
	r = append(r[:idx], r[idx+1:]...)
	if err := routes.Write(config.RoutesJSON, r); err != nil {
		return err
	}

	fmt.Printf("[REMOVED] Route '%s' removed from routes.json\n", routeToRemove.Path)

	if !deleteFiles {
		fmt.Println("[INFO] Orphaned files (not deleted):")
		fmt.Printf("  - poyo.client/%s\n", routeToRemove.Files.React)
		fmt.Printf("  - Poyo.Server/%s\n", routeToRemove.Files.View)
	}

	return nil
}
