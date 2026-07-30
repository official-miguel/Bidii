import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type LibraryCatalogueModel from './LibraryCatalogue';

export default class LibraryReservationModel extends Model {
  static table = 'library_reservations';
  static associations = {
    library_catalogues: { type: 'belongs_to' as const, key: 'catalogue_id' },
  };

  @field('remote_id')             remoteId!: string;
  @field('school_id')             schoolId!: string;
  @field('catalogue_id')          catalogueId!: string;
  @field('reservation_type')      reservationType!: string;  // INDIVIDUAL | CLASSROOM | DEPARTMENT | WAITLIST
  @field('student_id')            studentId!: string | null;
  @field('teacher_id')            teacherId!: string | null;
  @field('department_name')       departmentName!: string | null;
  @date('expected_return_date')   expectedReturnDate!: Date | null;
  @field('quantity_requested')    quantityRequested!: number;
  @field('notes')                 notes!: string | null;
  @field('status')                status!: string;          // PENDING | ACTIVE | FULFILLED | CANCELLED | EXPIRED
  @field('allocated_copy_id')     allocatedCopyId!: string | null;
  @date('fulfilled_at')           fulfilledAt!: Date | null;
  @date('expires_at')             expiresAt!: Date | null;
  @field('queue_position')        queuePosition!: number | null;
  @field('created_by_id')         createdById!: string | null;
  @readonly @date('created_at')   createdAt!: Date;
  @date('updated_at')             updatedAt!: Date;
  @date('synced_at')              syncedAt!: Date | null;

  @relation('library_catalogues', 'catalogue_id') catalogue!: LibraryCatalogueModel;
}
