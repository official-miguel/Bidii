import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type LibraryCardModel from './LibraryCard';
import type LibraryCopyModel from './LibraryCopy';

export default class LibraryBorrowModel extends Model {
  static table = 'library_borrows';
  static associations = {
    library_cards:  { type: 'belongs_to' as const, key: 'card_id' },
    library_copies: { type: 'belongs_to' as const, key: 'copy_id' },
  };

  @field('remote_id')       remoteId!: string;
  @field('school_id')       schoolId!: string;
  @field('card_id')         cardId!: string;
  @field('copy_id')         copyId!: string;
  @date('borrowed_at')      borrowedAt!: Date;
  @date('due_at')           dueAt!: Date;
  @date('returned_at')      returnedAt!: Date | null;
  @date('fine_stopped_at')  fineStoppedAt!: Date | null;
  @field('fine_amount')     fineAmount!: number;
  @field('renewal_count')   renewalCount!: number;
  @field('notes')           notes!: string | null;
  @field('return_condition') returnCondition!: string | null;
  @field('return_type')     returnType!: string | null;
  @field('is_override')     isOverride!: boolean;
  @field('override_reason') overrideReason!: string | null;
  @field('override_by_id')  overrideById!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at')       updatedAt!: Date;
  @date('synced_at')        syncedAt!: Date | null;

  @relation('library_cards',  'card_id')  card!: LibraryCardModel;
  @relation('library_copies', 'copy_id')  copy!: LibraryCopyModel;

  /** True if book is overdue — always computed against server-received dueAt,
   *  never device time alone, to prevent incorrect fines from sync delay. */
  get isOverdue(): boolean {
    return !this.returnedAt && !this.fineStoppedAt && new Date(this.dueAt) < new Date();
  }
}
