/**
 * Student Library Cards — Librarian / Principal admin view
 *
 * Lists all student library cards, searchable by name or admission number.
 * Tapping a card opens the full student card detail.
 * Card status (ACTIVE/SUSPENDED/ALUMNI/TRANSFERRED) is synced from the
 * student record — only ACTIVE cards can borrow.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard } from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, EmptyState, ErrorBanner,
} from '@/components/ui';
import { StudentListItem } from '@/components/library';
import { api, StudentHit } from '@/services/api';
import { Colors, Spacing, Typography, Radius } from '@/constants';
import { useDebounce } from '@/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'SUSPENDED', 'ALUMNI', 'TRANSFERRED'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function CardsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [query,      setQuery]      = useState('');
  const [statusFilter, setStatus]   = useState<StatusFilter>('ALL');
  const [students,   setStudents]   = useState<StudentHit[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 250);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setStudents([]); return; }
    setLoading(true);
    setError(null);
    try {
      const results = await api.searchStudents(q);
      const filtered = statusFilter === 'ALL'
        ? results
        : results.filter(s => s.libraryCard?.status === statusFilter);
      setStudents(filtered);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { search(debouncedQuery); }, [debouncedQuery, search]);

  const handleRefresh = () => { setRefreshing(true); search(debouncedQuery); };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <ScreenHeader title="Library Cards" subtitle="All student cards" />

      {/* Search + filter */}
      <View style={{ backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.line, padding: Spacing[4], gap: Spacing[3] }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or admission number…"
          loading={loading}
          autoFocus={false}
        />
        {/* Status filter pills */}
        <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
          {STATUS_FILTERS.map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => setStatus(s)}
              style={{
                paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5],
                borderRadius: Radius.full, borderWidth: 1,
                borderColor: statusFilter === s ? Colors.teal : Colors.line,
                backgroundColor: statusFilter === s ? Colors.teal50 : Colors.card,
              }}
            >
              <Text style={{
                fontSize: Typography.fontSize.xs,
                fontWeight: Typography.fontWeight.medium,
                color: statusFilter === s ? Colors.teal : Colors.slateText,
              }}>
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} style={{ margin: Spacing[4] }} />}

      <FlatList
        data={students}
        keyExtractor={item => item.id}
        contentContainerStyle={{
          padding: Spacing[4], gap: Spacing[2],
          paddingBottom: insets.bottom + Spacing[8],
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.teal} />}
        renderItem={({ item }) => (
          <StudentListItem
            student={item}
            onPress={() => router.push({ pathname: '/cards/[studentId]', params: { studentId: item.id } })}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title={debouncedQuery ? 'No students found' : 'Search for a student'}
              description={debouncedQuery ? `No results for "${debouncedQuery}"` : 'Type a name or admission number above'}
              icon={<CreditCard size={40} color={Colors.slateText} />}
            />
          ) : null
        }
      />
    </View>
  );
}
