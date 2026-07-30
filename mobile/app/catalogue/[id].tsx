/**
 * Catalogue Detail Screen
 *
 * Shows one BookTitle (LibraryCatalogue) record with:
 *   - Full metadata (title, author, edition, ISBN, form, shelf, etc.)
 *   - A live list of all BookCopy records under it with status + condition
 *   - Add Copy button (librarian/principal only)
 *   - Copy count stats: available / borrowed / reserved
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Edit2, BookOpen, Tag, MapPin, Calendar } from 'lucide-react-native';
import {
  ScreenHeader, Card, EmptyState,
  ErrorBanner, Toast, useToast,
} from '@/components/ui';
import { BookListItem } from '@/components/library';
import { api, CatalogueWithCopies, CopyRecord } from '@/services/api';
import { Colors, Spacing, Typography, Radius, CopyStatusColors } from '@/constants';
import { isLibrarian, isPrincipal } from '@/lib/auth';
import { formatDate, copyStatusLabel, conditionLabel } from '@/lib/utils';

export default function CatalogueDetailScreen() {
  const { id }     = useLocalSearchParams<{ id: string }>();
  const router     = useRouter();
  const { toastProps, show: showToast } = useToast();
  const canManage  = isLibrarian() || isPrincipal();

  const [catalogue, setCatalogue] = useState<CatalogueWithCopies | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const data = await api.getCatalogueWithCopies(id);
      setCatalogue(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load book details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  // ── Copy stats ────────────────────────────────────────────────────────────

  const copies    = catalogue?.copies ?? [];
  const available = copies.filter(c => c.status === 'AVAILABLE').length;
  const borrowed  = copies.filter(c => c.status === 'BORROWED').length;
  const reserved  = copies.filter(c => c.status === 'RESERVED').length;
  const repair    = copies.filter(c => c.status === 'UNDER_REPAIR').length;
  const archived  = copies.filter(c => c.status === 'ARCHIVED').length;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.paper }}>
        <ScreenHeader title="Book Details" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.teal} />
        </View>
      </View>
    );
  }

  if (error || !catalogue) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.paper }}>
        <ScreenHeader title="Book Details" showBack />
        <ErrorBanner message={error || 'Book not found'} style={{ margin: Spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <ScreenHeader
        title={catalogue.title}
        subtitle={catalogue.author ? `by ${catalogue.author}` : undefined}
        showBack
        right={
          canManage ? (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/catalogue/new', params: { editId: id } })}
              style={{
                width: 36, height: 36, borderRadius: Radius.button,
                backgroundColor: Colors.white + '20',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Edit2 size={18} color={Colors.white} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.teal} />}
        contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4] }}
      >
        {/* ── Metadata card ─────────────────────────────────────────── */}
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing[3] }}>
            Book Details
          </Text>

          <View style={{ gap: Spacing[3] }}>
            <MetaRow icon={<BookOpen size={14} color={Colors.slateText} />} label="Title">
              {catalogue.title}
            </MetaRow>

            {catalogue.author && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="Author">
                {catalogue.author}
              </MetaRow>
            )}

            {catalogue.edition && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="Edition">
                {catalogue.edition}
              </MetaRow>
            )}

            {catalogue.isbn && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="ISBN">
                {catalogue.isbn}
              </MetaRow>
            )}

            {catalogue.subject && (
              <MetaRow icon={<BookOpen size={14} color={Colors.slateText} />} label="Subject">
                {catalogue.subject}
              </MetaRow>
            )}

            {catalogue.form && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="Form / Level">
                Form {catalogue.form}
              </MetaRow>
            )}

            {catalogue.publisher && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="Publisher">
                {catalogue.publisher}
              </MetaRow>
            )}

            {catalogue.shelf && (
              <MetaRow icon={<MapPin size={14} color={Colors.slateText} />} label="Shelf">
                {catalogue.shelf}{catalogue.shelfRow ? ` · Row ${catalogue.shelfRow}` : ''}
              </MetaRow>
            )}

            {catalogue.bookNumber && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="Book No.">
                {catalogue.bookNumber}
              </MetaRow>
            )}

            {catalogue.category && (
              <MetaRow icon={<Tag size={14} color={Colors.slateText} />} label="Category">
                {catalogue.category}
              </MetaRow>
            )}
          </View>
        </Card>

        {/* ── Copy stats row ─────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' }}>
          <StatPill label="Available" value={available} color={Colors.success} />
          <StatPill label="Borrowed"  value={borrowed}  color={Colors.info} />
          <StatPill label="Reserved"  value={reserved}  color={Colors.warn} />
          {repair   > 0 && <StatPill label="Repair"  value={repair}   color={Colors.warn} />}
          {archived > 0 && <StatPill label="Archived" value={archived} color={Colors.slateText} />}
        </View>

        {/* ── Copies list ────────────────────────────────────────────── */}
        <View style={{ gap: Spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }}>
              Physical Copies ({copies.length})
            </Text>

            {canManage && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/catalogue/[id]/copy/new', params: { id } })}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: Spacing[1],
                  paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5],
                  borderRadius: Radius.button,
                  backgroundColor: Colors.teal,
                }}
              >
                <Plus size={14} color={Colors.white} />
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.white }}>
                  Add Copy
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {copies.length === 0 ? (
            <EmptyState
              title="No copies yet"
              description={canManage ? 'Tap "Add Copy" to register the first physical copy' : 'No copies have been registered'}
              icon={<BookOpen size={32} color={Colors.slateText} />}
            />
          ) : (
            copies.map(copy => (
              <BookListItem
                key={copy.id}
                title={copy.accessionNumber}
                subtitle={`#${copy.accessionNumber}`}
                status={copy.status}
                condition={copy.condition}
                onPress={() =>
                  router.push({ pathname: '/catalogue/[id]/copy/[copyId]', params: { id, copyId: copy.id } })
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <Toast {...toastProps} />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, marginBottom: 1 }}>{label}</Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.ink }}>{String(children)}</Text>
      </View>
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{
      paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
      borderRadius: Radius.button, backgroundColor: Colors.card,
      borderWidth: 1, borderColor: Colors.line,
      alignItems: 'center', minWidth: 72,
    }}>
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color }}>{value}</Text>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>{label}</Text>
    </View>
  );
}
