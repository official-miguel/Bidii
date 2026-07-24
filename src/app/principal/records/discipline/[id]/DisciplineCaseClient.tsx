"use client";

import { useState, FormEvent } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

type DisciplineCaseClientRecord = {
  id: string;
  offence: string;
  status: string;
  description: string | null;
  actionTaken: string | null;
  resolution: string | null;
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    schoolClass: { name: string; form: number };
  };
};

type DisciplineCaseNote = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: { email: string } | null;
};

type DisciplineCaseEvent = {
  id: string;
  type: string;
  detail: string | null;
  createdAt: string;
  createdBy: { email: string } | null;
};

type DisciplineCaseFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type Props = {
  record: DisciplineCaseClientRecord;
  initialNotes: DisciplineCaseNote[];
  initialEvents: DisciplineCaseEvent[];
  initialFiles: DisciplineCaseFile[];
};

export default function DisciplineCaseClient({
  record,
  initialNotes,
  initialEvents,
  initialFiles,
}: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [events, setEvents] = useState(initialEvents);
  const [files] = useState(initialFiles);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newEvent, setNewEvent] = useState({ title: "", description: "", eventDate: "" });
  const [saving, setSaving] = useState(false);

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/students/${record.student.id}/discipline/${record.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: newNote }),
    });
    if (res.ok) {
      const data = await res.json();
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
      setShowNoteForm(false);
    }
    setSaving(false);
  }

  async function handleAddEvent(e: FormEvent) {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.eventDate) return;
    setSaving(true);
    const res = await fetch(`/api/students/${record.student.id}/discipline/${record.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEvent),
    });
    if (res.ok) {
      const data = await res.json();
      setEvents((prev) => [...prev, data]);
      setNewEvent({ title: "", description: "", eventDate: "" });
      setShowEventForm(false);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-line rounded-lg p-4">
        <h3 className="font-medium text-ink mb-2">Case Details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate">Offence</dt>
          <dd className="text-ink">{record.offence}</dd>
          <dt className="text-slate">Action Taken</dt>
          <dd className="text-ink">{record.actionTaken || "—"}</dd>
          <dt className="text-slate">Resolution</dt>
          <dd className="text-ink">{record.resolution || "—"}</dd>
          <dt className="text-slate">Status</dt>
          <dd className="text-ink">{record.status}</dd>
          <dt className="text-slate">Description</dt>
          <dd className="col-span-2 text-ink">{record.description || "—"}</dd>
        </dl>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-ink">Case Notes</h3>
          <button type="button" className="text-sm text-royal hover:underline" onClick={() => setShowNoteForm(!showNoteForm)}>
            {showNoteForm ? "Cancel" : "Add note"}
          </button>
        </div>
        {showNoteForm && (
          <form onSubmit={handleAddNote} className="mb-4 space-y-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Add a note..."
              required
            />
            <div className="flex gap-2">
              <button type="submit" className={primaryButtonClass} disabled={saving}>
                {saving ? "Saving…" : "Save note"}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => setShowNoteForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        <div className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-slate">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="bg-card border border-line rounded-lg p-3">
                <p className="text-sm text-ink">{n.body}</p>
                <p className="text-xs text-slate mt-1">{new Date(n.createdAt).toLocaleString()} by {n.createdBy?.email || "System"}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-ink">Events</h3>
          <button type="button" className="text-sm text-royal hover:underline" onClick={() => setShowEventForm(!showEventForm)}>
            {showEventForm ? "Cancel" : "Add event"}
          </button>
        </div>
        {showEventForm && (
          <form onSubmit={handleAddEvent} className="mb-4 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <input
                value={newEvent.title}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Event title"
                className={inputClass}
                required
              />
              <input
                type="date"
                value={newEvent.eventDate}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, eventDate: e.target.value }))}
                className={inputClass}
                required
              />
            </div>
            <textarea
              value={newEvent.description}
              onChange={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              className={inputClass}
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <button type="submit" className={primaryButtonClass} disabled={saving}>
                {saving ? "Saving…" : "Save event"}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => setShowEventForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-slate">No events yet.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="bg-card border border-line rounded-lg p-3">
                <p className="font-medium text-ink">{e.type}</p>
                {e.detail && <p className="text-sm text-slate mt-1">{e.detail}</p>}
                <p className="text-xs text-slate mt-1">{new Date(e.createdAt).toLocaleDateString()} • by {e.createdBy?.email || "System"}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="font-medium text-ink mb-3">Files</h3>
        {files.length === 0 ? (
          <p className="text-sm text-slate">No files attached.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 bg-card border border-line rounded-lg p-3">
                {f.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/student-files/${f.id}`}
                    alt={f.fileName}
                    className="w-16 h-16 object-cover rounded border border-line"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.svg";
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 flex items-center justify-center rounded border border-line bg-paper">
                    <span className="text-xs text-slate">File</span>
                  </div>
                )}
                <div>
                  <p className="text-sm text-ink">{f.fileName}</p>
                  <p className="text-xs text-slate">{(f.size / 1024).toFixed(1)} KB</p>
                </div>
                <a
                  href={`/api/student-files/${f.id}`}
                  download={f.fileName}
                  className="text-sm text-royal hover:underline ml-auto"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}