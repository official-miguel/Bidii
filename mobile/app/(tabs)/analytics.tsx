/**
 * Analytics Dashboard — comprehensive library KPIs
 *
 * Covers:
 *   - Overview stats (titles/copies/available/borrowed/reserved/overdue)
 *   - Fine KPIs (generated/outstanding/paid)
 *   - Active borrower count
 *   - Condition distribution
 *   - Top-10 borrowers (with academic performance correlation)
 *   - Most/Least popular titles
 *   - Never-borrowed count
 *   - Borrow trend (last 30 days as a simple bar representation)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  BookOpen, TrendingUp, AlertTriangle, DollarSign,
  Users, Award, BarChart3, RefreshCw,
} from 'lucide-react-native';
import {
  ScreenHeader, Card, StatCard, ErrorBanner, Badge, EmptyState,
} from '@/components/ui';
import { api, LibraryAnalytics } from '@/services/api';
import { Colors, Spacing, Typography, Radius, ConditionColors } from '@/constants';
import { formatCurrency, truncate, conditionLabel } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [data,      setData]      = useState<LibraryAnalytics | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getAnalytics());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const handleRefresh = () => { setRefreshing(true); load(); };

  const o = data?.overview;

  return (
    <View style={{ flex:1, backgroundColor: Colors.paper }}>
      <ScreenHeader
        title="Analytics"
        subtitle="Library performance"
        right={
          <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={{ padding: Spacing[1] }}>
            <RefreshCw size={20} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {loading && !refreshing ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={Colors.teal} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.teal} />}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: insets.bottom + Spacing[8] }}
        >
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {/* ── Overview stats ──────────────────────────────────────── */}
          <View>
            <SectionTitle icon={<BookOpen size={14} color={Colors.teal} />}>Collection</SectionTitle>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap: Spacing[2] }}>
              <StatCard label="Titles" value={o?.totalTitles ?? 0} icon={<BookOpen />} style={{ minWidth: '47%' }} loading={loading} />
              <StatCard label="Copies" value={o?.totalCopies ?? 0} icon={<BookOpen />} style={{ minWidth: '47%' }} loading={loading} />
              <StatCard label="Available" value={o?.availableCopies ?? 0} icon={<BookOpen />} color={Colors.success} style={{ minWidth: '47%' }} loading={loading} />
              <StatCard label="Borrowed" value={o?.borrowedCopies ?? 0} icon={<BookOpen />} color={Colors.info} style={{ minWidth: '47%' }} loading={loading} />
              <StatCard label="Reserved" value={o?.reservedCopies ?? 0} icon={<BookOpen />} color={Colors.warn} style={{ minWidth: '47%' }} loading={loading} />
              <StatCard label="Overdue" value={o?.overdueCount ?? 0} icon={<AlertTriangle />} color={Colors.danger} style={{ minWidth: '47%' }} loading={loading} />
            </View>
          </View>

          {/* ── Borrower stats ──────────────────────────────────────── */}
          <View>
            <SectionTitle icon={<Users size={14} color={Colors.teal} />}>Borrowers</SectionTitle>
            <View style={{ flexDirection:'row', gap: Spacing[2] }}>
              <StatCard label="Active Cards" value={o?.activeCards ?? 0} icon={<Users />} style={{ flex:1 }} loading={loading} />
              <StatCard label="Active Borrowers" value={o?.activeBorrowers ?? 0} icon={<Users />} color={Colors.teal} style={{ flex:1 }} loading={loading} />
            </View>
          </View>

          {/* ── Fine KPIs ───────────────────────────────────────────── */}
          <View>
            <SectionTitle icon={<DollarSign size={14} color={Colors.teal} />}>Fine KPIs</SectionTitle>
            <View style={{ gap: Spacing[2] }}>
              <View style={{ flexDirection:'row', gap: Spacing[2] }}>
                <FineKpiCard label="Generated" amount={data?.fineKpis.totalGenerated ?? 0} color={Colors.danger} />
                <FineKpiCard label="Outstanding" amount={data?.fineKpis.totalOutstanding ?? 0} color={Colors.warn} />
                <FineKpiCard label="Collected" amount={data?.fineKpis.totalPaid ?? 0} color={Colors.success} />
              </View>
            </View>
          </View>

          {/* ── Borrow trend (last 30 days) ─────────────────────────── */}
          {data?.borrowTrend && data.borrowTrend.length > 0 && (
            <View>
              <SectionTitle icon={<TrendingUp size={14} color={Colors.teal} />}>
                Borrow Trend (last {data.borrowTrend.length} days)
              </SectionTitle>
              <Card padding="none">
                <MiniBarChart
                  data={data.borrowTrend.map(d => ({ label: d.date.slice(5), value: d.borrows }))}
                  color={Colors.teal}
                />
              </Card>
            </View>
          )}

          {/* ── Top 10 borrowers ────────────────────────────────────── */}
          {data?.topBorrowers && data.topBorrowers.length > 0 && (
            <View>
              <SectionTitle icon={<Award size={14} color={Colors.teal} />}>Top Borrowers</SectionTitle>
              <Card padding="none">
                {data.topBorrowers.map((b, i) => (
                  <View key={b.studentId} style={{
                    flexDirection:'row', alignItems:'center', gap: Spacing[3],
                    padding: Spacing[3],
                    borderBottomWidth: i < data.topBorrowers.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.line,
                  }}>
                    <View style={{ width: 28, height: 28, borderRadius: Radius.full, backgroundColor: i < 3 ? Colors.teal50 : Colors.line, alignItems:'center', justifyContent:'center' }}>
                      <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: i < 3 ? Colors.teal : Colors.slateText }}>{i + 1}</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.ink }} numberOfLines={1}>{b.studentName}</Text>
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>{b.admissionNumber}</Text>
                    </View>
                    <View style={{ alignItems:'flex-end' }}>
                      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.teal }}>{b.borrowCount}</Text>
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted }}>borrows</Text>
                    </View>
                    {b.averageGrade != null && (
                      <View style={{ backgroundColor: Colors.successBg, paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
                        <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.success }}>
                          {b.averageGrade.toFixed(0)}%
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </Card>
            </View>
          )}

          {/* ── Popular / Unpopular titles ───────────────────────────── */}
          <View style={{ flexDirection:'row', gap: Spacing[3] }}>
            {data?.mostPopularTitles && data.mostPopularTitles.length > 0 && (
              <View style={{ flex:1 }}>
                <SectionTitle icon={<TrendingUp size={14} color={Colors.teal} />}>Most Popular</SectionTitle>
                <TitleList titles={data.mostPopularTitles} />
              </View>
            )}
            {data?.leastPopularTitles && data.leastPopularTitles.length > 0 && (
              <View style={{ flex:1 }}>
                <SectionTitle icon={<BarChart3 size={14} color={Colors.slateText} />}>Least Popular</SectionTitle>
                <TitleList titles={data.leastPopularTitles} dim />
              </View>
            )}
          </View>

          {/* ── Never borrowed ───────────────────────────────────────── */}
          {data?.neverBorrowedCount != null && (
            <Card>
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.ink }}>Never-borrowed titles</Text>
                <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.slateText }}>
                  {data.neverBorrowedCount}
                </Text>
              </View>
            </Card>
          )}

          {/* ── Condition distribution ───────────────────────────────── */}
          {data?.conditionDistribution && data.conditionDistribution.length > 0 && (
            <View>
              <SectionTitle icon={<BookOpen size={14} color={Colors.teal} />}>Copy Condition</SectionTitle>
              <Card>
                {data.conditionDistribution.map(c => {
                  const total = data.conditionDistribution.reduce((s, x) => s + x.count, 0);
                  const pct   = total > 0 ? (c.count / total) * 100 : 0;
                  const cols  = ConditionColors[c.condition] || { bg: Colors.line, text: Colors.slateText };
                  return (
                    <View key={c.condition} style={{ marginBottom: Spacing[3] }}>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom: Spacing[1] }}>
                        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>{conditionLabel(c.condition)}</Text>
                        <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }}>{c.count} ({pct.toFixed(0)}%)</Text>
                      </View>
                      <View style={{ height: 6, borderRadius: Radius.full, backgroundColor: Colors.line, overflow:'hidden' }}>
                        <View style={{ height: 6, width: `${pct}%`, borderRadius: Radius.full, backgroundColor: cols.text }} />
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: string }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], marginBottom: Spacing[2] }}>
      {icon}
      <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, textTransform:'uppercase', letterSpacing:0.8 }}>
        {children}
      </Text>
    </View>
  );
}

function FineKpiCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <View style={{ flex:1, backgroundColor: Colors.card, borderRadius: Radius.card, borderWidth:1, borderColor: Colors.line, padding: Spacing[3], alignItems:'center' }}>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText, marginBottom: Spacing[1] }}>{label}</Text>
      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color }} numberOfLines={1}>
        {formatCurrency(amount)}
      </Text>
    </View>
  );
}

function MiniBarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const last7 = data.slice(-14); // show last 14 days for readability
  return (
    <View style={{ padding: Spacing[4] }}>
      <View style={{ flexDirection:'row', alignItems:'flex-end', gap: 3, height: 60 }}>
        {last7.map((d, i) => (
          <View key={i} style={{ flex:1, alignItems:'center' }}>
            <View style={{ width:'100%', height: Math.max((d.value / max) * 52, 2), backgroundColor: color + (d.value > 0 ? '' : '30'), borderRadius: 2 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection:'row', marginTop: Spacing[1] }}>
        {last7.map((d, i) => (
          <Text key={i} style={{ flex:1, fontSize: 8, color: Colors.muted, textAlign:'center' }} numberOfLines={1}>
            {d.label.slice(3)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TitleList({ titles, dim = false }: { titles: { catalogueId: string; title: string; borrowCount: number }[]; dim?: boolean }) {
  return (
    <Card padding="none">
      {titles.slice(0, 5).map((t, i) => (
        <View key={t.catalogueId} style={{
          flexDirection:'row', alignItems:'center', gap: Spacing[2],
          padding: Spacing[3],
          borderBottomWidth: i < Math.min(titles.length, 5) - 1 ? 1 : 0,
          borderBottomColor: Colors.line,
        }}>
          <Text style={{ flex:1, fontSize: Typography.fontSize.xs, color: dim ? Colors.slateText : Colors.ink }} numberOfLines={2}>
            {t.title}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: dim ? Colors.muted : Colors.teal }}>
            {t.borrowCount}
          </Text>
        </View>
      ))}
    </Card>
  );
}
