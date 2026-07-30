/**
 * Circulation Desk — 4-phase borrow/return/renew workflow
 *
 * Phase 1: Find student (search-as-you-type, 250ms debounce)
 * Phase 2: View student card (photo, status, fines, active borrows)
 * Phase 3: Find book (accession number or QR scan)
 * Phase 4: Policy evaluation → confirm action
 *
 * Matches the web circulate page pattern exactly.
 * Only ACTIVE library cards may borrow; all validation runs through
 * the /api/library/policies/evaluate endpoint before confirming.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Search, User, BookOpen, RotateCcw, CheckCircle2,
  AlertCircle, AlertTriangle, X, QrCode, ChevronRight,
} from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, Card, Badge, Avatar, Button,
  ErrorBanner, Toast, useToast, ConfirmModal,
} from '@/components/ui';
import { StudentListItem } from '@/components/library';
import {
  api, StudentHit, CardDetail, PolicyEvalResult, BorrowRow,
} from '@/services/api';
import { Colors, Spacing, Typography, Radius, CardStatusColors } from '@/constants';
import { useDebounce } from '@/hooks';
import { syncService } from '@/services/sync';
import {
  formatDate, formatCurrency, cardStatusLabel,
  isOverdue, daysOverdue, getErrorMessage,
} from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Phase = 'student' | 'card' | 'book' | 'eval' | 'done';
type Action = 'borrow' | 'return' | 'renew';

// Return sub-options
const RETURN_TYPES      = ['NORMAL','DAMAGED','LOST','REPLACEMENT_RECEIVED'] as const;
const RETURN_CONDITIONS = ['EXCELLENT','GOOD','FAIR','DAMAGED','LOST']       as const;

export default function CirculateScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ preloadStudentId?: string }>();
  const { toastProps, show: showToast } = useToast();

  // ── Phase state ────────────────────────────────────────────────────────
  const [phase,     setPhase]     = useState<Phase>('student');
  const [action,    setAction]    = useState<Action | null>(null);

  // Student search
  const [studentQuery,   setStudentQuery]   = useState('');
  const [studentResults, setStudentResults] = useState<StudentHit[]>([]);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [studentErr, setStudentErr]         = useState<string | null>(null);

  // Selected student + card detail
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [loadingCard,setLoadingCard]= useState(false);

  // Book search
  const [bookQuery,   setBookQuery]   = useState('');
  const [searchingBook, setSearchingBook] = useState(false);
  const [bookErr,     setBookErr]     = useState<string | null>(null);

  // Policy evaluation result
  const [evalResult, setEvalResult] = useState<PolicyEvalResult | null>(null);

  // Return-specific fields
  const [returnType,      setReturnType]      = useState<string>('NORMAL');
  const [returnCondition, setReturnCondition] = useState<string>('GOOD');
  const [returnNotes,     setReturnNotes]     = useState('');
  const [overrideReason,  setOverrideReason]  = useState('');

  // Confirm / acting
  const [showConfirm, setShowConfirm] = useState(false);
  const [acting,      setActing]      = useState(false);
  const [actionErr,   setActionErr]   = useState<string | null>(null);
  const [doneMsg,     setDoneMsg]     = useState('');

  const debStudentQuery = useDebounce(studentQuery, 250);
  const debBookQuery    = useDebounce(bookQuery,    300);

  // Pre-load student from card screen "Issue/Return" button
  useEffect(() => {
    if (params.preloadStudentId) loadCard(params.preloadStudentId);
  }, []); // eslint-disable-line

  // ── Student search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!debStudentQuery.trim() || phase !== 'student') { setStudentResults([]); return; }
    (async () => {
      setSearchingStudent(true); setStudentErr(null);
      try {
        const results = await api.searchStudents(debStudentQuery);
        setStudentResults(results);
      } catch (e: any) { setStudentErr(e.message); }
      finally { setSearchingStudent(false); }
    })();
  }, [debStudentQuery, phase]);

  // ── Book search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debBookQuery.trim() || phase !== 'book' || !cardDetail) return;
    lookupBook(debBookQuery);
  }, [debBookQuery]); // eslint-disable-line

  const loadCard = async (sid: string) => {
    setLoadingCard(true); setStudentErr(null);
    try {
      const data = await api.getCard(sid);
      setCardDetail(data);
      setPhase('card');
    } catch (e: any) { setStudentErr(e.message); }
    finally { setLoadingCard(false); }
  };

  const lookupBook = async (q: string) => {
    if (!cardDetail) return;
    setSearchingBook(true); setBookErr(null); setEvalResult(null); setAction(null);
    const accession = q.startsWith('BIDII:BOOK:') ? q.slice(11) : q.startsWith('BIDII:') ? q.slice(6) : q;
    try {
      const copies = await api.searchCopies(accession);
      const match  = copies.find(c => c.accessionNumber.toUpperCase() === accession.toUpperCase().trim());
      if (!match) { setBookErr(`No copy found for "${accession}"`); setSearchingBook(false); return; }
      const ev = await api.evaluatePolicy(cardDetail.student.id, match.id);
      setEvalResult({ ...ev, copy: match });
      setPhase('eval');
    } catch (e: any) { setBookErr(e.message); }
    finally { setSearchingBook(false); }
  };

  const reset = () => {
    setPhase('student'); setStudentQuery(''); setStudentResults([]);
    setCardDetail(null); setBookQuery(''); setEvalResult(null);
    setAction(null); setActionErr(null); setDoneMsg('');
    setReturnType('NORMAL'); setReturnCondition('GOOD'); setReturnNotes('');
    setOverrideReason('');
  };

  // ── Execute action ─────────────────────────────────────────────────────
  const executeAction = async () => {
    if (!cardDetail || !evalResult?.copy || !action) return;
    setActing(true); setActionErr(null);
    try {
      if (action === 'borrow') {
        const body: any = { studentId: cardDetail.student.id, copyId: evalResult.copy.id };
        if (!evalResult.allowed && overrideReason) body.overrideReason = overrideReason;
        const res = await api.borrow(body);
        const due = res.borrow?.dueAt;
        setDoneMsg(`"${evalResult.copy.catalogue?.title || evalResult.copy.accessionNumber}" issued — due ${formatDate(due)}.`);
      } else if (action === 'return') {
        const activeBorrow = cardDetail.card.borrows.find(
          b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy!.accessionNumber
        );
        if (!activeBorrow) throw new Error('No active borrow found for this copy');
        const res = await api.returnBook({
          borrowId: activeBorrow.id, returnType, returnCondition,
          notes: returnNotes || undefined,
        });
        setDoneMsg(`Returned. Fine: ${formatCurrency(res.totalFine ?? 0)}.`);
      } else {
        const activeBorrow = cardDetail.card.borrows.find(
          b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy!.accessionNumber
        );
        if (!activeBorrow) throw new Error('No active borrow found');
        const res = await api.renew(activeBorrow.id);
        setDoneMsg(`Renewed. New due date: ${formatDate(res.newDueAt)}.`);
      }
      setShowConfirm(false);
      setPhase('done');
    } catch (e: any) {
      // Queue offline if network failure
      if (e.status === 0 || e.message?.includes('Network')) {
        const activeBorrow = action !== 'borrow'
          ? cardDetail.card.borrows.find(b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy!.accessionNumber)
          : null;
        await syncService.queueOperation(action.toUpperCase() as any, 'borrow', activeBorrow?.id || 'new', {
          studentId: cardDetail.student.id,
          copyId: evalResult.copy.id,
          borrowId: activeBorrow?.id,
          returnType, returnCondition,
        });
        setDoneMsg(`Action queued offline — will sync when connected.`);
        setPhase('done');
      } else {
        setActionErr(getErrorMessage(e));
      }
    } finally {
      setActing(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────
  const copyStatus = evalResult?.copy?.status;
  const canBorrow  = copyStatus === 'AVAILABLE' || copyStatus === 'RESERVED';
  const canReturn  = copyStatus === 'BORROWED';
  const canRenew   = copyStatus === 'BORROWED' && (cardDetail?.settings.maxRenewals ?? 1) > 0;

  const hasOverdue = cardDetail?.card.borrows.some(b => !b.returnedAt && isOverdue(b.dueAt)) ?? false;
  const isCardActive = cardDetail?.card.status === 'ACTIVE';
  const blockedMsg = !isCardActive
    ? `Card is ${cardStatusLabel(cardDetail?.card.status ?? '')} — borrowing not allowed`
    : cardDetail && cardDetail.card.fineBalance > 0 ? `Fine balance: ${formatCurrency(cardDetail.card.fineBalance)}` : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <ScreenHeader
        title="Circulation Desk"
        subtitle={phase === 'student' ? 'Find student' : phase === 'card' ? cardDetail?.student.fullName : phase === 'book' ? 'Find book' : phase === 'eval' ? 'Confirm action' : 'Done'}
        right={
          phase !== 'student' ? (
            <TouchableOpacity onPress={reset} style={{ padding: Spacing[2] }} hitSlop={{ top:8,right:8,bottom:8,left:8 }}>
              <X size={20} color={Colors.white} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Phase indicator */}
      <PhaseBar phase={phase} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: insets.bottom + Spacing[10] }}>

        {/* ── PHASE 1: Student search ─────────────────────────────── */}
        {phase === 'student' && (
          <View style={{ gap: Spacing[3] }}>
            <SearchBar
              value={studentQuery}
              onChangeText={setStudentQuery}
              placeholder="Name or admission number…"
              loading={searchingStudent || loadingCard}
              autoFocus
            />
            {studentErr && <ErrorBanner message={studentErr} onDismiss={() => setStudentErr(null)} />}
            {studentResults.map(s => (
              <StudentListItem key={s.id} student={s} onPress={() => loadCard(s.id)} />
            ))}
            {!studentQuery && (
              <View style={{ alignItems: 'center', paddingTop: Spacing[10] }}>
                <User size={48} color={Colors.muted} />
                <Text style={{ color: Colors.muted, fontSize: Typography.fontSize.sm, marginTop: Spacing[3] }}>
                  Type a student's name or admission number
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/scan-modal')}
                  style={{ marginTop: Spacing[4], flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[4], paddingVertical: Spacing[2.5], borderRadius: Radius.button, backgroundColor: Colors.teal50, borderWidth: 1, borderColor: Colors.teal }}
                >
                  <QrCode size={18} color={Colors.teal} />
                  <Text style={{ color: Colors.teal, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold }}>
                    Scan QR Code Instead
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── PHASE 2: Student card panel ─────────────────────────── */}
        {(phase === 'card' || phase === 'book' || phase === 'eval' || phase === 'done') && cardDetail && (
          <StudentCardPanel detail={cardDetail} hasOverdue={hasOverdue} />
        )}

        {/* ── PHASE 2: Proceed to book ─────────────────────────────── */}
        {phase === 'card' && cardDetail && (
          <View style={{ gap: Spacing[3] }}>
            {blockedMsg && action === null && isCardActive && (
              <View style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], backgroundColor: Colors.warnBg, borderRadius: Radius.button, padding: Spacing[3] }}>
                <AlertTriangle size={16} color={Colors.warn} />
                <Text style={{ flex: 1, fontSize: Typography.fontSize.sm, color: Colors.warn }}>{blockedMsg}</Text>
              </View>
            )}
            {!isCardActive ? (
              <ErrorBanner message={`Cannot proceed — card is ${cardStatusLabel(cardDetail.card.status)}`} />
            ) : (
              <Button label="Find a Book →" onPress={() => setPhase('book')} fullWidth icon={<BookOpen size={16} color={Colors.white} />} />
            )}
          </View>
        )}

        {/* ── PHASE 3: Book search ──────────────────────────────────── */}
        {phase === 'book' && cardDetail && (
          <View style={{ gap: Spacing[3] }}>
            <SearchBar
              value={bookQuery}
              onChangeText={setBookQuery}
              placeholder="Accession number (e.g. ACC-00145)…"
              loading={searchingBook}
              autoFocus
            />
            {bookErr && <ErrorBanner message={bookErr} onDismiss={() => setBookErr(null)} />}
            <TouchableOpacity
              onPress={() => router.push('/scan-modal')}
              style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], padding: Spacing[3], borderRadius: Radius.button, backgroundColor: Colors.teal50, borderWidth: 1, borderColor: Colors.teal }}
            >
              <QrCode size={18} color={Colors.teal} />
              <Text style={{ color: Colors.teal, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold }}>Scan Book QR Code</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PHASE 4: Evaluation + action picker ──────────────────── */}
        {phase === 'eval' && evalResult && cardDetail && (
          <EvalPanel
            eval={evalResult} cardDetail={cardDetail}
            canBorrow={canBorrow} canReturn={canReturn} canRenew={canRenew}
            action={action} onSelectAction={setAction}
            returnType={returnType} onReturnType={setReturnType}
            returnCondition={returnCondition} onReturnCondition={setReturnCondition}
            returnNotes={returnNotes} onReturnNotes={setReturnNotes}
            overrideReason={overrideReason} onOverrideReason={setOverrideReason}
            onConfirm={() => setShowConfirm(true)}
            actionErr={actionErr}
          />
        )}

        {/* ── PHASE 5: Done ────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={{ gap: Spacing[4] }}>
            <View style={{ backgroundColor: Colors.successBg, borderRadius: Radius.card, padding: Spacing[6], alignItems: 'center', gap: Spacing[3] }}>
              <CheckCircle2 size={40} color={Colors.success} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink, textAlign: 'center' }}>
                {doneMsg}
              </Text>
            </View>
            <Button label="New Transaction" onPress={reset} fullWidth />
            <Button label="Another Book for Same Student" variant="secondary" onPress={() => { setPhase('book'); setBookQuery(''); setEvalResult(null); setAction(null); setActionErr(null); }} fullWidth />
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={showConfirm}
        title={action === 'borrow' ? 'Confirm Borrow' : action === 'return' ? 'Confirm Return' : 'Confirm Renewal'}
        message={
          action === 'borrow'
            ? `Issue "${evalResult?.copy?.catalogue?.title || evalResult?.copy?.accessionNumber}" to ${cardDetail?.student.fullName}?\nDue: ${evalResult?.dueAt ? formatDate(evalResult.dueAt) : '—'}`
            : action === 'return'
            ? `Return "${evalResult?.copy?.catalogue?.title || evalResult?.copy?.accessionNumber}" from ${cardDetail?.student.fullName}?`
            : `Renew "${evalResult?.copy?.catalogue?.title || evalResult?.copy?.accessionNumber}" for ${cardDetail?.student.fullName}?`
        }
        confirmLabel={action === 'borrow' ? 'Issue Book' : action === 'return' ? 'Return Book' : 'Renew'}
        onConfirm={executeAction}
        onCancel={() => setShowConfirm(false)}
        loading={acting}
      />

      <Toast {...toastProps} />
    </View>
  );
}

// ── PhaseBar ──────────────────────────────────────────────────────────────────

const PHASES: { id: Phase; label: string }[] = [
  { id: 'student', label: 'Student' },
  { id: 'card',    label: 'Card' },
  { id: 'book',    label: 'Book' },
  { id: 'eval',    label: 'Evaluate' },
  { id: 'done',    label: 'Done' },
];
const PHASE_ORDER: Phase[] = ['student','card','book','eval','done'];

function PhaseBar({ phase }: { phase: Phase }) {
  const current = PHASE_ORDER.indexOf(phase);
  return (
    <View style={{ flexDirection:'row', backgroundColor: Colors.card, borderBottomWidth:1, borderBottomColor: Colors.line, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] }}>
      {PHASES.map((p, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <React.Fragment key={p.id}>
            <View style={{ alignItems:'center', opacity: done || active ? 1 : 0.35 }}>
              <View style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: done ? Colors.success : active ? Colors.teal : Colors.line,
                alignItems:'center', justifyContent:'center',
              }}>
                {done
                  ? <CheckCircle2 size={14} color={Colors.white} />
                  : <Text style={{ fontSize: 11, fontWeight: '700', color: active ? Colors.white : Colors.slateText }}>{i + 1}</Text>
                }
              </View>
              <Text style={{ fontSize: Typography.fontSize.xs, marginTop: 2, color: active ? Colors.teal : Colors.slateText, fontWeight: active ? Typography.fontWeight.semibold : Typography.fontWeight.normal }}>
                {p.label}
              </Text>
            </View>
            {i < PHASES.length - 1 && (
              <View style={{ flex:1, height: 2, backgroundColor: i < current ? Colors.success : Colors.line, alignSelf:'center', marginHorizontal: Spacing[1], marginBottom: 14 }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── StudentCardPanel ──────────────────────────────────────────────────────────

function StudentCardPanel({ detail, hasOverdue }: { detail: CardDetail; hasOverdue: boolean }) {
  const { student, card } = detail;
  const statusColors = CardStatusColors[card.status] || { bg: Colors.line, text: Colors.slateText };
  return (
    <View style={{ backgroundColor: Colors.teal, borderRadius: Radius.card, padding: Spacing[4], flexDirection:'row', gap: Spacing[3] }}>
      <Avatar name={student.fullName} photoFileId={student.files[0]?.id} size="lg" />
      <View style={{ flex:1, gap: Spacing[1] }}>
        <Text style={{ color: Colors.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }} numberOfLines={1}>{student.fullName}</Text>
        <Text style={{ color: Colors.white + 'CC', fontSize: Typography.fontSize.xs }}>{student.admissionNumber} · {student.schoolClass.name}</Text>
        <View style={{ flexDirection:'row', gap: Spacing[2], marginTop: Spacing[1], flexWrap:'wrap' }}>
          <View style={{ backgroundColor: statusColors.bg, paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: statusColors.text }}>{cardStatusLabel(card.status)}</Text>
          </View>
          {card.fineBalance > 0 && (
            <View style={{ backgroundColor: Colors.dangerBg, paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.danger }}>Fine: {formatCurrency(card.fineBalance)}</Text>
            </View>
          )}
          {hasOverdue && (
            <View style={{ backgroundColor: Colors.warnBg, paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.warn }}>Overdue</Text>
            </View>
          )}
          <Text style={{ color: Colors.white + '99', fontSize: Typography.fontSize.xs }}>{card.currentBorrowCount} book{card.currentBorrowCount !== 1 ? 's' : ''} out</Text>
        </View>
      </View>
    </View>
  );
}

// ── EvalPanel ─────────────────────────────────────────────────────────────────

interface EvalPanelProps {
  eval: PolicyEvalResult; cardDetail: CardDetail;
  canBorrow: boolean; canReturn: boolean; canRenew: boolean;
  action: Action | null; onSelectAction: (a: Action) => void;
  returnType: string; onReturnType: (v: string) => void;
  returnCondition: string; onReturnCondition: (v: string) => void;
  returnNotes: string; onReturnNotes: (v: string) => void;
  overrideReason: string; onOverrideReason: (v: string) => void;
  onConfirm: () => void; actionErr: string | null;
}

function EvalPanel(p: EvalPanelProps) {
  const { eval: ev, canBorrow, canReturn, canRenew } = p;
  const copy = ev.copy;

  return (
    <View style={{ gap: Spacing[3] }}>
      {/* Copy summary */}
      <Card>
        <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, textTransform:'uppercase', letterSpacing:0.8, marginBottom: Spacing[2] }}>Book Found</Text>
        <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }} numberOfLines={1}>{copy?.catalogue?.title || copy?.accessionNumber}</Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText, marginTop: 2 }}>{copy?.accessionNumber} · {copy?.status} · {copy?.condition}</Text>
        {ev.dueAt && canBorrow && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.teal, marginTop: Spacing[2] }}>If borrowed → due {formatDate(ev.dueAt)}</Text>}
      </Card>

      {/* Policy warnings / blocks */}
      {ev.reasons.map((r, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], backgroundColor: Colors.dangerBg, borderRadius: Radius.button, padding: Spacing[3] }}>
          <AlertCircle size={16} color={Colors.danger} />
          <Text style={{ flex:1, fontSize: Typography.fontSize.sm, color: Colors.danger }}>{r}</Text>
        </View>
      ))}
      {ev.warnings.map((w, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], backgroundColor: Colors.warnBg, borderRadius: Radius.button, padding: Spacing[3] }}>
          <AlertTriangle size={16} color={Colors.warn} />
          <Text style={{ flex:1, fontSize: Typography.fontSize.sm, color: Colors.warn }}>{w}</Text>
        </View>
      ))}

      {/* Action buttons */}
      <View style={{ gap: Spacing[2] }}>
        {canBorrow && <ActionButton label="Borrow" active={p.action==='borrow'} onPress={() => p.onSelectAction('borrow')} color={Colors.teal} />}
        {canReturn && <ActionButton label="Return" active={p.action==='return'} onPress={() => p.onSelectAction('return')} color={Colors.success} />}
        {canRenew  && <ActionButton label="Renew"  active={p.action==='renew'}  onPress={() => p.onSelectAction('renew')}  color={Colors.info} />}
      </View>

      {/* Return sub-fields */}
      {p.action === 'return' && (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, marginBottom: Spacing[3], textTransform:'uppercase', letterSpacing:0.8 }}>Return Details</Text>
          <PillRow label="Return type"  options={RETURN_TYPES}      value={p.returnType}      onChange={p.onReturnType} />
          <View style={{ marginTop: Spacing[3] }}>
            <PillRow label="Condition on return" options={RETURN_CONDITIONS} value={p.returnCondition} onChange={p.onReturnCondition} />
          </View>
        </Card>
      )}

      {/* Override reason when policy blocks */}
      {p.action === 'borrow' && !ev.allowed && (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.warn, marginBottom: Spacing[2] }}>Override Required</Text>
          <TextInputField
            value={p.overrideReason} onChangeText={p.onOverrideReason}
            placeholder="Enter override reason (required for blocked borrows)"
          />
        </Card>
      )}

      {p.actionErr && <ErrorBanner message={p.actionErr} />}

      {p.action && (
        <Button
          label={p.action === 'borrow' ? 'Issue Book' : p.action === 'return' ? 'Return Book' : 'Renew Loan'}
          onPress={p.onConfirm}
          disabled={p.action === 'borrow' && !ev.allowed && !p.overrideReason.trim()}
          fullWidth
        />
      )}
    </View>
  );
}

function ActionButton({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        padding: Spacing[3], borderRadius: Radius.button, borderWidth: 2,
        borderColor: active ? color : Colors.line,
        backgroundColor: active ? color + '15' : Colors.card,
        flexDirection:'row', alignItems:'center', justifyContent:'space-between',
      }}
    >
      <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: active ? color : Colors.ink }}>{label}</Text>
      {active && <CheckCircle2 size={20} color={color} />}
    </TouchableOpacity>
  );
}

function PillRow({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, marginBottom: Spacing[2] }}>{label}</Text>
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap: Spacing[2] }}>
        {options.map(o => (
          <TouchableOpacity key={o} onPress={() => onChange(o)} style={{
            paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5], borderRadius: Radius.full,
            borderWidth:1, borderColor: value===o ? Colors.teal : Colors.line,
            backgroundColor: value===o ? Colors.teal50 : Colors.card,
          }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: value===o ? Colors.teal : Colors.slateText }}>
              {o.replace(/_/g,' ').charAt(0)+o.replace(/_/g,' ').slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

import { TextInput } from 'react-native';
function TextInputField({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={Colors.muted} multiline numberOfLines={2}
      style={{ borderWidth:1, borderColor: Colors.line, borderRadius: Radius.sm, padding: Spacing[3], fontSize: Typography.fontSize.sm, color: Colors.ink, minHeight: 60 }}
    />
  );
}
