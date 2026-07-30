import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import type StudentModel from './Student';

export default class LibraryCardModel extends Model {
  static table = 'library_cards';
  static associations = {
    students:         { type: 'belongs_to' as const, key: 'student_id' },
    library_borrows:  { type: 'has_many' as const, foreignKey: 'card_id' },
  };

  @field('remote_id')           remoteId!: string;
  @field('school_id')           schoolId!: string;
  @field('student_id')          studentId!: string;
  @field('card_number')         cardNumber!: string | null;
  @field('status')              status!: string;          // ACTIVE | SUSPENDED | ALUMNI | TRANSFERRED | EXPIRED
  @field('suspension_reason')   suspensionReason!: string | null;
  @date('expires_at')           expiresAt!: Date | null;
  @field('fine_balance')        fineBalance!: number;
  @field('total_fines_paid')    totalFinesPaid!: number;
  @field('current_borrow_count') currentBorrowCount!: number;
  @field('total_borrow_count')  totalBorrowCount!: number;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at')           updatedAt!: Date;
  @date('synced_at')            syncedAt!: Date | null;

  @relation('students', 'student_id')    student!: StudentModel;
  @children('library_borrows')           borrows!: any;
}
