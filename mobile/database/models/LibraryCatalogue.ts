import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class LibraryCatalogueModel extends Model {
  static table = 'library_catalogues';
  static associations = {
    library_copies: { type: 'has_many' as const, foreignKey: 'catalogue_id' },
    library_reservations: { type: 'has_many' as const, foreignKey: 'catalogue_id' },
  };

  @field('remote_id')       remoteId!: string;
  @field('school_id')       schoolId!: string;
  @field('title')           title!: string;
  @field('book_number')     bookNumber!: string | null;
  @field('subject')         subject!: string | null;
  @field('form')            form!: number | null;
  @field('author')          author!: string | null;
  @field('publisher')       publisher!: string | null;
  @field('edition')         edition!: string | null;
  @field('isbn')            isbn!: string | null;
  @field('category')        category!: string;
  @field('shelf')           shelf!: string | null;
  @field('shelf_row')       shelfRow!: string | null;
  @field('language')        language!: string;
  @field('publish_year')    publishYear!: number | null;
  @date('purchase_date')    purchaseDate!: Date | null;
  @field('cost_per_copy')   costPerCopy!: number | null;
  @field('total_copies')    totalCopies!: number;
  @date('archived_at')      archivedAt!: Date | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at')       updatedAt!: Date;
  @date('synced_at')        syncedAt!: Date | null;

  @children('library_copies') copies!: any;
  @children('library_reservations') reservations!: any;
}
