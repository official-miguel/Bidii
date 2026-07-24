/**
 * Workspace components — unified module structure.
 *
 * Every module follows the same pattern:
 * 1. PageHeader (title, description, primary action)
 * 2. ContextNavigation (sub-section tabs)
 * 3. WorkspaceToolbar (search, filters, actions)
 * 4. Primary workspace content
 * 5. SlideOver for in-workspace interactions
 */

export { default as WorkspaceToolbar } from "./WorkspaceToolbar";
export { default as SlideOver } from "./SlideOver";
