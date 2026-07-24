# Hub Navigation System

## Overview

The sidebar has been completely redesigned with a fixed, hub-based navigation that never grows. All sub-navigation is now handled through **Context Navigation** displayed within pages.

## Design Principles

1. **Fixed Sidebar** - Sidebar contains only 6 hub items and never changes
2. **No Dropdowns** - No accordions, nested menus, or expandable sections
3. **Context Navigation** - Sub-navigation appears inside the page content
4. **Instant Switching** - Hub changes are instant without app reload

## Hub Structure

### The 6 Hubs

Every role sees these 6 fixed navigation items:

```
Home
People
Academics
Communication
Reports
Administration
```

### Hub Routing

Each hub has its own route pattern:
- **Home**: `/{role}` (e.g., `/principal`)
- **People**: `/{role}/people`
- **Academics**: `/{role}/academics`
- **Communication**: `/{role}/communication`
- **Reports**: `/{role}/reports`
- **Administration**: `/{role}/administration`

## Context Navigation

When you open a hub, the sidebar stays the same. Instead, **Context Navigation** appears at the top of the page content.

### Example: Principal → People Hub

When clicking "People" in the sidebar, you're taken to `/principal/people`, which shows:

**Context Navigation (inside page):**
```
[Students] [Staff]
```

These tabs let you quickly switch between Students and Staff without the sidebar changing.

### Example: Principal → Academics Hub

At `/principal/academics`, the context navigation shows:

**Context Navigation (inside page):**
```
[Classes] [Subjects] [Timetable] [Attendance] [Calendar] [Exams & Analysis]
```

### Example: Principal → Administration Hub

At `/principal/administration`, you see:

**Context Navigation (inside page):**
```
[Departments] [Library]
```

## Hub to Page Mapping

### People Hub
- Students → `/principal/students`
- Staff → `/principal/staff`

### Academics Hub
- Classes → `/principal/classes`
- Subjects → `/principal/subjects`
- Timetable → `/principal/timetable`
- Attendance → `/principal/attendance`
- Calendar → `/principal/calendar`
- Exams & Analysis → `/principal/assessments`

### Communication Hub
- Communication → `/principal/communication`

### Reports Hub
- Records → `/principal/records`

### Administration Hub
- Departments → `/principal/departments`
- Library → `/principal/library`

## Components

### HubSidebar Component

**Location**: `src/components/HubSidebar.tsx`

The new sidebar component that renders the 6 fixed hub items.

**Props:**
```typescript
{
  userEmail: string;
  roleLabel: string;
  role: string;          // "principal", "teacher", "staff", "parent"
  schoolName?: string;
}
```

**Usage:**
```tsx
<HubSidebar
  userEmail={user.email}
  roleLabel="Principal"
  role="principal"
  schoolName={school?.name}
/>
```

### ContextNavigation Component

**Location**: `src/components/ContextNavigation.tsx`

Displays horizontal navigation tabs within page content.

**Props:**
```typescript
{
  items: ContextNavItem[];
  title?: string;
}

type ContextNavItem = {
  href: string;
  label: string;
  exact?: boolean;
}
```

**Usage:**
```tsx
<ContextNavigation
  items={[
    { href: "/principal/students", label: "Students" },
    { href: "/principal/staff", label: "Staff" },
  ]}
/>
```

## Adding Context Navigation to Existing Pages

To add context navigation to an existing page:

1. Import the component:
```tsx
import ContextNavigation from "@/components/ContextNavigation";
```

2. Add it at the top of your page content:
```tsx
return (
  <div>
    <ContextNavigation
      items={[
        { href: "/principal/classes", label: "Classes" },
        { href: "/principal/subjects", label: "Subjects" },
        { href: "/principal/timetable", label: "Timetable" },
        { href: "/principal/attendance", label: "Attendance" },
        { href: "/principal/calendar", label: "Calendar" },
        { href: "/principal/assessments", label: "Exams & Analysis" },
      ]}
    />
    
    <PageHeader title="..." />
    {/* rest of page */}
  </div>
);
```

## Updated Layouts

All role layouts have been updated to use `HubSidebar`:

- `/src/app/principal/layout.tsx`
- `/src/app/teacher/layout.tsx`
- `/src/app/staff/layout.tsx`
- `/src/app/parent/layout.tsx`

## Hub Landing Pages

Each hub has a landing page at `/{role}/{hub}/page.tsx`:

- `/src/app/principal/people/page.tsx`
- `/src/app/principal/academics/page.tsx`
- `/src/app/principal/communication/page.tsx`
- `/src/app/principal/reports/page.tsx`
- `/src/app/principal/administration/page.tsx`

Landing pages show:
1. Hub title
2. Context navigation
3. Quick access cards for each section

## Active State Logic

The sidebar automatically determines the active hub based on the URL path:

```typescript
const hubMap: Record<string, Hub> = {
  people: "people",
  students: "people",      // /principal/students → People hub active
  staff: "people",         // /principal/staff → People hub active
  academics: "academics",
  classes: "academics",    // /principal/classes → Academics hub active
  subjects: "academics",
  timetable: "academics",
  attendance: "academics",
  calendar: "academics",
  assessments: "academics",
  // ... and so on
};
```

## Benefits

1. **Cleaner UI** - Sidebar never grows, stays simple and focused
2. **Better Context** - Related items grouped together in-page
3. **Faster Navigation** - No dropdowns to expand/collapse
4. **Instant Switching** - Client-side navigation, no reload
5. **Scalable** - Easy to add new pages without cluttering sidebar

## Migration Notes

- Old `Sidebar` component still exists but is no longer used
- All layouts now use `HubSidebar` instead
- Context navigation should be added to all major pages
- Mobile navigation shows first 4 hubs in bottom bar
