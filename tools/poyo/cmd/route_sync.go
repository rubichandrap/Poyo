package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"poyo-cli/internal/config"
	"poyo-cli/internal/fsutil"
	"poyo-cli/internal/routes"
	"poyo-cli/internal/scaffold"
	"poyo-cli/internal/tui"

	"github.com/spf13/cobra"
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Verify consistency between routes.json and file system",
	RunE:  runSync,
}

func init() {
	routeCmd.AddCommand(syncCmd)
}

func runSync(cmd *cobra.Command, args []string) error {
	fmt.Println("Checking route consistency...")
	r, err := routes.Read(config.RoutesJSON)
	if err != nil {
		return err
	}

	// 1. Forward Sync: Check missing files
	type MissingRoute struct {
		Route        routes.Route
		MissingFiles []string
	}
	var missingRoutes []MissingRoute

	for _, rt := range r {
		reactFullPath := filepath.Join(config.ClientDir, rt.Files.React)
		viewFullPath := filepath.Join(config.ServerDir, rt.Files.View)
		missing := []string{}

		if _, err := os.Stat(reactFullPath); os.IsNotExist(err) {
			missing = append(missing, "React Page")
		}
		if _, err := os.Stat(viewFullPath); os.IsNotExist(err) {
			missing = append(missing, "MVC View")
		}

		if len(missing) > 0 {
			missingRoutes = append(missingRoutes, MissingRoute{Route: rt, MissingFiles: missing})
		}
	}

	// 2. Reverse Sync: Check untracked files
	// React Pages
	reactPages, _ := fsutil.FindFiles(
		filepath.Join(config.ClientDir, "src", "pages"),
		func(path string) bool { return strings.HasSuffix(path, ".page.tsx") },
		config.ClientDir,
	)
	// Views
	viewPages, _ := fsutil.FindFiles(
		filepath.Join(config.ServerDir, "Views"),
		func(path string) bool {
			name := filepath.Base(path)
			return strings.HasSuffix(path, ".cshtml") && !strings.Contains(path, "Shared") && !strings.HasPrefix(name, "_")
		},
		config.ServerDir,
	)

	// Comparison Sets
	trackedReact := make(map[string]bool)
	trackedView := make(map[string]bool)
	for _, rt := range r {
		trackedReact[filepath.ToSlash(rt.Files.React)] = true
		trackedView[filepath.ToSlash(rt.Files.View)] = true
	}

	var untrackedReact []string
	for _, f := range reactPages {
		if !trackedReact[filepath.ToSlash(f)] {
			untrackedReact = append(untrackedReact, f)
		}
	}
	var untrackedViews []string
	for _, f := range viewPages {
		if !trackedView[filepath.ToSlash(f)] {
			untrackedViews = append(untrackedViews, f)
		}
	}

	hasIssues := len(missingRoutes) > 0 || len(untrackedReact) > 0 || len(untrackedViews) > 0

	if !hasIssues {
		fmt.Printf("[OK] All %d routes indicate valid files, and no untracked files found.\n", len(r))
		return nil
	}

	fmt.Println("[WARN] Discrepancies found:")
	if len(missingRoutes) > 0 {
		fmt.Printf("  - %d routes have missing files.\n", len(missingRoutes))
	}
	if len(untrackedReact) > 0 {
		fmt.Printf("  - %d untracked React pages found.\n", len(untrackedReact))
	}
	if len(untrackedViews) > 0 {
		fmt.Printf("  - %d untracked MVC views found.\n", len(untrackedViews))
	}
	fmt.Println("")

	// Choices
	choices := []tui.Choice{}
	if len(missingRoutes) > 0 {
		choices = append(choices, tui.Choice{Name: "Rescaffold: Re-create missing files for broken routes", Value: "rescaffold"})
		choices = append(choices, tui.Choice{Name: "Prune: Remove broken routes from routes.json", Value: "prune"})
	}
	if len(untrackedReact) > 0 || len(untrackedViews) > 0 {
		choices = append(choices, tui.Choice{Name: "Add: Add untracked files to routes.json", Value: "add_untracked"})
		choices = append(choices, tui.Choice{Name: "Delete: Delete untracked files from disk", Value: "delete_untracked"})
	}
	choices = append(choices, tui.Choice{Name: "Ignore: Do nothing for now", Value: "ignore"})

	choice, err := tui.Select("How should we resolve these discrepancies?", choices)
	if err != nil {
		return err
	}

	switch choice {
	case "rescaffold":
		fmt.Println("\nRe-scaffolding files...")
		for _, m := range missingRoutes {
			var ctrlInfo *scaffold.ControllerInfo
			if m.Route.Controller != "" {
				ctrlInfo = &scaffold.ControllerInfo{Name: m.Route.Controller, Action: m.Route.Action}
			}
			scaffold.ScaffoldRouteFiles(
				m.Route.Name,
				m.Route.Files,
				scaffold.ScaffoldOptions{NoView: false},
				ctrlInfo,
			)
		}
		fmt.Println("[DONE] All files restored.")

	case "prune":
		fmt.Println("\nPruning routes from JSON...")
		toRemove := make(map[string]bool)
		for _, m := range missingRoutes {
			toRemove[m.Route.Path] = true
		}
		var newRoutes []routes.Route
		for _, rt := range r {
			if !toRemove[rt.Path] {
				newRoutes = append(newRoutes, rt)
			}
		}
		if err := routes.Write(config.RoutesJSON, newRoutes); err != nil {
			return err
		}
		fmt.Printf("[DONE] Removed %d routes from routes.json.\n", len(missingRoutes))

	case "add_untracked":
		fmt.Println("\nAnalyzing untracked files...")
		var newRoutesToAdd []routes.Route
		
		for _, reactFile := range untrackedReact {
			// Logic to infer route path
			rel := strings.TrimPrefix(reactFile, "src/pages/")
			var name string
			if strings.HasSuffix(rel, "/index.page.tsx") {
				name = strings.TrimSuffix(rel, "/index.page.tsx")
			} else {
				name = strings.TrimSuffix(rel, ".page.tsx")
			}
			
			// PascalCase conversion logic?
			// Assuming file structure usually matches desirable route name, just ensure capitalization
			// For CLI v1, just taking it as is might be fine, or capitalising first letters.
			// Node script does capitalisation.
			parts := strings.Split(name, "/")
			for i, p := range parts {
				if len(p) > 0 {
					parts[i] = strings.Title(strings.ToLower(p))
				}
			}
			name = strings.Join(parts, "/")
			pathStr := "/" + name

			// View guess
			viewCandidate := "Views/" + name + "/Index.cshtml"
			viewCandidateFlat := "Views/" + name + ".cshtml"
			
			finalView := viewCandidate
			// Check if we have untracked view match
			for _, v := range untrackedViews {
				if filepath.ToSlash(v) == viewCandidate {
					finalView = viewCandidate
					break
				}
				if filepath.ToSlash(v) == viewCandidateFlat {
					finalView = viewCandidateFlat
					break
				}
			}


			newRoutesToAdd = append(newRoutesToAdd, routes.Route{
				Path: pathStr,
				Name: name,
				Files: routes.Files{React: reactFile, View: finalView},
				SEO: map[string]string{"title": name, "description": "Page for " + name},
			})
		}

		if len(newRoutesToAdd) == 0 && len(untrackedViews) > 0 {
			fmt.Println("[INFO] Found untracked Views but no corresponding React pages. Skipping automatic addition.")
		} else if len(newRoutesToAdd) > 0 {
			fmt.Printf("Probe found %d potential new routes.\n", len(newRoutesToAdd))
			
			// Checkbox selection
			checkboxChoices := []tui.Choice{}
			for i, nr := range newRoutesToAdd {
				checkboxChoices = append(checkboxChoices, tui.Choice{
					Name: fmt.Sprintf("%s (%s)", nr.Path, nr.Files.React),
					Value: fmt.Sprintf("%d", i), // Use index as value
				})
			}

			selectedIndicesStr, err := tui.Checkbox("Select routes to add:", checkboxChoices)
			if err != nil {
				return err
			}
			
			// Add selected
			for _, idxStr := range selectedIndicesStr {
				var idx int
				fmt.Sscanf(idxStr, "%d", &idx)
				routeToAdd := newRoutesToAdd[idx]
				r = append(r, routeToAdd)
				
				// Scaffold View if missing?
				vPath := filepath.Join(config.ServerDir, routeToAdd.Files.View)
				if _, err := os.Stat(vPath); os.IsNotExist(err) {
					fmt.Printf("[Creating] Missing View for %s: %s\n", routeToAdd.Name, routeToAdd.Files.View)
					os.MkdirAll(filepath.Dir(vPath), 0755)
					os.WriteFile(vPath, []byte(scaffold.MVCView(routeToAdd.Name)), 0644)
				}
			}
			
			if len(selectedIndicesStr) > 0 {
				if err := routes.Write(config.RoutesJSON, r); err != nil {
					return err
				}
			}
		}

	case "delete_untracked":
		// Confirm deletion
		filesToDelete := append(untrackedReact, untrackedViews...)
		checkboxChoices := []tui.Choice{}
		for _, f := range filesToDelete {
			// Display relative to RootDir? Actually paths found are relative to Client/Server dir in my FindFiles usage?
			// fsutil found them relative to ClientDir/ServerDir.
			// Let's display with prefix.
			display := "poyo.client/" + f
			if strings.HasPrefix(f, "Views") {
				display = "Poyo.Server/" + f
			}

			checkboxChoices = append(checkboxChoices, tui.Choice{
				Name: display,
				Value: f, // This value is relative to client/server dir
			}) 
			// Wait, we need to know which dir it belongs to to delete.
			// "Views/..." implies ServerDir. "src/..." implies ClientDir.
		}

		selectedFiles, err := tui.Checkbox("Select files to PERMANENTLY DELETE:", checkboxChoices)
		if err != nil {
			return err
		}

		if len(selectedFiles) > 0 {
			for _, f := range selectedFiles {
				var fullPath string
				var root string
				if strings.HasPrefix(f, "src") {
					fullPath = filepath.Join(config.ClientDir, f)
					root = config.ClientDir
				} else {
					fullPath = filepath.Join(config.ServerDir, f)
					root = config.ServerDir
				}
				
				if err := os.Remove(fullPath); err == nil {
					fmt.Printf("[DELETED] %s\n", f)
					fsutil.DeleteEmptyParents(fullPath, root)
				}
			}
		}

	default:
		fmt.Println("[INFO] No changes made.")
	}

	return nil
}
