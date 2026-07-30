/**
 * Bulk Import Screen
 *
 * Accepts an Excel (.xlsx) or CSV file picked from device storage.
 * Parses rows client-side and previews them before submitting.
 * Expected columns (case-insensitive):
 *   title* | author | edition | isbn | subject | form | category |
 *   shelf  | book_number | publisher | language
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Upload, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react-native';
import {
  ScreenHeader, Card, Button, ErrorBanner, Badge, Toast, useToast,
} from '@/components/ui';
import { api, CreateCatalogueInput } from '@/services/api';
import { Colors, Spacing, Typography, Radius } from '@/constants';
import { truncate, getErrorMessage } from '@/lib/utils';

// ── CSV parser (no native deps needed for simple CSV) ────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/"/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }

  return rows;
}

function rowToCatalogueInput(row: Record<string, string>): CreateCatalogueInput | null {
  const title = row['title'] || row['book_title'] || row['name'] || '';
  if (!title.trim()) return null;

  return {
    title:      title.trim(),
    author:     row['author']?.trim()      || undefined,
    edition:    row['edition']?.trim()     || undefined,
    isbn:       row['isbn']?.trim()        || undefined,
    subject:    row['subject']?.trim()     || undefined,
    form:       row['form'] ? parseInt(row['form'], 10) || undefined : undefined,
    category:   row['category']?.trim().toUpperCase() || 'TEXTBOOK',
    shelf:      row['shelf']?.trim()       || undefined,
    publisher:  row['publisher']?.trim()   || undefined,
    bookNumber: row['book_number']?.trim() || undefined,
    language:   row['language']?.trim()    || 'English',
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

interface PreviewRow {
  index: number;
  input: CreateCatalogueInput | null;
  raw: Record<string, string>;
  error?: string;
}

export default function BulkImportScreen() {
  const router = useRouter();
  const { toastProps, show: showToast } = useToast();

  const [fileName,   setFileName]   = useState('');
  const [preview,    setPreview]    = useState<PreviewRow[]>([]);
  const [importing,  setImporting]  = useState(false);
  const [parsing,    setParsing]    = useState(false);
  const [result,     setResult]     = useState<{ created: number; errors: string[] } | null>(null);
  const [apiError,   setApiError]   = useState<string | null>(null);

  const validRows   = preview.filter(r => r.input && !r.error);
  const invalidRows = preview.filter(r => !r.input || r.error);

  // ── Pick file ─────────────────────────────────────────────────────────────

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setFileName(asset.name);
      setParsing(true);
      setPreview([]);
      setResult(null);
      setApiError(null);

      // Read file content
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Parse CSV
      const rows = parseCSV(content);

      if (rows.length === 0) {
        Alert.alert('Empty File', 'No data rows found. Make sure the file has a header row followed by data.');
        setParsing(false);
        return;
      }

      // Validate each row
      const previewRows: PreviewRow[] = rows.map((raw, index) => {
        const input = rowToCatalogueInput(raw);
        let error: string | undefined;
        if (!input) error = 'Missing required "title" field';
        else if (input.form && isNaN(input.form)) error = 'Invalid "form" value — must be a number';
        return { index: index + 1, input, raw, error };
      });

      setPreview(previewRows);
    } catch (err: any) {
      Alert.alert('Error', 'Could not read the file. Please try a CSV file.');
    } finally {
      setParsing(false);
    }
  };

  // ── Submit import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (validRows.length === 0) return;

    setImporting(true);
    setApiError(null);

    try {
      const inputs = validRows.map(r => r.input!);
      const importResult = await api.bulkImportCatalogues(inputs);
      setResult(importResult);
      showToast(`Imported ${importResult.created} books`, 'success');
    } catch (err: any) {
      setApiError(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <ScreenHeader title="Bulk Import" subtitle="Excel / CSV" showBack />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[16] }}>
        {/* ── Template info ──────────────────────────────────────── */}
        <Card>
          <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.ink, marginBottom: Spacing[2] }}>
            Required CSV Columns
          </Text>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText, lineHeight: 18 }}>
            <Text style={{ fontWeight: Typography.fontWeight.semibold }}>title</Text> (required), author, edition, isbn, subject, form, category, shelf, book_number, publisher, language
          </Text>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, marginTop: Spacing[2] }}>
            First row must be the header. Supported: .csv, .xlsx (CSV recommended)
          </Text>
        </Card>

        {/* ── File picker ────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handlePickFile}
          disabled={parsing || importing}
          style={{
            borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.teal,
            borderRadius: Radius.card,
            backgroundColor: Colors.teal50,
            paddingVertical: Spacing[10], paddingHorizontal: Spacing[6],
            alignItems: 'center', gap: Spacing[3],
          }}
        >
          {parsing ? (
            <ActivityIndicator size="large" color={Colors.teal} />
          ) : (
            <>
              <Upload size={32} color={Colors.teal} />
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.teal }}>
                {fileName ? 'Change File' : 'Pick CSV / Excel File'}
              </Text>
              {fileName ? (
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>
                  <FileText size={12} color={Colors.slateText} /> {truncate(fileName, 40)}
                </Text>
              ) : (
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted }}>Tap to browse your files</Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {apiError && (
          <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />
        )}

        {/* ── Result ─────────────────────────────────────────────── */}
        {result && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[3] }}>
              <CheckCircle2 size={20} color={Colors.success} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }}>
                Import Complete
              </Text>
            </View>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.slateText }}>
              {result.created} books added to catalogue.
            </Text>
            {result.errors.length > 0 && (
              <View style={{ marginTop: Spacing[3] }}>
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.danger, marginBottom: Spacing[2] }}>
                  {result.errors.length} errors:
                </Text>
                {result.errors.slice(0, 5).map((e, i) => (
                  <Text key={i} style={{ fontSize: Typography.fontSize.xs, color: Colors.danger }}>• {e}</Text>
                ))}
              </View>
            )}
            <Button
              label="Done"
              onPress={() => router.back()}
              style={{ marginTop: Spacing[4] }}
              fullWidth
            />
          </Card>
        )}

        {/* ── Preview table ───────────────────────────────────────── */}
        {preview.length > 0 && !result && (
          <View style={{ gap: Spacing[3] }}>
            {/* Summary badges */}
            <View style={{ flexDirection: 'row', gap: Spacing[2], alignItems: 'center' }}>
              <Badge label={`${validRows.length} valid`}   variant="success" />
              {invalidRows.length > 0 && (
                <Badge label={`${invalidRows.length} invalid`} variant="danger" />
              )}
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, flex: 1 }} numberOfLines={1}>
                from {fileName}
              </Text>
            </View>

            {/* Preview rows */}
            <Card padding="none">
              {preview.slice(0, 20).map((row, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
                    padding: Spacing[3],
                    borderBottomWidth: idx < Math.min(preview.length, 20) - 1 ? 1 : 0,
                    borderBottomColor: Colors.line,
                    backgroundColor: row.error ? Colors.dangerBg : Colors.card,
                  }}
                >
                  {row.error ? (
                    <AlertCircle size={16} color={Colors.danger} style={{ marginTop: 2 }} />
                  ) : (
                    <CheckCircle2 size={16} color={Colors.success} style={{ marginTop: 2 }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: row.error ? Colors.danger : Colors.ink }} numberOfLines={1}>
                      Row {row.index}: {row.input?.title || row.raw['title'] || '(empty)'}
                    </Text>
                    {row.input?.author && (
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }} numberOfLines={1}>
                        {row.input.author}{row.input.form ? ` · Form ${row.input.form}` : ''}
                      </Text>
                    )}
                    {row.error && (
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.danger }}>{row.error}</Text>
                    )}
                  </View>
                </View>
              ))}

              {preview.length > 20 && (
                <View style={{ padding: Spacing[3], alignItems: 'center' }}>
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted }}>
                    + {preview.length - 20} more rows
                  </Text>
                </View>
              )}
            </Card>

            {/* Import button */}
            {validRows.length > 0 && (
              <Button
                label={importing ? `Importing ${validRows.length} books…` : `Import ${validRows.length} Books`}
                onPress={handleImport}
                loading={importing}
                fullWidth
                style={{ marginTop: Spacing[2] }}
              />
            )}
          </View>
        )}
      </ScrollView>

      <Toast {...toastProps} />
    </View>
  );
}
