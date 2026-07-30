/**
 * WatermelonDB Schema Definition
 * 
 * Mirrors the Prisma schema from the backend, defining local tables for
 * offline-first operation. All library operations happen locally first, then
 * sync to the server when connectivity is restored.
 */

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    // ── Library Settings ──────────────────────────────────────────────────
    tableSchema({
      name: 'library_settings',
      columns: [
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'max_books_per_student', type: 'number' },
        { name: 'max_borrow_days', type: 'number' },
        { name: 'fine_per_day', type: 'number' },
        { name: 'max_renewals', type: 'number' },
        { name: 'identification_method', type: 'string' },
        { name: 'barcode_enabled', type: 'boolean' },
        { name: 'eligible_from_form', type: 'number', isOptional: true },
        { name: 'card_validity_days', type: 'number', isOptional: true },
        { name: 'overdue_alert_days', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Library Catalogue (Book Titles) ───────────────────────────────────
    tableSchema({
      name: 'library_catalogues',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string', isIndexed: true },
        { name: 'book_number', type: 'string', isOptional: true },
        { name: 'subject', type: 'string', isOptional: true, isIndexed: true },
        { name: 'form', type: 'number', isOptional: true, isIndexed: true },
        { name: 'author', type: 'string', isOptional: true },
        { name: 'publisher', type: 'string', isOptional: true },
        { name: 'edition', type: 'string', isOptional: true },
        { name: 'isbn', type: 'string', isOptional: true },
        { name: 'category', type: 'string' },
        { name: 'shelf', type: 'string', isOptional: true },
        { name: 'shelf_row', type: 'string', isOptional: true },
        { name: 'language', type: 'string' },
        { name: 'publish_year', type: 'number', isOptional: true },
        { name: 'purchase_date', type: 'number', isOptional: true },
        { name: 'cost_per_copy', type: 'number', isOptional: true },
        { name: 'total_copies', type: 'number' },
        { name: 'archived_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Library Copies (Physical Books) ───────────────────────────────────
    tableSchema({
      name: 'library_copies',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'catalogue_id', type: 'string', isIndexed: true },
        { name: 'accession_number', type: 'string', isIndexed: true },
        { name: 'qr_code', type: 'string', isOptional: true, isIndexed: true },
        { name: 'barcode', type: 'string', isOptional: true },
        { name: 'condition', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'acquisition_date', type: 'number', isOptional: true },
        { name: 'cost', type: 'number', isOptional: true },
        { name: 'archived_at', type: 'number', isOptional: true },
        { name: 'archive_reason', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Students (cached for search) ──────────────────────────────────────
    tableSchema({
      name: 'students',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'full_name', type: 'string', isIndexed: true },
        { name: 'admission_number', type: 'string', isIndexed: true },
        { name: 'class_id', type: 'string' },
        { name: 'class_name', type: 'string' },
        { name: 'form', type: 'number', isIndexed: true },
        { name: 'stream', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'photo_file_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Library Cards ─────────────────────────────────────────────────────
    tableSchema({
      name: 'library_cards',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'student_id', type: 'string', isIndexed: true },
        { name: 'card_number', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'suspension_reason', type: 'string', isOptional: true },
        { name: 'expires_at', type: 'number', isOptional: true },
        { name: 'fine_balance', type: 'number' },
        { name: 'total_fines_paid', type: 'number' },
        { name: 'current_borrow_count', type: 'number' },
        { name: 'total_borrow_count', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Library Borrows ───────────────────────────────────────────────────
    tableSchema({
      name: 'library_borrows',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'card_id', type: 'string', isIndexed: true },
        { name: 'copy_id', type: 'string', isIndexed: true },
        { name: 'borrowed_at', type: 'number' },
        { name: 'due_at', type: 'number', isIndexed: true },
        { name: 'returned_at', type: 'number', isOptional: true },
        { name: 'fine_stopped_at', type: 'number', isOptional: true },
        { name: 'fine_amount', type: 'number' },
        { name: 'renewal_count', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'return_condition', type: 'string', isOptional: true },
        { name: 'return_type', type: 'string', isOptional: true },
        { name: 'is_override', type: 'boolean' },
        { name: 'override_reason', type: 'string', isOptional: true },
        { name: 'override_by_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Library Reservations ──────────────────────────────────────────────
    tableSchema({
      name: 'library_reservations',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'catalogue_id', type: 'string', isIndexed: true },
        { name: 'reservation_type', type: 'string' },
        { name: 'student_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'teacher_id', type: 'string', isOptional: true },
        { name: 'department_name', type: 'string', isOptional: true },
        { name: 'expected_return_date', type: 'number', isOptional: true },
        { name: 'quantity_requested', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'allocated_copy_id', type: 'string', isOptional: true },
        { name: 'fulfilled_at', type: 'number', isOptional: true },
        { name: 'expires_at', type: 'number', isOptional: true },
        { name: 'queue_position', type: 'number', isOptional: true },
        { name: 'created_by_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Library Policies ──────────────────────────────────────────────────
    tableSchema({
      name: 'library_policies',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'school_id', type: 'string', isIndexed: true },
        { name: 'patron_type', type: 'string', isIndexed: true },
        { name: 'label', type: 'string', isOptional: true },
        { name: 'max_books_allowed', type: 'number' },
        { name: 'borrow_days', type: 'number' },
        { name: 'grace_period_days', type: 'number' },
        { name: 'fine_per_day', type: 'number' },
        { name: 'count_weekends', type: 'boolean' },
        { name: 'count_holidays', type: 'boolean' },
        { name: 'max_renewals', type: 'number' },
        { name: 'fine_block_threshold', type: 'number' },
        { name: 'lost_book_multiplier', type: 'number' },
        { name: 'lost_book_fixed_fee', type: 'number' },
        { name: 'damaged_book_fine_rate', type: 'number' },
        { name: 'reservations_allowed', type: 'boolean' },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // ── Sync Queue (Offline operations waiting to sync) ───────────────────
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'operation_type', type: 'string', isIndexed: true }, // BORROW | RETURN | RENEW | CREATE | UPDATE | DELETE
        { name: 'entity_type', type: 'string' }, // catalogue | copy | borrow | reservation | etc.
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' }, // JSON stringified data
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'processed_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
