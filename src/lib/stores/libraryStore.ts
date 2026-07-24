"use client";

/**
 * src/lib/stores/libraryStore.ts
 *
 * Global store for the Library Management System — fetches from API.
 */

import { create } from "zustand";

export type LocalLibraryCatalogue = {
  id: string;
  schoolId: string;
  title: string;
  bookNumber: string | null;
  subject: string | null;
  form: number | null;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  isbn: string | null;
  category: string;
  shelf: string | null;
  shelfRow: string | null;
  language: string;
  publishYear: number | null;
  purchaseDate: string | null;
  costPerCopy: number | null;
  totalCopies: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalLibraryCopy = {
  id: string;
  schoolId: string;
  catalogueId: string;
  accessionNumber: string;
  qrCode: string | null;
  barcode: string | null;
  condition: string;
  status: string;
  acquisitionDate: string | null;
  cost: number | null;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalLibraryCard = {
  id: string;
  schoolId: string;
  studentId: string;
  cardNumber: string | null;
  status: string;
  suspensionReason: string | null;
  expiresAt: string | null;
  fineBalance: number;
  totalFinesPaid: number;
  currentBorrowCount: number;
  totalBorrowCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalLibraryBorrow = {
  id: string;
  schoolId: string;
  cardId: string;
  bookId: string | null;
  copyId: string | null;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  fineStoppedAt: string | null;
  fineAmount: number;
  renewalCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalLibraryBook = {
  id: string;
  schoolId: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  publishYear: number | null;
  totalCopies: number;
  createdAt: string;
  updatedAt: string;
};

export interface CatalogueFilters {
  subject?: string;
  form?: number | null;
  category?: string;
  shelf?: string;
  availability?: string;
  archived?: boolean;
}

interface LibraryState {
  catalogues: LocalLibraryCatalogue[];
  copies: LocalLibraryCopy[];
  books: LocalLibraryBook[];
  cards: LocalLibraryCard[];
  borrowsByCard: Map<string, LocalLibraryBorrow[]>;
  loading: boolean;

  fetch: () => Promise<void>;
  loadBorrowsForCard: (cardId: string) => Promise<void>;

  upsertCatalogue: (cat: LocalLibraryCatalogue) => void;
  upsertCopy: (copy: LocalLibraryCopy) => void;
  upsertBook: (book: LocalLibraryBook) => void;
  upsertCard: (card: LocalLibraryCard) => void;
  upsertBorrow: (borrow: LocalLibraryBorrow) => void;

  searchCatalogues: (query: string, filters?: CatalogueFilters) => LocalLibraryCatalogue[];
  copiesForCatalogue: (catalogueId: string, status?: string) => LocalLibraryCopy[];
  copyByAccession: (accession: string) => LocalLibraryCopy | undefined;
  copyByQr: (qr: string) => LocalLibraryCopy | undefined;
  availableCount: (catalogueId: string) => number;
  activeBorrowsForCard: (cardId: string) => LocalLibraryBorrow[];
  cardForStudent: (studentId: string) => LocalLibraryCard | undefined;
  searchBooks: (query: string) => LocalLibraryBook[];
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  catalogues: [],
  copies: [],
  books: [],
  cards: [],
  borrowsByCard: new Map(),
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const [catRes, copyRes, bookRes, cardRes] = await Promise.all([
        fetch("/api/library/catalogue"),
        fetch("/api/library/copies"),
        fetch("/api/library/books"),
        fetch("/api/library/cards"),
      ]);
      const [catalogues, copies, books, cards] = await Promise.all([
        catRes.ok ? catRes.json() : [],
        copyRes.ok ? copyRes.json() : [],
        bookRes.ok ? bookRes.json() : [],
        cardRes.ok ? cardRes.json() : [],
      ]);
      catalogues.sort((a: LocalLibraryCatalogue, b: LocalLibraryCatalogue) =>
        a.title.localeCompare(b.title)
      );
      books.sort((a: LocalLibraryBook, b: LocalLibraryBook) =>
        a.title.localeCompare(b.title)
      );
      set({ catalogues, copies, books, cards, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async loadBorrowsForCard(cardId) {
    if (get().borrowsByCard.has(cardId)) return;
    try {
      const res = await fetch(`/api/library/cards/${encodeURIComponent(cardId)}/borrows`);
      if (!res.ok) return;
      const borrows: LocalLibraryBorrow[] = await res.json();
      borrows.sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt));
      set((s) => {
        const next = new Map(s.borrowsByCard);
        next.set(cardId, borrows);
        return { borrowsByCard: next };
      });
    } catch {
      /* non-fatal */
    }
  },

  upsertCatalogue(cat) {
    set((s) => ({
      catalogues: s.catalogues.some((x) => x.id === cat.id)
        ? s.catalogues.map((x) => (x.id === cat.id ? cat : x))
        : [...s.catalogues, cat].sort((a, b) => a.title.localeCompare(b.title)),
    }));
  },

  upsertCopy(copy) {
    set((s) => ({
      copies: s.copies.some((x) => x.id === copy.id)
        ? s.copies.map((x) => (x.id === copy.id ? copy : x))
        : [...s.copies, copy],
    }));
  },

  upsertBook(book) {
    set((s) => ({
      books: s.books.some((x) => x.id === book.id)
        ? s.books.map((x) => (x.id === book.id ? book : x))
        : [...s.books, book].sort((a, b) => a.title.localeCompare(b.title)),
    }));
  },

  upsertCard(card) {
    set((s) => ({
      cards: s.cards.some((x) => x.id === card.id)
        ? s.cards.map((x) => (x.id === card.id ? card : x))
        : [...s.cards, card],
    }));
  },

  upsertBorrow(borrow) {
    set((s) => {
      const existing = s.borrowsByCard.get(borrow.cardId) ?? [];
      const updated = existing.some((x) => x.id === borrow.id)
        ? existing.map((x) => (x.id === borrow.id ? borrow : x))
        : [borrow, ...existing];
      const next = new Map(s.borrowsByCard);
      next.set(borrow.cardId, updated);
      return { borrowsByCard: next };
    });
  },

  searchCatalogues(query, filters) {
    const copies = get().copies;
    let list = get().catalogues;

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.author?.toLowerCase().includes(q) ?? false) ||
          (c.bookNumber?.toLowerCase().includes(q) ?? false) ||
          (c.isbn?.toLowerCase().includes(q) ?? false) ||
          (c.subject?.toLowerCase().includes(q) ?? false) ||
          (c.edition?.toLowerCase().includes(q) ?? false)
      );
    }

    if (filters) {
      if (filters.subject) list = list.filter((c) => c.subject === filters.subject);
      if (filters.form !== undefined && filters.form !== null)
        list = list.filter((c) => c.form === filters.form);
      if (filters.category) list = list.filter((c) => c.category === filters.category);
      if (filters.shelf) list = list.filter((c) => c.shelf === filters.shelf);
      if (filters.archived !== undefined)
        list = list.filter((c) =>
          filters.archived ? c.archivedAt !== null : c.archivedAt === null
        );
      if (filters.availability && filters.availability !== "all") {
        if (filters.availability === "available") {
          list = list.filter((c) =>
            copies.some((cp) => cp.catalogueId === c.id && cp.status === "AVAILABLE")
          );
        } else if (filters.availability === "unavailable") {
          list = list.filter(
            (c) =>
              !copies.some(
                (cp) => cp.catalogueId === c.id && cp.status === "AVAILABLE"
              )
          );
        }
      }
    } else {
      list = list.filter((c) => c.archivedAt === null);
    }

    return list;
  },

  copiesForCatalogue(catalogueId, status) {
    const list = get().copies.filter((c) => c.catalogueId === catalogueId);
    return status ? list.filter((c) => c.status === status) : list;
  },

  copyByAccession(accession) {
    const q = accession.trim().toUpperCase();
    return get().copies.find((c) => c.accessionNumber.toUpperCase() === q);
  },

  copyByQr(qr) {
    return get().copies.find((c) => c.qrCode === qr.trim());
  },

  availableCount(catalogueId) {
    return get().copies.filter(
      (c) => c.catalogueId === catalogueId && c.status === "AVAILABLE"
    ).length;
  },

  activeBorrowsForCard(cardId) {
    return (get().borrowsByCard.get(cardId) ?? []).filter(
      (b) => b.returnedAt === null
    );
  },

  cardForStudent(studentId) {
    return get().cards.find((c) => c.studentId === studentId);
  },

  searchBooks(query) {
    const books = get().books;
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author?.toLowerCase().includes(q) ?? false) ||
        (b.isbn?.toLowerCase().includes(q) ?? false)
    );
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function searchLibraryCatalogues(
  query: string,
  filters?: CatalogueFilters
): LocalLibraryCatalogue[] {
  return useLibraryStore.getState().searchCatalogues(query, filters);
}

export function getCopiesForCatalogue(
  catalogueId: string,
  status?: string
): LocalLibraryCopy[] {
  return useLibraryStore.getState().copiesForCatalogue(catalogueId, status);
}

export function getCopyByAccession(accession: string): LocalLibraryCopy | undefined {
  return useLibraryStore.getState().copyByAccession(accession);
}

export function getCopyByQr(qr: string): LocalLibraryCopy | undefined {
  return useLibraryStore.getState().copyByQr(qr);
}

export function getAvailableCount(catalogueId: string): number {
  return useLibraryStore.getState().availableCount(catalogueId);
}

export function getActiveBorrowsForCard(cardId: string): LocalLibraryBorrow[] {
  return useLibraryStore.getState().activeBorrowsForCard(cardId);
}

export function getCardForStudent(studentId: string): LocalLibraryCard | undefined {
  return useLibraryStore.getState().cardForStudent(studentId);
}

export function searchLibraryBooks(query: string): LocalLibraryBook[] {
  return useLibraryStore.getState().searchBooks(query);
}
