/**
 * My Library Card — Student view
 *
 * Shows the student's own library card:
 *   - Photo + name + admission number
 *   - Card status badge
 *   - Fine balance
 *   - Currently borrowed books with due dates
 *   - Active reservations
 *   - Borrow history
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import {
  CreditCard, BookOpen, Clock, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react-native';
import {
  ScreenHeader, Card, Avatar, Button, ErrorBanner, SyncStatusBar,
} from '@/components/ui';
import { api, CardDetail, BorrowRow } from '@/services/api';
import { Colors, Spacing, Typography, Radius, CardStatusColors } from '@/constants';
import { useAuth } from '@/lib/auth';
import {
  formatDate, formatCurrency, cardStatusLabel,
  isOverdue, daysOverdue, daysUntilDue,
} from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyCardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [detail,     setDetail]     = useState<CardDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [showHistory,setShowHistory]= useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const data = await api.getCard(user.id);
      setDetail(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const handleRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={{ flex:1, backgroundColor: Colors.paper }}>
        <ScreenHeader title="My Library Card" />
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={Colors.teal} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={{ flex:1, backgroundColor: Colors.paper }}>
        <ScreenHeader title="My Library Card" />
        <ErrorBanner message={error || 'Card not found'} style={{ margin: Spacing[4] }} />
      </View>
    );
  }

  const { student, card } = detail;
  const photoId    = student.files[0]?.id;
  const statusCols = CardStatusColors[card.status] || { bg: Colors.line, text: Colors.slateText };
  const activeBorrows   = card.borrows.filter(b => !b.returnedAt);
  const returnedBorrows = card.borrows.filter(b => b.returnedAt);
  const hasOverdue = activeBorrows.some(b => isOverdue(b.dueAt));

  return (
    <View style={{ flex:1, backgroundColor: Colors.paper }}>
      <ScreenHeader title="My Library Card" subtitle={student.admissionNumber} />
      <SyncStatusBar />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.teal} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing[8] }}
      >
        {/* ── Card visual ─────────────────────────────────────────── */}
        <View style={{ backgroundColor: Colors.teal, padding: Spacing[6] }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap: Spacing[4] }}>
            <Avatar name={student.fullName} photoFileId={photoId} size="xl" />
            <View style={{ flex:1, gap: Spacing[1] }}>
              <Text style={{ color: Colors.white, fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold }} numberOfLines={1}>
                {student.fullName}
              </Text>
              <Text style={{ color: Colors.white + 'CC', fontSize: Typography.fontSize.sm }}>
                {student.admissionNumber}
              </Text>
              <Text style={{ color: Colors.white + 'CC', fontSize: Typography.fontSize.sm }}>
                {student.schoolClass.name}
              </Text>
              <View style={{ marginTop: Spacing[1], flexDirection:'row', gap: Spacing[2] }}>
                <View style={{ backgroundColor: statusCols.bg, paddingHorizontal: Spacing[2.5], paddingVertical:2, borderRadius: Radius.full }}>
                  <Text style={{ color: statusCols.text, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
                    {cardStatusLabel(card.status)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], marginTop: Spacing[4] }}>
            <CreditCard size={14} color={Colors.white + '80'} />
            <Text style={{ color: Colors.white + '80', fontSize: Typography.fontSize.xs }}>
              {card.cardNumber || student.admissionNumber}
            </Text>
            {card.expiresAt && (
              <Text style={{ color: Colors.white + '80', fontSize: Typography.fontSize.xs, marginLeft: Spacing[4] }}>
                Expires {formatDate(card.expiresAt)}
              </Text>
            )}
          </View>
        </View>

        <View style={{ padding: Spacing[4], gap: Spacing[4] }}>
          {/* Stats */}
          <View style={{ flexDirection:'row', gap: Spacing[2] }}>
            <StatBox value={card.fineBalance > 0 ? formatCurrency(card.fineBalance) : 'No fines'} label="Balance" color={card.fineBalance > 0 ? Colors.danger : Colors.success} />
            <StatBox value={String(card.currentBorrowCount)} label="Books Out" color={Colors.info} />
            <StatBox value={String(card.totalBorrowCount)} label="Total Borrowed" color={Colors.teal} />
          </View>

          {/* Fine warning */}
          {card.fineBalance > 0 && (
            <View style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], backgroundColor: Colors.dangerBg, borderRadius: Radius.button, padding: Spacing[3] }}>
              <AlertTriangle size={16} color={Colors.danger} />
              <Text style={{ flex:1, fontSize: Typography.fontSize.sm, color: Colors.danger }}>
                You have an outstanding fine of {formatCurrency(card.fineBalance)}. Please pay at the library.
              </Text>
            </View>
          )}

          {/* Active borrows */}
          <Card padding="none">
            <View style={{ padding: Spacing[4], borderBottomWidth:1, borderBottomColor: Colors.line }}>
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }}>
                Currently Borrowed ({activeBorrows.length})
              </Text>
            </View>
            {activeBorrows.length === 0 ? (
              <View style={{ padding: Spacing[6], alignItems:'center', gap: Spacing[2] }}>
                <CheckCircle2 size={24} color={Colors.success} />
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.slateText }}>No books borrowed</Text>
              </View>
            ) : (
              activeBorrows.map((b, i) => (
                <BorrowItem key={b.id} borrow={b} isLast={i === activeBorrows.length - 1} />
              ))
            )}
          </Card>

          {/* History */}
          {returnedBorrows.length > 0 && (
            <Card padding="none">
              <TouchableOpacity
                onPress={() => setShowHistory(v => !v)}
                style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding: Spacing[4] }}
              >
                <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }}>
                  History ({returnedBorrows.length})
                </Text>
                {showHistory ? <ChevronUp size={18} color={Colors.slateText} /> : <ChevronDown size={18} color={Colors.slateText} />}
              </TouchableOpacity>
              {showHistory && returnedBorrows.slice(0, 20).map((b, i) => (
                <BorrowItem key={b.id} borrow={b} isLast={i === Math.min(returnedBorrows.length,20)-1} dimmed />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatBox({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={{ flex:1, backgroundColor: Colors.card, borderRadius: Radius.button, borderWidth:1, borderColor: Colors.line, padding: Spacing[3], alignItems:'center' }}>
      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color }} numberOfLines={1}>{value}</Text>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText, textAlign:'center', marginTop:2 }}>{label}</Text>
    </View>
  );
}

function BorrowItem({ borrow, isLast, dimmed = false }: { borrow: BorrowRow; isLast: boolean; dimmed?: boolean }) {
  const title   = borrow.copy?.catalogue?.title || borrow.book?.title || 'Unknown Book';
  const acc     = borrow.copy?.accessionNumber;
  const overdue = !borrow.returnedAt && isOverdue(borrow.dueAt);

  return (
    <View style={{
      flexDirection:'row', gap: Spacing[3], padding: Spacing[4],
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: Colors.line,
      opacity: dimmed ? 0.7 : 1,
      backgroundColor: overdue ? Colors.dangerBg : Colors.card,
    }}>
      <View style={{ marginTop: 2 }}>
        {borrow.returnedAt ? <CheckCircle2 size={16} color={Colors.success} /> : overdue ? <AlertTriangle size={16} color={Colors.danger} /> : <Clock size={16} color={Colors.info} />}
      </View>
      <View style={{ flex:1, gap:2 }}>
        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.ink }} numberOfLines={1}>{title}</Text>
        {acc && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>{acc}</Text>}
        <Text style={{ fontSize: Typography.fontSize.xs, color: overdue ? Colors.danger : Colors.muted }}>
          {borrow.returnedAt ? `Returned ${formatDate(borrow.returnedAt)}` : overdue ? `Overdue by ${daysOverdue(borrow.dueAt)} day(s) — due ${formatDate(borrow.dueAt)}` : `Due ${formatDate(borrow.dueAt)} (${daysUntilDue(borrow.dueAt)}d left)`}
        </Text>
        {(borrow.fineAmount ?? 0) > 0 && <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.danger }}>Fine: {formatCurrency(borrow.fineAmount)}</Text>}
      </View>
    </View>
  );
}
