package cmd

import (
	"fmt"
	"strings"

	"poyo-cli/internal/config"
	"poyo-cli/internal/routes"
	"poyo-cli/internal/scaffold"

	"github.com/spf13/cobra"
)

var (
	addPublic     bool
	addGuest      bool
	addFlat       bool
	addController string
	addAction     string
	addNoView     bool
)

var addCmd = &cobra.Command{
	Use:   "add <path>",
	Short: "Add a new route",
	Args:  cobra.ExactArgs(1),
	RunE:  runAdd,
}

func init() {
	addCmd.Flags().BoolVarP(&addPublic, "public", "p", false, "Mark route as public")
	addCmd.Flags().BoolVarP(&addGuest, "guest", "g", false, "Mark route as guest only")
	addCmd.Flags().BoolVarP(&addFlat, "flat", "f", false, "Use flat file structure")
	addCmd.Flags().StringVarP(&addController, "controller", "c", "", "Controller name")
	addCmd.Flags().StringVarP(&addAction, "action", "a", "", "Action name")
	addCmd.Flags().BoolVar(&addNoView, "no-view", false, "Skip MVC View generation")

	routeCmd.AddCommand(addCmd)
}

func runAdd(cmd *cobra.Command, args []string) error {
	urlPath := args[0]

	// Guard: Detect if shell transformed /Path to C:/Program Files/Git/Path
	if strings.Contains(urlPath, ":") {
		return fmt.Errorf("invalid path detected '%s'.\n\nIf you are using Git Bash, it automatically converts paths matching root directories.\nPlease use a double slash to escape it: //User/Profile\nOr use a relative path: User/Profile", urlPath)
	}

	// Normalize path: /foo/bar -> /Foo/Bar (PascalCase)
	parts := strings.Split(urlPath, "/")
	var pascalParts []string
	for _, p := range parts {
		if p == "" {
			continue
		}
		pascalParts = append(pascalParts, strings.Title(strings.ToLower(p)))
	}
	pascalPath := "/" + strings.Join(pascalParts, "/")
	name := strings.Join(pascalParts, "/")

	// Check if exists
	r, err := routes.Read(config.RoutesJSON)
	if err != nil {
		return err
	}

	for _, rt := range r {
		if strings.EqualFold(rt.Path, pascalPath) {
			return fmt.Errorf("route already exists: %s", pascalPath)
		}
	}

	files := routes.ResolvePaths(name, addFlat)

	// Controller Logic
	var controllerInfo *scaffold.ControllerInfo
	if addController != "" {
		if addAction == "" {
			return fmt.Errorf("if --controller is specified, --action must also be specified")
		}
		controllerInfo = &scaffold.ControllerInfo{
			Name:   addController,
			Action: addAction,
		}
	}

	// Create Route Struct
	newRoute := routes.Route{
		Path:        pascalPath,
		Name:        name,
		Files:       files,
		IsPublic:    addPublic,
		IsGuestOnly: addGuest,
		SEO: map[string]string{
			"title":       name,
			"description": fmt.Sprintf("Page for %s", name),
		},
	}

	if controllerInfo != nil {
		newRoute.Controller = controllerInfo.Name
		newRoute.Action = controllerInfo.Action
		// We'll update controller name properly after ensuring it
	}

	// Scaffold Files first? Or update JSON first?
	// Node script: scaffold then write? No, logic was mixed.
	// But scaffold logic for controller returns the "Safe" Controller Name.
	
	if controllerInfo != nil {
		safeName, err := scaffold.EnsureController(
			config.ControllersDir,
			controllerInfo.Name,
			controllerInfo.Action,
			files.View,
		)
		if err != nil && err.Error() != "action already exists" {
			return err
		}
		// Update with ensuring "Controller" suffix
		newRoute.Controller = strings.TrimSuffix(safeName, ".cs") 
		// Actually EnsureController returns name with suffix if file created/found? 
		// Wait, EnsureController returns `name` (argument) or updated.
		// My implementation of EnsureController returns just `name` or `name+"Controller"`.
		// Let's verify EnsureController returns.
		newRoute.Controller = safeName
	}

	r = append(r, newRoute)
	if err := routes.Write(config.RoutesJSON, r); err != nil {
		return err
	}
	
	opt := scaffold.ScaffoldOptions{NoView: addNoView}
	// We pass nil for controller here because we arguably already handled it above for the Route struct?
	// But ScaffoldRouteFiles ALSO calls EnsureController?
	// My ScaffoldRouteFiles calls EnsureController if controllerInfo is passed.
	// So I should pass it there too?
	// If I pass it there, EnsureController runs twice.
	// EnsureController is idempotent (checks if action exists).
	// So specific logic:
	// If I call ScaffoldRouteFiles, I should let it handle the file creation.
	// BUT I need the final controller name for the Route struct BEFORE writing JSON if I want to be 100% correct?
	// Or I can update JSON after.
	// Let's rely on ScaffoldRouteFiles to handle the controller file.
	// But I need to know the SafeName for JSON.
	
	// Refined approach matches Node logic better:
	// Node script:
	// 1. Prepare Route object (with preliminary controller info)
	// 2. If controller, ensure it AND update object.controller
	// 3. routes.push(); writeRoutes();
	// 4. scaffoldRouteFiles();
	
	// My implementation:
	// I'll skip passing controller to ScaffoldRouteFiles if I do it manually here.
	// OR I remove the manual call here and do it via ScaffoldRouteFiles?
	// The problem is updating the JSON with the correct controller name (e.g. adding "Controller" suffix).
	// I will keep the explicit EnsureController call here to get the name, and pass nil to ScaffoldRouteFiles for controller to avoid double log/work.
	
	if err := scaffold.ScaffoldRouteFiles(name, files, opt, nil); err != nil {
		return err
	}
	
	fmt.Printf("[SUCCESS] Added route %s\n", pascalPath)
	return nil
}
