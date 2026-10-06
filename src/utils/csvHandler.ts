/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SensorType } from './lineCoding';

export interface SensorRecord {
  rowIndex: number;
  runLabel: string; // e.g., "Run 1" or timestamp
  timestamp: string;
  sensorType: SensorType | string;
  sensorId: string;
  rawValue: string;
  numericValue: number; // Actual decimal sensor reading from CSV
  unit: string;
  status: string;
  isValid: boolean;
  invalidReason?: string;

  // Optional telemetry columns if present in recorded dataset (e.g. NASA milling)
  case?: string;
  run?: string;
  VB?: string; // Tool flank wear measurement (if present)
  experiment_time?: string;
  DOC?: string; // Depth of cut
  feed?: string; // Feed rate
  material?: string; // Material code/name
}

export interface ParseResult {
  records: SensorRecord[];
  validCount: number;
  invalidCount: number;
  totalCount: number;
  headers: string[];
  detectedColumns: {
    valCol: number;
    typeCol: number;
    idCol: number;
    timeCol: number;
    unitCol: number;
    statusCol: number;
    caseCol: number;
    runCol: number;
    vbCol: number;
    expTimeCol: number;
    docCol: number;
    feedCol: number;
    materialCol: number;
  };
  isNasaMillingDataset: boolean;
  minValue: number;
  maxValue: number;
  fileName: string;
}

/**
 * Flexible & tolerant CSV parser for real recorded sensor datasets.
 * Automatically identifies sensor measurements and metadata without fabricating data.
 */
export function parseSensorCsv(
  csvText: string,
  fileName: string = 'uploaded_dataset.csv',
  customValCol: number = -1,
  customTypeCol: number = -1
): ParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      records: [],
      validCount: 0,
      invalidCount: 0,
      totalCount: 0,
      headers: [],
      detectedColumns: {
        valCol: -1,
        typeCol: -1,
        idCol: -1,
        timeCol: -1,
        unitCol: -1,
        statusCol: -1,
        caseCol: -1,
        runCol: -1,
        vbCol: -1,
        expTimeCol: -1,
        docCol: -1,
        feedCol: -1,
        materialCol: -1
      },
      isNasaMillingDataset: false,
      minValue: 0,
      maxValue: 1,
      fileName
    };
  }

  // Parse lines into cell arrays handling commas and quotes
  const rows = lines.map((line) => {
    const cells: string[] = [];
    let inQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim().replace(/^["']|["']$/g, ''));
    return cells;
  });

  const firstRow = rows[0];
  const hasHeader = firstRow.some((cell) => isNaN(Number(cell)) && /[a-zA-Z]/.test(cell));

  let headers: string[] = [];
  let dataRows = rows;

  let valCol = customValCol;
  let typeCol = customTypeCol;
  let idCol = -1;
  let timeCol = -1;
  let unitCol = -1;
  let statusCol = -1;
  let caseCol = -1;
  let runCol = -1;
  let vbCol = -1;
  let expTimeCol = -1;
  let docCol = -1;
  let feedCol = -1;
  let materialCol = -1;

  if (hasHeader) {
    headers = firstRow.map((h, i) => (h ? h.trim() : `Column_${i + 1}`));
    dataRows = rows.slice(1);

    headers.forEach((h, idx) => {
      const lower = h.toLowerCase().trim();

      // Main sensor measurement column detection
      if (valCol === -1) {
        if (
          lower === 'value' ||
          lower === 'val' ||
          lower === 'reading' ||
          lower === 'vib_spindle' ||
          lower === 'vibration' ||
          lower === 'sensor_value' ||
          lower === 'smcac' ||
          lower === 'smcdc' ||
          lower.includes('meas') ||
          lower.includes('metric')
        ) {
          valCol = idx;
        }
      }

      // Sensor type column
      if (typeCol === -1 && (lower.includes('type') || lower.includes('param') || lower.includes('feature'))) {
        typeCol = idx;
      }

      // Sensor ID column
      if (idCol === -1 && (lower.includes('id') || lower.includes('sensor_id') || lower.includes('node') || lower.includes('device'))) {
        idCol = idx;
      }

      // Timestamp column
      if (timeCol === -1 && (lower.includes('time') || lower.includes('date') || lower.includes('epoch') || lower === 'timestamp')) {
        timeCol = idx;
      }

      // Unit column
      if (unitCol === -1 && lower.includes('unit')) {
        unitCol = idx;
      }

      // Status column
      if (statusCol === -1 && (lower.includes('status') || lower.includes('health') || lower.includes('condition') || lower.includes('state'))) {
        statusCol = idx;
      }

      // Metadata columns (NASA milling, etc.)
      if (caseCol === -1 && (lower === 'case' || lower.includes('case_no') || lower.includes('case_id'))) {
        caseCol = idx;
      }
      if (runCol === -1 && (lower === 'run' || lower.includes('run_no') || lower.includes('pass'))) {
        runCol = idx;
      }
      if (vbCol === -1 && (lower === 'vb' || lower.includes('flank_wear') || lower.includes('wear') || lower.includes('flankwear'))) {
        vbCol = idx;
      }
      if (expTimeCol === -1 && (lower.includes('exp') || lower.includes('experiment_time') || lower === 'duration')) {
        expTimeCol = idx;
      }
      if (docCol === -1 && (lower === 'doc' || lower.includes('depth_of_cut') || lower.includes('depth'))) {
        docCol = idx;
      }
      if (feedCol === -1 && (lower === 'feed' || lower.includes('feed_rate'))) {
        feedCol = idx;
      }
      if (materialCol === -1 && (lower === 'material' || lower.includes('workpiece'))) {
        materialCol = idx;
      }
    });
  } else {
    headers = firstRow.map((_, i) => `Col_${i + 1}`);
  }

  // Fallback heuristic for value column if not explicitly named
  if (valCol === -1) {
    const sample = dataRows[0] || [];
    valCol = sample.findIndex((c) => !isNaN(Number(c)) && c.trim() !== '');
    if (valCol === -1) valCol = sample.length > 3 ? 3 : 0;
  }
  if (typeCol === -1) typeCol = -1;
  if (idCol === -1) idCol = -1;
  if (timeCol === -1) timeCol = 0;

  const isNasaMillingDataset =
    caseCol >= 0 ||
    runCol >= 0 ||
    vbCol >= 0 ||
    fileName.toLowerCase().includes('milling') ||
    fileName.toLowerCase().includes('nasa') ||
    headers.some((h) => {
      const l = h.toLowerCase();
      return l.includes('milling') || l.includes('vb') || l.includes('spindle') || l.includes('doc');
    });

  const records: SensorRecord[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let minDetected = Infinity;
  let maxDetected = -Infinity;

  dataRows.forEach((row, i) => {
    if (row.length === 0 || (row.length === 1 && row[0] === '')) return;

    const rawVal = row[valCol] !== undefined ? row[valCol].trim() : '';
    let rawType = typeCol >= 0 && row[typeCol] !== undefined ? row[typeCol].trim() : '';
    let rawId = idCol >= 0 && row[idCol] !== undefined ? row[idCol].trim() : '';
    const rawTime = timeCol >= 0 && row[timeCol] !== undefined ? row[timeCol].trim() : `${i + 1}`;
    let rawUnit = unitCol >= 0 && row[unitCol] !== undefined ? row[unitCol].trim() : '';
    let rawStatus = statusCol >= 0 && row[statusCol] !== undefined ? row[statusCol].trim() : 'NORMAL';

    const rawCase = caseCol >= 0 && row[caseCol] !== undefined ? row[caseCol].trim() : undefined;
    const rawRun = runCol >= 0 && row[runCol] !== undefined ? row[runCol].trim() : undefined;
    const rawVB = vbCol >= 0 && row[vbCol] !== undefined && row[vbCol].trim() !== '' ? row[vbCol].trim() : undefined;
    const rawExpTime = expTimeCol >= 0 && row[expTimeCol] !== undefined ? row[expTimeCol].trim() : undefined;
    const rawDOC = docCol >= 0 && row[docCol] !== undefined ? row[docCol].trim() : undefined;
    const rawFeed = feedCol >= 0 && row[feedCol] !== undefined ? row[feedCol].trim() : undefined;
    const rawMaterial = materialCol >= 0 && row[materialCol] !== undefined ? row[materialCol].trim() : undefined;

    // Normalize sensor type if known keyword matches
    let normalizedType: SensorType | string = rawType || 'Sensor';
    const lowerType = rawType.toLowerCase();
    if (lowerType.includes('spindle') || lowerType.includes('vib')) {
      normalizedType = 'Spindle Vibration';
    } else if (lowerType.includes('temp')) {
      normalizedType = 'Temperature';
    } else if (lowerType.includes('press')) {
      normalizedType = 'Pressure';
    } else if (lowerType.includes('hum')) {
      normalizedType = 'Humidity';
    }

    // Determine unit without fabricating unverified physical units
    let finalUnit = rawUnit;
    if (!finalUnit) {
      if (normalizedType === 'Spindle Vibration') {
        finalUnit = 'Dataset Units';
      } else if (normalizedType === 'Temperature') {
        finalUnit = '°C';
      } else if (normalizedType === 'Pressure') {
        finalUnit = 'bar';
      } else if (normalizedType === 'Humidity') {
        finalUnit = '%';
      } else {
        finalUnit = 'Dataset Units';
      }
    }

    if (!rawId) {
      rawId = `SENS-${i + 1}`;
    }

    let isValid = true;
    let invalidReason = '';
    const num = Number(rawVal);

    if (rawVal === '' || isNaN(num) || !isFinite(num)) {
      isValid = false;
      invalidReason = 'Non-numeric reading';
    } else {
      if (num < minDetected) minDetected = num;
      if (num > maxDetected) maxDetected = num;
    }

    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    const runLabel = rawRun ? `Run ${rawRun}` : `Run ${i + 1}`;

    records.push({
      rowIndex: i + 1,
      runLabel,
      timestamp: rawTime,
      sensorType: normalizedType,
      sensorId: rawId,
      rawValue: rawVal,
      numericValue: isValid ? num : 0,
      unit: finalUnit,
      status: rawStatus,
      isValid,
      invalidReason,
      case: rawCase,
      run: rawRun,
      VB: rawVB,
      experiment_time: rawExpTime,
      DOC: rawDOC,
      feed: rawFeed,
      material: rawMaterial
    });
  });

  if (minDetected === Infinity) minDetected = 0;
  if (maxDetected === -Infinity) maxDetected = 1;

  return {
    records,
    validCount,
    invalidCount,
    totalCount: records.length,
    headers,
    detectedColumns: {
      valCol,
      typeCol,
      idCol,
      timeCol,
      unitCol,
      statusCol,
      caseCol,
      runCol,
      vbCol,
      expTimeCol,
      docCol,
      feedCol,
      materialCol
    },
    isNasaMillingDataset,
    minValue: minDetected,
    maxValue: maxDetected,
    fileName
  };
}

/**
 * Generates an explicitly labeled simulated test dataset.
 * Labeled clearly as: "Simulated Sample Dataset — For Testing Only".
 */
export function generateSampleCsvContent(): string {
  const lines: string[] = [];
  lines.push('# Simulated Sample Dataset — For Testing Only');
  lines.push('timestamp,sensor_type,sensor_id,value,unit,status');

  const now = new Date('2026-10-06T10:00:00');

  for (let i = 0; i < 50; i++) {
    const time = new Date(now.getTime() + i * 60000);
    const timeStr = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(
      time.getDate()
    ).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

    const typeMod = i % 4;
    let sensorType = 'Temperature';
    let sensorId = 'TEMP-01';
    let unit = '°C';
    let val = 72.4;
    let status = 'NORMAL';

    if (typeMod === 0) {
      sensorType = 'Temperature';
      sensorId = 'TEMP-01';
      unit = '°C';
      val = Number((24.5 + Math.sin(i * 0.3) * 42.8).toFixed(2));
      status = val > 95 ? 'CRITICAL' : val > 80 ? 'WARNING' : 'NORMAL';
    } else if (typeMod === 1) {
      sensorType = 'Pressure';
      sensorId = 'PRESS-01';
      unit = 'bar';
      val = Number((3.2 + Math.cos(i * 0.4) * 4.1).toFixed(2));
      val = Math.max(0.5, val);
      status = val > 9.5 ? 'CRITICAL' : val > 8.0 ? 'WARNING' : 'NORMAL';
    } else if (typeMod === 2) {
      sensorType = 'Humidity';
      sensorId = 'HUM-01';
      unit = '%';
      val = Number((42.0 + Math.sin(i * 0.25) * 28.5).toFixed(2));
      status = val > 80 ? 'CRITICAL' : val > 70 ? 'WARNING' : 'NORMAL';
    } else {
      sensorType = 'Spindle Vibration';
      sensorId = 'VIB-01';
      unit = 'Dataset Units';
      val = Number((0.25 + Math.sin(i * 0.5) * 0.15).toFixed(5));
      status = 'NORMAL';
    }

    lines.push(`${timeStr},${sensorType},${sensorId},${val},${unit},${status}`);
  }

  return lines.join('\n');
}

/**
 * Browser file download of the simulated sample dataset.
 * Labeled clearly as: "Simulated Sample Dataset — For Testing Only".
 */
export function downloadSampleCsvFile(): void {
  const content = generateSampleCsvContent();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'simulated_sample_dataset_testing.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
