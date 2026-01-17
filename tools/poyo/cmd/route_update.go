package cmd

import (
	"fmt"
	"strings"

	"poyo-cli/internal/config"
	"poyo-cli/internal/routes"

	"github.com/spf13/cobra"
)

var (
	updatePublic     string
	updateGuest      string
)

var updateCmd = &cobra.Command{
	Use:   "update <path>",
	Short: "Update existing route properties",
	Args:  cobra.ExactArgs(1),
	RunE:  runUpdate,
}

func init() {
	updateCmd.Flags().StringVar(&updatePublic, "public", "", "Set public status (true/false)")
	updateCmd.Flags().StringVar(&updateGuest, "guest", "", "Set guest only status (true/false)")
	
	routeCmd.AddCommand(updateCmd)
}

func runUpdate(cmd *cobra.Command, args []string) error {
	urlPath := args[0]
	r, err := routes.Read(config.RoutesJSON)
	if err != nil {
		return err
	}

	var target *routes.Route
	for i := range r {
		if strings.EqualFold(r[i].Path, urlPath) || strings.EqualFold(r[i].Path, "/"+strings.TrimPrefix(urlPath, "/")) {
			target = &r[i]
			break
		}
	}

	if target == nil {
		return fmt.Errorf("route not found: %s", urlPath)
	}

	updated := false

	if updatePublic != "" {
		val := strings.ToLower(updatePublic) == "true"
		if target.IsPublic != val {
			target.IsPublic = val
			fmt.Printf("[UPDATE] Set isPublic to %v\n", val)
			updated = true
		}
	}

	if updateGuest != "" {
		val := strings.ToLower(updateGuest) == "true"
		if target.IsGuestOnly != val {
			target.IsGuestOnly = val
			fmt.Printf("[UPDATE] Set isGuestOnly to %v\n", val)
			updated = true
		}
	}

	if updated {
		if err := routes.Write(config.RoutesJSON, r); err != nil {
			return err
		}
	} else {
		fmt.Println("[INFO] No changes made.")
	}

	return nil
}
