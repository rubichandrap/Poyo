package cmd

import (
	"github.com/spf13/cobra"
)

var routeCmd = &cobra.Command{
	Use:   "route",
	Short: "Manage routes.json and scaffold files",
}

func init() {
	RootCmd.AddCommand(routeCmd)
}
