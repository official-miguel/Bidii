# Unified Workspace Architecture

## Overview

Every module in Bidii follows an identical workspace structure to create a predictable, consistent experience across the entire application. Users instantly know where to find information and how to interact with any module, whether they're working in Students, Staff, Library, Attendance, Calendar, or any other section.

## Structure Pattern

Every module workspace follows this exact hierarchy:

```
1. ContextNavigation (sub-section tabs)
2. PageHeader (title, description, primary action)
3. WorkspaceToolbar (search, filters, actions)
4. Primary Content (tables, grids, cards)
5. SlideOver / Modal (in-workspace interactions)
```

## Component Usage

### 1. ContextNavigation

**Purpose:** Sub-section navigation within a hub.

**Placement:** First element, above PageHeader.

**Usage:**
```tsx
import ContextNavigation from "@/components/ContextNavigation";

<ContextNavigation
  items={[
    { href: "/principal/students", label: "Students" },
    { href: "/principal/staff", label: "Staff" },
  ]}
/>
```

**Variants:**
- `tabs` (default): Underline-style tabs
- `pills`: Filled pill chips

### 2. PageHeader

**Purpose:** Module title, description, and primary action.

**Placement:** After ContextNavigation, before WorkspaceToolbar.

**Usage:**
```tsx
import { PageHeader, primaryButtonClass } from "@/components/ui";

<PageHeader
  title="Students"
  description="Admission number is the identifier used across results, marking, and parent linking."
  action={
    <button className={primaryButtonClass} onClick={openCreate}>
      Register student
    </button>
  }
/>
```

### 3. WorkspaceToolbar

**Purpose:** Module-specific controls (search, filters, sorting, date ranges, bulk actions).

**Placement:** After PageHeader, before primary content.

**Usage:**
```tsx
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

<WorkspaceToolbar>
  <WorkspaceToolbar.Search 
    value={search} 
    onChange={setSearch} 
    placeholder="Search students..."
  />
  
  <WorkspaceToolbar.Filter
    label="Class"
    value={filterClass}
    options={classOptions}
    onChange={setFilterClass}
  />
  
  <WorkspaceToolbar.Actions>
    <button className={secondaryButtonClass} onClick={handleExport}>
      Export
    </button>
  </WorkspaceToolbar.Actions>
</WorkspaceToolbar>
```

**Available Components:**
- `WorkspaceToolbar.Search` — Search input with clear button
- `WorkspaceToolbar.Filter` — Dropdown filter
- `WorkspaceToolbar.FilterButton` — Toggle advanced filters panel
- `WorkspaceToolbar.DateRange` — Date range picker
- `WorkspaceToolbar.Actions` — Right-aligned action buttons
- `WorkspaceToolbar.FilterPanel` — Collapsible advanced filters

### 4. Primary Content

**Purpose:** Main data display (tables, grids, lists, cards).

**Patterns:**
- **Tables:** For structured data with multiple columns
- **Cards:** For dashboard-style overviews
- **Grids:** For visual content or equal-weight items
- **Lists:** For simple sequential data

**Best Practices:**
- Use virtual scrolling for 100+ items
- Show skeleton loaders during initial load
- Maintain existing responsive behavior
- Preserve all optimizations (caching, lazy loading)

### 5. SlideOver

**Purpose:** In-workspace interactions without page transitions.

**Placement:** Overlays the workspace from the right side.

**Usage:**
```tsx
import { SlideOver } from "@/components/workspace";

<SlideOver
  open={open}
  onClose={() => setOpen(false)}
  title="Student Profile"
  description="View and edit student information"
  size="lg"
  footer={
    <SlideOver.Actions>
      <button className={secondaryButtonClass} onClick={handleClose}>
        Cancel
      </button>
      <button className={primaryButtonClass} onClick={handleSave}>
        Save changes
      </button>
    </SlideOver.Actions>
  }
>
  <SlideOver.Section title="Personal Information">
    <SlideOver.Field label="Full Name" value={student.fullName} />
    <SlideOver.Field label="Admission Number" value={student.admissionNumber} />
  </SlideOver.Section>
  
  <SlideOver.Section title="Contact">
    <SlideOver.Field label="Parent" value={student.parentName} />
    <SlideOver.Field label="Phone" value={student.parentContact} />
  </SlideOver.Section>
</SlideOver>
```

**Sizes:**
- `sm` (384px): Quick edits, simple forms
- `md` (512px): Default, profiles, details
- `lg` (640px): Rich content, multi-section forms
- `xl` (768px): Detailed views, analytics
- `full` (100%): Immersive experiences

### Modal vs SlideOver

**Use Modal when:**
- Creating new records (focused task)
- Confirming destructive actions
- Short forms (1-5 fields)
- User must complete or cancel

**Use SlideOver when:**
- Viewing details
- Editing existing records
- Multi-section content
- User may reference main workspace

## State Persistence

Workspaces should remember:
- Scroll position
- Applied filters
- Selected tabs
- Sorting preferences
- Open panels
- Search queries

Use `sessionStorage` for ephemeral state (cleared on close):
```tsx
// Save state when user changes filter
sessionStorage.setItem('students:filterClass', filterClass);

// Restore state on mount
const [filterClass, setFilterClass] = useState(
  () => sessionStorage.getItem('students:filterClass') || ''
);
```

Use `localStorage` for persistent preferences (survives closing):
```tsx
// Save user preference
localStorage.setItem('workspace:studentsView', 'grid');
```

## Workflow Examples

### Example 1: Students Module

```tsx
export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  
  return (
    <div>
      <ContextNavigation items={[...]} />
      
      <PageHeader
        title="Students"
        description="..."
        action={<button onClick={openCreate}>Register student</button>}
      />
      
      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} />
        <WorkspaceToolbar.Filter
          label="Class"
          value={filterClass}
          options={classOptions}
          onChange={setFilterClass}
        />
        <WorkspaceToolbar.Actions>
          <button onClick={handleExport}>Export</button>
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>
      
      <StudentsTable 
        students={filteredStudents}
        onRowClick={(id) => setSelectedStudent(id)}
      />
      
      <SlideOver
        open={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        title="Student Profile"
        size="lg"
      >
        {/* Student details */}
      </SlideOver>
    </div>
  );
}
```

### Example 2: Library Module

```tsx
export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"available" | "borrowed">("available");
  
  return (
    <div>
      <ContextNavigation items={[...]} />
      
      <PageHeader
        title="Library"
        description="..."
        action={<button onClick={openAddBook}>Add book</button>}
      />
      
      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} />
        <WorkspaceToolbar.Filter
          label="Status"
          value={viewMode}
          options={[
            { value: "available", label: "Available" },
            { value: "borrowed", label: "Currently borrowed" },
          ]}
          onChange={setViewMode}
        />
      </WorkspaceToolbar>
      
      <BooksGrid books={filteredBooks} />
    </div>
  );
}
```

## Migration Checklist

When updating a module to the unified workspace:

- [ ] Add ContextNavigation (if module belongs to a hub)
- [ ] Ensure PageHeader is present with title, description, primary action
- [ ] Replace inline search/filters with WorkspaceToolbar
- [ ] Maintain all existing functionality (no regressions)
- [ ] Preserve performance optimizations (virtual scrolling, caching)
- [ ] Test responsive behavior on mobile
- [ ] Verify offline-first behavior still works
- [ ] Consider replacing page transitions with SlideOver
- [ ] Add state persistence where appropriate
- [ ] Test filter clearing and reset behavior

## Don'ts

- ❌ Don't add controls to WorkspaceToolbar that aren't relevant to the current view
- ❌ Don't force SlideOver for every interaction — Modal is still appropriate for create/delete
- ❌ Don't introduce new pages for actions that can happen in-workspace
- ❌ Don't remove existing routes — preserve URLs for bookmarking
- ❌ Don't break offline-first behavior or caching
- ❌ Don't modify ContextNavigation, PageHeader, or design system components
- ❌ Don't change table structures, form layouts, or responsive breakpoints

## Do's

- ✅ Keep workspace controls minimal and contextual
- ✅ Use SlideOver for viewing/editing existing records
- ✅ Maintain scroll position when returning to a workspace
- ✅ Show clear feedback when filters are active
- ✅ Preserve all existing permissions and access controls
- ✅ Test with large datasets (virtual scrolling threshold)
- ✅ Ensure keyboard navigation works throughout
- ✅ Maintain accessibility (ARIA labels, semantic HTML)
