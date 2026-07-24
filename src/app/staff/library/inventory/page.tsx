"use client";

import { PageHeader } from "@/components/ui";

export default function LibraryInventoryPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Library Inventory"
        description="Catalogue, copies, and QR codes"
      />
      <div className="mt-6 text-center text-slate dark:text-dark-muted">
        <p className="text-sm">The full catalogue management interface is under construction.</p>
      </div>
    </div>
  );
}
