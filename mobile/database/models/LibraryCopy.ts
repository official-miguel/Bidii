import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type LibraryCatalogueModel from './LibraryCatalogue';

export default class LibraryCopyModel extends Model {
  static table = 'library_copies';
  static associations = {
    library_catalogues: { type: 'belongs_to' as const, key: 'catalogue_id' },
    library_borrows:    { type: 'has_many' as const, foreignKey: 'copy_id' },
  };

  @field('remote_id')       remoteId!: string;
  @field('school_id')       schoolId!: string;
  @field('catalogue_id')    catalogueId!: string;
  @field('accession_number') accessionNumber!: string;
  @field('qr_code')         qrCode!: string | null;
  @field('barcode')         barcode!: string | null;
  @field('condition')       condition!: string;   // EXCELLENT | GOOD | FAIR | DAMAGED | LOST
  @field('status')          status!: string;      // AVAILABLE | BORROWED | RESERVED | UNDER_REPAIR | ARCHIVED | LOST
  @date('acquisition_date') acquisitionDate!: Date | null;
  @field('cost')            cost!: number | null;
  @date('archived_at')      archivedAt!: Date | null;
  @field('archive_reason')  archiveReason!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at')       updatedAt!: Date;
  @date('synced_at')        syncedAt!: Date | null;

  @relation('library_catalogues', 'catalogue_id') catalogue!: LibraryCatalogueModel;
}
