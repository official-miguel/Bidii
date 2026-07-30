import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class StudentModel extends Model {
  static table = 'students';
  static associations = {
    library_cards: { type: 'has_many' as const, foreignKey: 'student_id' },
  };

  @field('remote_id')       remoteId!: string;
  @field('school_id')       schoolId!: string;
  @field('full_name')       fullName!: string;
  @field('admission_number') admissionNumber!: string;
  @field('class_id')        classId!: string;
  @field('class_name')      className!: string;
  @field('form')            form!: number;
  @field('stream')          stream!: string | null;
  @field('status')          status!: string;  // ENROLLED | TRANSFERRED | ALUMNI | etc.
  @field('photo_file_id')   photoFileId!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at')       updatedAt!: Date;
  @date('synced_at')        syncedAt!: Date | null;

  @children('library_cards') cards!: any;
}
