/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  Download,
  Trash2,
  Play,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Info,
  Database,
  X
} from 'lucide-react';
import {
  EncodingScheme,
  SensorType,
  to8BitBinary,
  generateTxSamples,
  simulateChannelNoise,
  decodeRxSamples,
  SAMPLES_PER_BIT
} from '../utils/lineCoding';
import {
  SensorRecord,
  parseSensorCsv,
  downloadSampleCsvFile
} from '../utils/csvHandler';
import {
  saveDataset,
  loadDataset,
  deleteDataset
} from '../utils/datasetStorage';

export interface DatasetMetrics {
  datasetName: string;
  totalRecords: number;
  validRecords: number;
  processedRecords: number;
  totalBits: number;
  correctBits: number;
  bitErrors: number;
  berPercent: string;
  bitAccuracyPercent: string;
  correctlyRecoveredRecords: number;
  dataRecoveryAccuracyPercent: string;
  processingTimeMs: string;
  processingRatePerSec: number;
}

export interface EncodingComparisonRow {
  scheme: EncodingScheme;
  bitErrors: number;
  berPercent: string;
  bitAccuracyPercent: string;
  dataRecoveryAccuracyPercent: string;
}

export interface ProcessedReading {
  runLabel: string;
  timestamp: string;
  sensorType: string;
  sensorId: string;
  originalValue: number;
  unit: string;
  case?: string;
  run?: string;
  VB?: string;
  quantizedValue: number;
  txBinary: string;
  rxBinary: string;
  recoveredQuantizedValue: number;
  recoveredValue: number;
  bitErrors: number;
  status: 'CORRECT' | 'ERROR';
}

interface DatasetEvaluationProps {
  onLoadRowToSingleSim: (sensorType: SensorType, value: number, sensorId?: string) => void;
}

export default function DatasetEvaluation({ onLoadRowToSingleSim }: DatasetEvaluationProps) {
  // Dataset state (restored from IndexedDB or set via upload)
  const [datasetRecords, setDatasetRecords] = useState<SensorRecord[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isNasaDataset, setIsNasaDataset] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Dynamic range calculated from uploaded data
  const [minValue, setMinValue] = useState<number>(0);
  const [maxValue, setMaxValue] = useState<number>(1);

  // Storage status state
  const [isSavedInStorage, setIsSavedInStorage] = useState<boolean>(false);
  const [isStorageLoading, setIsStorageLoading] = useState<boolean>(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState<boolean>(false);

  // Controls
  const [selectedEncoding, setSelectedEncoding] = useState<EncodingScheme>('Bipolar AMI');
  const [noisePercent, setNoisePercent] = useState<number>(10);

  // Pagination for tables
  const [previewPage, setPreviewPage] = useState<number>(0);
  const [resultsPage, setResultsPage] = useState<number>(0);
  const ROWS_PER_PAGE = 8;

  // Evaluation results state
  const [metrics, setMetrics] = useState<DatasetMetrics | null>(null);
  const [processedReadings, setProcessedReadings] = useState<ProcessedReading[]>([]);
  const [comparisonTable, setComparisonTable] = useState<EncodingComparisonRow[] | null>(null);

  const validRecords = useMemo(() => {
    return datasetRecords.filter((r) => r.isValid);
  }, [datasetRecords]);

  // ==================================================
  // 1. RESTORE DATASET FROM INDEXEDDB ON MOUNT / REFRESH
  // ==================================================
  useEffect(() => {
    let isMounted = true;

    async function restoreFromStorage() {
      try {
        setIsStorageLoading(true);
        const stored = await loadDataset();

        if (!isMounted) return;

        if (stored && stored.records && Array.isArray(stored.records) && stored.records.length > 0) {
          setDatasetRecords(stored.records);
          setFileName(stored.fileName || 'stored_dataset.csv');
          setIsNasaDataset(Boolean(stored.isNasaMillingDataset));
          setMinValue(typeof stored.minValue === 'number' ? stored.minValue : 0);
          setMaxValue(typeof stored.maxValue === 'number' ? stored.maxValue : 1);
          setIsSavedInStorage(true);
          setStorageNotice(`Restored saved dataset from browser storage: ${stored.fileName} (${stored.records.length} records)`);
          setTimeout(() => {
            if (isMounted) setStorageNotice(null);
          }, 4500);
        } else if (stored) {
          // Stored data exists but is corrupted or empty
          await deleteDataset();
          setStorageWarning('Saved dataset could not be restored. Please upload the CSV again.');
        }
      } catch (err) {
        console.warn('Could not restore dataset from IndexedDB:', err);
        setStorageWarning('Saved dataset could not be restored. Please upload the CSV again.');
      } finally {
        if (isMounted) setIsStorageLoading(false);
      }
    }

    restoreFromStorage();

    return () => {
      isMounted = false;
    };
  }, []);

  // ==================================================
  // 2. CSV UPLOAD HANDLER & PERSISTENCE
  // ==================================================
  const handleFileUpload = (file: File) => {
    setStorageWarning(null);
    setStorageNotice(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (text) {
        const parsed = parseSensorCsv(text, file.name);

        // Update component state
        setDatasetRecords(parsed.records);
        setFileName(file.name);
        setIsNasaDataset(parsed.isNasaMillingDataset);
        setMinValue(parsed.minValue);
        setMaxValue(parsed.maxValue);
        setPreviewPage(0);
        setResultsPage(0);
        setMetrics(null);
        setProcessedReadings([]);
        setComparisonTable(null);

        // Save to IndexedDB (replaces any previous dataset)
        try {
          const success = await saveDataset({
            fileName: file.name,
            csvContent: text,
            records: parsed.records,
            isNasaMillingDataset: parsed.isNasaMillingDataset,
            minValue: parsed.minValue,
            maxValue: parsed.maxValue
          });

          if (success) {
            setIsSavedInStorage(true);
            setStorageNotice(`Dataset "${file.name}" saved in browser storage (IndexedDB).`);
            setTimeout(() => setStorageNotice(null), 4000);
          } else {
            setIsSavedInStorage(false);
            setStorageWarning('Warning: Dataset loaded in memory, but could not be persisted to browser storage.');
          }
        } catch (err) {
          console.warn('Storage error on upload:', err);
          setIsSavedInStorage(false);
          setStorageWarning('Warning: Dataset loaded in memory, but could not be persisted to browser storage.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // ==================================================
  // 3. REMOVE SAVED DATASET FROM INDEXEDDB
  // ==================================================
  const handleConfirmRemoveDataset = async () => {
    try {
      await deleteDataset();
    } catch (err) {
      console.warn('Failed to delete dataset from IndexedDB:', err);
    }
    setDatasetRecords([]);
    setFileName('');
    setIsNasaDataset(false);
    setMinValue(0);
    setMaxValue(1);
    setMetrics(null);
    setProcessedReadings([]);
    setComparisonTable(null);
    setIsSavedInStorage(false);
    setShowConfirmDeleteModal(false);
    setStorageWarning(null);
    setStorageNotice(null);
  };

  // ==================================================
  // 4. RUN DATASET EVALUATION PIPELINE
  // ==================================================
  const handleRunDataset = () => {
    if (validRecords.length === 0) return;

    const t0 = performance.now();

    const rangeDiff = maxValue > minValue ? maxValue - minValue : 1;
    let totalBitErrors = 0;
    let correctlyRecoveredCount = 0;
    const readings: ProcessedReading[] = [];

    validRecords.forEach((record, index) => {
      const originalVal = record.numericValue;

      // 1. Normalization / Quantization:
      // normalizedValue = ((value - minValue) / (maxValue - minValue)) * 255
      const normalized = ((originalVal - minValue) / rangeDiff) * 255;
      const quantizedValue = Math.max(0, Math.min(255, Math.round(normalized)));

      // 2. Binary conversion (8-bit representation)
      const txBinary = to8BitBinary(quantizedValue);

      // 3. Line Encoding: generate transmitted samples
      const txSamples = generateTxSamples(txBinary, selectedEncoding, SAMPLES_PER_BIT);

      // 4. Communication Channel with noise simulation
      // Row seed ensures consistent reproducibility across experiments
      const rowSeed = 100 + index * 17;
      const rxSamples = simulateChannelNoise(txSamples, noisePercent, rowSeed);

      // 5. Receiver & Decoder
      const rxBinary = decodeRxSamples(rxSamples, selectedEncoding, 8, SAMPLES_PER_BIT);

      // Bit error count
      let rowBitErrors = 0;
      for (let b = 0; b < 8; b++) {
        if (txBinary[b] !== rxBinary[b]) {
          rowBitErrors++;
        }
      }
      totalBitErrors += rowBitErrors;

      const recoveredQuantizedValue = parseInt(rxBinary, 2) || 0;

      // 6. Inverse Normalization:
      // recoveredValue = (decodedValue / 255) * (maxValue - minValue) + minValue
      const recoveredVal = (recoveredQuantizedValue / 255) * rangeDiff + minValue;

      const isMatch = rowBitErrors === 0 && recoveredQuantizedValue === quantizedValue;
      if (isMatch) {
        correctlyRecoveredCount++;
      }

      readings.push({
        runLabel: record.runLabel,
        timestamp: record.timestamp,
        sensorType: String(record.sensorType),
        sensorId: record.sensorId,
        originalValue: originalVal,
        unit: record.unit,
        case: record.case,
        run: record.run,
        VB: record.VB,
        quantizedValue,
        txBinary,
        rxBinary,
        recoveredQuantizedValue,
        recoveredValue: recoveredVal,
        bitErrors: rowBitErrors,
        status: isMatch ? 'CORRECT' : 'ERROR'
      });
    });

    const t1 = performance.now();
    const elapsedMs = Math.max(0.1, t1 - t0);
    const recordsPerSec = Math.round((validRecords.length / elapsedMs) * 1000);

    const totalBits = validRecords.length * 8;
    const correctBits = totalBits - totalBitErrors;
    const ber = totalBits > 0 ? (totalBitErrors / totalBits) * 100 : 0;
    const bitAccuracy = totalBits > 0 ? (correctBits / totalBits) * 100 : 100;
    const dataRecoveryAccuracy = validRecords.length > 0 ? (correctlyRecoveredCount / validRecords.length) * 100 : 100;

    setMetrics({
      datasetName: fileName || 'Uploaded Sensor Dataset',
      totalRecords: datasetRecords.length,
      validRecords: validRecords.length,
      processedRecords: validRecords.length,
      totalBits,
      correctBits,
      bitErrors: totalBitErrors,
      berPercent: ber.toFixed(2) + '%',
      bitAccuracyPercent: bitAccuracy.toFixed(2) + '%',
      correctlyRecoveredRecords: correctlyRecoveredCount,
      dataRecoveryAccuracyPercent: dataRecoveryAccuracy.toFixed(2) + '%',
      processingTimeMs: elapsedMs.toFixed(1) + ' ms',
      processingRatePerSec: recordsPerSec
    });

    setProcessedReadings(readings);
    setComparisonTable(null);
    setResultsPage(0);
  };

  // Compare Encodings (Polar NRZ-L, Polar RZ, Bipolar AMI) on the EXACT same dataset and normalization
  const handleCompareEncodings = () => {
    if (validRecords.length === 0) return;

    const schemes: EncodingScheme[] = ['Polar NRZ-L', 'Polar RZ', 'Bipolar AMI'];
    const rangeDiff = maxValue > minValue ? maxValue - minValue : 1;
    const rows: EncodingComparisonRow[] = [];

    schemes.forEach((scheme) => {
      let totalBitErrors = 0;
      let correctlyRecoveredCount = 0;

      validRecords.forEach((record, index) => {
        const originalVal = record.numericValue;
        const normalized = ((originalVal - minValue) / rangeDiff) * 255;
        const quantizedValue = Math.max(0, Math.min(255, Math.round(normalized)));
        const txBinary = to8BitBinary(quantizedValue);

        const txSamples = generateTxSamples(txBinary, scheme, SAMPLES_PER_BIT);
        const rowSeed = 100 + index * 17;
        const rxSamples = simulateChannelNoise(txSamples, noisePercent, rowSeed);
        const rxBinary = decodeRxSamples(rxSamples, scheme, 8, SAMPLES_PER_BIT);

        let rowBitErrors = 0;
        for (let b = 0; b < 8; b++) {
          if (txBinary[b] !== rxBinary[b]) {
            rowBitErrors++;
          }
        }
        totalBitErrors += rowBitErrors;

        const recoveredQuantized = parseInt(rxBinary, 2) || 0;
        if (rowBitErrors === 0 && recoveredQuantized === quantizedValue) {
          correctlyRecoveredCount++;
        }
      });

      const totalBits = validRecords.length * 8;
      const correctBits = totalBits - totalBitErrors;
      const ber = totalBits > 0 ? (totalBitErrors / totalBits) * 100 : 0;
      const bitAccuracy = totalBits > 0 ? (correctBits / totalBits) * 100 : 100;
      const dataRecoveryAccuracy = validRecords.length > 0 ? (correctlyRecoveredCount / validRecords.length) * 100 : 100;

      rows.push({
        scheme,
        bitErrors: totalBitErrors,
        berPercent: ber.toFixed(2) + '%',
        bitAccuracyPercent: bitAccuracy.toFixed(2) + '%',
        dataRecoveryAccuracyPercent: dataRecoveryAccuracy.toFixed(2) + '%'
      });
    });

    setComparisonTable(rows);
  };

  // Pagination
  const totalPreviewPages = Math.ceil(datasetRecords.length / ROWS_PER_PAGE) || 1;
  const pagedPreviewRecords = datasetRecords.slice(previewPage * ROWS_PER_PAGE, (previewPage + 1) * ROWS_PER_PAGE);

  const totalResultsPages = Math.ceil(processedReadings.length / ROWS_PER_PAGE) || 1;
  const pagedProcessedReadings = processedReadings.slice(resultsPage * ROWS_PER_PAGE, (resultsPage + 1) * ROWS_PER_PAGE);

  return (
    <div className="space-y-4">

      {/* Confirmation Modal for "Remove Saved Dataset" */}
      {showConfirmDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0b1320] border border-[#1c304a] rounded-xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Remove Saved Dataset?
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently remove the saved dataset{' '}
              <span className="font-mono text-cyan-300 font-bold">&ldquo;{fileName}&rdquo;</span>{' '}
              from your browser&apos;s local storage (IndexedDB). You will need to upload a CSV again to evaluate it.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDeleteModal(false)}
                className="px-3.5 py-1.5 bg-[#070e18] hover:bg-[#121f31] border border-[#1c304a] text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveDataset}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow"
              >
                Yes, Remove Dataset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 1. DATASET UPLOAD & INFORMATION CARD               */}
      {/* ================================================== */}
      <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#16253b] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-500/40 text-purple-400 flex items-center justify-center shrink-0 shadow-inner">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Dataset-Based Sensor Communication Evaluation
                </h2>
                {isSavedInStorage && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/70 border border-emerald-700/60 text-emerald-400">
                    <Database className="w-3 h-3 text-emerald-400" />
                    Persisted in IndexedDB
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluate line coding transmission on recorded industrial sensor data. Datasets are saved locally in IndexedDB.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadSampleCsvFile}
              className="px-3 py-1.5 bg-[#0e1f33] hover:bg-[#142c4a] border border-[#1c304a] text-slate-300 hover:text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download simulated sample dataset for testing"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              Download Sample Dataset (Simulated — For Testing Only)
            </button>

            {datasetRecords.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmDeleteModal(true)}
                className="px-3 py-1.5 bg-[#070e18] hover:bg-rose-950/50 border border-rose-900/60 text-rose-300 hover:text-rose-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Permanently remove saved dataset from IndexedDB browser storage"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Remove Saved Dataset
              </button>
            )}
          </div>
        </div>

        {/* Notifications: Warning or Success */}
        {storageNotice && (
          <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{storageNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setStorageNotice(null)}
              className="text-emerald-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {storageWarning && (
          <div className="bg-amber-950/60 border border-amber-700/60 text-amber-300 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{storageWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setStorageWarning(null)}
              className="text-amber-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Upload Zone / Active Dataset Card */}
        {datasetRecords.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 transition-all text-center ${
              isDragOver
                ? 'border-cyan-400 bg-cyan-950/30'
                : 'border-[#1f334f] bg-[#070e18] hover:border-slate-500'
            }`}
          >
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl bg-[#0e1f33] border border-[#213a5b] text-cyan-400 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">No dataset uploaded</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload your recorded sensor CSV (e.g., NASA Milling Machine Spindle Vibration dataset) to evaluate line coding transmission.
                  The file will be saved locally in IndexedDB so it remains available when you refresh.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-colors shadow">
                <Upload className="w-4 h-4" />
                UPLOAD SENSOR CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden"
                />
              </label>

              <div className="text-[11px] text-slate-500 font-mono">
                Supports columns: timestamp, sensor_type, sensor_id, value, unit, status (and milling telemetry).
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active Dataset Status & NASA Information Card */}
            <div className="bg-[#070e18] border border-[#17273d] rounded-xl p-3.5 sm:p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#142337] pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Active Dataset:
                  </span>
                  <span className="font-mono text-cyan-300 font-bold text-xs bg-[#0b1320] px-2.5 py-0.5 rounded border border-[#1c304a]">
                    {fileName}
                  </span>
                  <span className="text-slate-400 text-xs">
                    ({datasetRecords.length} Total Records, {validRecords.length} Valid Numeric Records)
                  </span>
                  {isSavedInStorage && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/70 border border-emerald-700/60 text-emerald-400">
                      <Database className="w-3 h-3 text-emerald-400" />
                      Saved in IndexedDB
                    </span>
                  )}
                </div>

                <label className="px-3 py-1 bg-[#0b1320] hover:bg-[#102035] border border-[#1c304a] text-cyan-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors self-start md:self-auto">
                  Upload Different CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Dataset Information Section (Academic & Accurate) */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-[#0b1320] border border-[#1c304a] p-2.5 rounded-lg">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold">Dataset</span>
                  <span className="text-white font-semibold mt-0.5 block">
                    {isNasaDataset ? 'NASA Milling Machine Dataset' : 'Recorded Sensor Dataset'}
                  </span>
                </div>

                <div className="bg-[#0b1320] border border-[#1c304a] p-2.5 rounded-lg">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold">Sensor</span>
                  <span className="text-cyan-300 font-semibold mt-0.5 block">
                    {validRecords[0]?.sensorType || 'Spindle Vibration'}
                  </span>
                </div>

                <div className="bg-[#0b1320] border border-[#1c304a] p-2.5 rounded-lg">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold">Source</span>
                  <span className="text-slate-300 font-semibold mt-0.5 block">
                    {isNasaDataset
                      ? 'NASA Prognostics Center of Excellence (UC Berkeley BEST Lab)'
                      : 'Recorded industrial/milling sensor data'}
                  </span>
                </div>

                <div className="bg-[#0b1320] border border-[#1c304a] p-2.5 rounded-lg font-mono">
                  <span className="block text-[10px] text-slate-400 uppercase font-sans font-bold">Actual Value Range</span>
                  <span className="text-emerald-400 font-bold mt-0.5 block text-xs">
                    [{minValue.toFixed(5)} &hellip; {maxValue.toFixed(5)}]
                  </span>
                </div>
              </div>
            </div>

            {/* ================================================== */}
            {/* DATA FLOW SUMMARY BANNER                           */}
            {/* ================================================== */}
            <div className="bg-[#070e18] border border-[#17273d] rounded-xl p-3 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-2 font-sans">
                <Info className="w-3.5 h-3.5" />
                Actual Communication Data Flow (No Machine Learning)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-[10px]">
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">1. Recorded Reading</span>
                  <span className="text-white font-bold block mt-0.5">Column &ldquo;value&rdquo;</span>
                </div>
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">2. Normalization</span>
                  <span className="text-cyan-400 font-bold block mt-0.5">8-bit (0–255)</span>
                </div>
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">3. Line Encoder</span>
                  <span className="text-purple-400 font-bold block mt-0.5">{selectedEncoding}</span>
                </div>
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">4. Channel Noise</span>
                  <span className="text-amber-400 font-bold block mt-0.5">{noisePercent}% Noise</span>
                </div>
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">5. Receiver Decoder</span>
                  <span className="text-emerald-400 font-bold block mt-0.5">Threshold Slicing</span>
                </div>
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">6. Inverse Norm</span>
                  <span className="text-emerald-300 font-bold block mt-0.5">Recovered Value</span>
                </div>
                <div className="p-2 rounded bg-[#0b1320] border border-[#1c304a]">
                  <span className="block text-slate-400 font-sans text-[9px] uppercase">7. Evaluation</span>
                  <span className="text-rose-400 font-bold block mt-0.5">BER &amp; Accuracy</span>
                </div>
              </div>
            </div>

            {/* Preview Table of Uploaded Records */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 uppercase tracking-wide text-[11px]">
                  Uploaded Dataset Records Preview ({datasetRecords.length} rows)
                </span>

                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                  <span>
                    Page {previewPage + 1} of {totalPreviewPages}
                  </span>
                  <button
                    type="button"
                    disabled={previewPage === 0}
                    onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    className="p-1 rounded bg-[#070e18] border border-[#1c304a] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={previewPage >= totalPreviewPages - 1}
                    onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))}
                    className="p-1 rounded bg-[#070e18] border border-[#1c304a] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#1c304a] rounded-lg">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-[#070e18] text-slate-300 border-b border-[#1c304a] text-[11px]">
                      <th className="p-2 text-left border-r border-[#1c304a]">Run</th>
                      <th className="p-2 text-left border-r border-[#1c304a]">Timestamp</th>
                      <th className="p-2 text-left border-r border-[#1c304a]">Sensor ID</th>
                      <th className="p-2 text-left border-r border-[#1c304a]">Sensor Type</th>
                      <th className="p-2 text-left border-r border-[#1c304a] text-cyan-300">
                        Recorded Value
                      </th>
                      <th className="p-2 text-left border-r border-[#1c304a]">Unit</th>
                      <th className="p-2 text-left border-r border-[#1c304a]">Status</th>
                      <th className="p-2 text-center">Live Oscilloscope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17273d] text-slate-200">
                    {pagedPreviewRecords.map((r) => (
                      <tr key={r.rowIndex} className="hover:bg-[#0c1626] transition-colors">
                        <td className="p-2 border-r border-[#1c304a] font-bold text-white">{r.runLabel}</td>
                        <td className="p-2 border-r border-[#1c304a] text-slate-300">{r.timestamp}</td>
                        <td className="p-2 border-r border-[#1c304a] text-slate-300">{r.sensorId}</td>
                        <td className="p-2 border-r border-[#1c304a] text-purple-300">{r.sensorType}</td>
                        <td className="p-2 border-r border-[#1c304a] font-bold text-cyan-400">
                          {r.rawValue}
                        </td>
                        <td className="p-2 border-r border-[#1c304a] text-slate-400">{r.unit}</td>
                        <td className="p-2 border-r border-[#1c304a]">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              r.status === 'NORMAL'
                                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                                : r.status === 'WARNING'
                                ? 'bg-amber-950/60 text-amber-400 border-amber-800'
                                : 'bg-rose-950/60 text-rose-400 border-rose-800'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const targetType: SensorType =
                                String(r.sensorType).includes('Spindle') || String(r.sensorType).includes('Vib')
                                  ? 'Spindle Vibration'
                                  : (r.sensorType as SensorType);
                              onLoadRowToSingleSim(targetType, r.numericValue, r.sensorId);
                            }}
                            className="px-2 py-1 bg-[#102238] hover:bg-cyan-600 border border-cyan-800/80 hover:border-cyan-500 text-cyan-300 hover:text-white text-[11px] font-semibold rounded cursor-pointer transition-colors"
                            title="Load reading into live waveform generator"
                          >
                            Simulate &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* 2. SIMULATION CONTROLS & EXPERIMENT RUNNER         */}
      {/* ================================================== */}
      {datasetRecords.length > 0 && (
        <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 border-b border-[#16253b] pb-3">
            <div className="w-5 h-5 rounded bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              <Sliders className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Communication System Controls &amp; Noise Experiment
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* 1. Line Encoding Selection */}
            <div className="bg-[#070e18] border border-[#1c304a] rounded-xl p-3.5 space-y-2">
              <span className="block text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                1. Select Line Encoding Scheme
              </span>
              <div className="space-y-1.5">
                {(['Bipolar AMI', 'Polar NRZ-L', 'Polar RZ'] as EncodingScheme[]).map((scheme) => (
                  <label
                    key={scheme}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedEncoding === scheme
                        ? 'border-cyan-500 bg-[#0c1f33]'
                        : 'border-[#1c304a] bg-[#070e18] hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="batchEncoding"
                      value={scheme}
                      checked={selectedEncoding === scheme}
                      onChange={() => setSelectedEncoding(scheme)}
                      className="accent-cyan-500"
                    />
                    <div>
                      <div className="font-bold text-white text-xs">{scheme}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {scheme === 'Bipolar AMI'
                          ? '0 V for binary 0; alternating +V / -V for binary 1s (Zero DC component)'
                          : scheme === 'Polar NRZ-L'
                          ? '+1 V for binary 1, -1 V for binary 0 (2-level)'
                          : 'Pulse returns to 0 V at half-bit interval'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 2. Channel Noise Level Slider & Presets */}
            <div className="bg-[#070e18] border border-[#1c304a] rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    2. Simulated Channel Noise
                  </span>
                  <span className="text-amber-400 font-bold font-mono text-sm">{noisePercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={noisePercent}
                  onChange={(e) => setNoisePercent(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-[#16253b] rounded-lg"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                  <span>0% (Ideal / Clean)</span>
                  <span>10% (Low Noise)</span>
                  <span>25% (Factory Noise)</span>
                  <span>50%+ (Severe Interference)</span>
                </div>

                {/* Noise Quick Chips */}
                <div className="grid grid-cols-4 gap-1.5 mt-3">
                  {[
                    { label: '0% Clean', val: 0 },
                    { label: '10% Low', val: 10 },
                    { label: '25% Factory', val: 25 },
                    { label: '50% Severe', val: 50 }
                  ].map((chip) => (
                    <button
                      key={chip.val}
                      type="button"
                      onClick={() => setNoisePercent(chip.val)}
                      className={`py-1 rounded text-[10px] font-mono font-bold border cursor-pointer transition-colors ${
                        noisePercent === chip.val
                          ? 'bg-amber-950 border-amber-500 text-amber-300'
                          : 'bg-[#0b1320] border-[#1c304a] text-slate-400 hover:text-white'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-slate-400 italic">
                At 0% noise, the simulated channel transfers all signals cleanly (BER = 0.00%, Data Recovery Accuracy = 100.00%).
              </p>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleRunDataset}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-md flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              Run Dataset
            </button>

            <button
              type="button"
              onClick={handleCompareEncodings}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-md flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Compare Encodings
            </button>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 3. EVALUATION RESULTS METRICS DASHBOARD            */}
      {/* ================================================== */}
      {metrics && (
        <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#16253b] pb-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                ✓
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Dataset Evaluation Results ({selectedEncoding} @ {noisePercent}% Channel Noise)
              </h3>
            </div>

            {/* Simulation Processing Performance */}
            <div className="text-right font-mono text-[11px] text-slate-400">
              <span className="text-slate-500 font-sans font-semibold mr-1">Simulation Processing Performance:</span>
              <span className="text-cyan-300 font-bold">{metrics.processingTimeMs}</span>
              <span className="mx-1.5 text-slate-600">&bull;</span>
              <span className="text-emerald-300 font-bold">{metrics.processingRatePerSec} records/sec</span>
            </div>
          </div>

          {/* Primary Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 font-mono text-center">
            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Total Records</span>
              <span className="text-base font-bold text-white mt-1 block">{metrics.totalRecords}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Valid Records</span>
              <span className="text-base font-bold text-white mt-1 block">{metrics.validRecords}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Total Bits</span>
              <span className="text-base font-bold text-cyan-400 mt-1 block">{metrics.totalBits}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Correct Bits</span>
              <span className="text-base font-bold text-emerald-400 mt-1 block">{metrics.correctBits}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Bit Errors</span>
              <span className="text-base font-bold text-rose-400 mt-1 block">{metrics.bitErrors}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">BER</span>
              <span className="text-base font-bold text-amber-400 mt-1 block">{metrics.berPercent}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Bit Accuracy</span>
              <span className="text-base font-bold text-cyan-300 mt-1 block">{metrics.bitAccuracyPercent}</span>
            </div>

            <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-xl">
              <span className="block text-[10px] text-slate-400 uppercase font-sans font-semibold">Data Recovery Accuracy</span>
              <span className="text-base font-bold text-emerald-300 mt-1 block">{metrics.dataRecoveryAccuracyPercent}</span>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 4. ENCODING COMPARISON TABLE                       */}
      {/* ================================================== */}
      {comparisonTable && (
        <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 border-b border-[#16253b] pb-3">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              📊
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Line Encoding Comparison on Uploaded Dataset (@ {noisePercent}% Channel Noise)
            </h3>
          </div>

          <div className="overflow-x-auto border border-[#1c304a] rounded-lg">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-[#070e18] text-slate-300 border-b border-[#1c304a]">
                  <th className="p-2.5 text-left border-r border-[#1c304a]">Encoding</th>
                  <th className="p-2.5 text-center border-r border-[#1c304a]">Bit Errors</th>
                  <th className="p-2.5 text-center border-r border-[#1c304a] text-amber-400">BER</th>
                  <th className="p-2.5 text-center border-r border-[#1c304a] text-cyan-400">Bit Accuracy</th>
                  <th className="p-2.5 text-center border-r border-[#1c304a] text-emerald-400">Data Recovery Accuracy</th>
                  <th className="p-2.5 text-left">Academic &amp; Technical Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17273d] text-slate-200">
                {comparisonTable.map((row) => (
                  <tr key={row.scheme} className="hover:bg-[#0c1626] transition-colors">
                    <td className="p-2.5 font-bold text-white border-r border-[#1c304a] flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        row.scheme === 'Bipolar AMI' ? 'bg-emerald-400' : 'bg-cyan-400'
                      }`} />
                      {row.scheme}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#1c304a] text-rose-400 font-bold">
                      {row.bitErrors}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#1c304a] text-amber-400 font-bold">
                      {row.berPercent}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#1c304a] text-cyan-300 font-bold">
                      {row.bitAccuracyPercent}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#1c304a] text-emerald-300 font-bold">
                      {row.dataRecoveryAccuracyPercent}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-300 font-sans">
                      {row.scheme === 'Bipolar AMI'
                        ? 'Bipolar AMI uses 0 V for binary 0 and alternating +V / -V levels for successive binary 1s, reducing the DC component.'
                        : row.scheme === 'Polar NRZ-L'
                        ? 'Polar NRZ-L uses +1 V for binary 1 and -1 V for binary 0, maintaining two voltage levels with high bandwidth efficiency.'
                        : 'Polar RZ returns to 0 V midway through each bit period, aiding symbol clock synchronization at the expense of bandwidth.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 5. PROCESSED SENSOR RECORDS RESULT TABLE           */}
      {/* ================================================== */}
      {processedReadings.length > 0 && (
        <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#16253b] pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Processed Records Table ({processedReadings.length} records evaluated)
              </h3>
              <p className="text-[11px] text-slate-400">
                Comparison of original sensor values, quantized 8-bit integers, transmitted binary, decoded binary, and recovered values.
              </p>
            </div>

            {/* Results pagination */}
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
              <span>
                Page {resultsPage + 1} of {totalResultsPages}
              </span>
              <button
                type="button"
                disabled={resultsPage === 0}
                onClick={() => setResultsPage((p) => Math.max(0, p - 1))}
                className="p-1 rounded bg-[#070e18] border border-[#1c304a] disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={resultsPage >= totalResultsPages - 1}
                onClick={() => setResultsPage((p) => Math.min(totalResultsPages - 1, p + 1))}
                className="p-1 rounded bg-[#070e18] border border-[#1c304a] disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-[#1c304a] rounded-lg">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-[#070e18] text-slate-300 border-b border-[#1c304a] text-[11px]">
                  <th className="p-2.5 text-left border-r border-[#1c304a]">Run</th>
                  <th className="p-2.5 text-left border-r border-[#1c304a] text-cyan-300">
                    Original Sensor Value
                  </th>
                  <th className="p-2.5 text-left border-r border-[#1c304a] text-purple-300">
                    8-bit Value
                  </th>
                  <th className="p-2.5 text-left border-r border-[#1c304a] text-cyan-400">
                    Transmitted Binary
                  </th>
                  <th className="p-2.5 text-left border-r border-[#1c304a] text-emerald-400">
                    Received Binary
                  </th>
                  <th className="p-2.5 text-left border-r border-[#1c304a] text-emerald-300">
                    Recovered Sensor Value
                  </th>
                  <th className="p-2.5 text-center border-r border-[#1c304a]">Status</th>
                  <th className="p-2.5 text-center">Live Oscilloscope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17273d] text-slate-200">
                {pagedProcessedReadings.map((p, idx) => (
                  <tr key={idx} className="hover:bg-[#0c1626] transition-colors">
                    <td className="p-2.5 border-r border-[#1c304a] font-bold text-white">
                      {p.runLabel}
                    </td>
                    <td className="p-2.5 border-r border-[#1c304a] font-bold text-cyan-400">
                      {p.originalValue}
                    </td>
                    <td className="p-2.5 border-r border-[#1c304a] text-purple-300 font-bold">
                      {p.quantizedValue}
                    </td>
                    <td className="p-2.5 border-r border-[#1c304a] font-mono text-cyan-400 tracking-wider">
                      {p.txBinary}
                    </td>
                    <td className="p-2.5 border-r border-[#1c304a] font-mono tracking-wider">
                      {p.rxBinary.split('').map((bit, bIdx) => (
                        <span
                          key={bIdx}
                          className={bit !== p.txBinary[bIdx] ? 'text-rose-400 font-black underline' : 'text-emerald-400'}
                        >
                          {bit}
                        </span>
                      ))}
                    </td>
                    <td className="p-2.5 border-r border-[#1c304a] font-bold text-white">
                      {p.recoveredValue.toFixed(5)}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#1c304a]">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          p.status === 'CORRECT'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            : 'bg-rose-950/60 text-rose-400 border-rose-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const targetType: SensorType =
                            String(p.sensorType).includes('Spindle') || String(p.sensorType).includes('Vib')
                              ? 'Spindle Vibration'
                              : (p.sensorType as SensorType);
                          onLoadRowToSingleSim(targetType, p.originalValue, p.sensorId);
                        }}
                        className="px-2 py-1 bg-[#102238] hover:bg-cyan-600 border border-cyan-800/80 hover:border-cyan-500 text-cyan-300 hover:text-white text-[11px] font-semibold rounded cursor-pointer transition-colors"
                        title="Simulate this reading in live waveform transmitter"
                      >
                        Simulate &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
