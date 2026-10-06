/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core Line Encoding & Communication Channel Logic
 * Shared between Single Sensor Simulator and Dataset Evaluator
 */

export type EncodingScheme = 'Polar NRZ-L' | 'Polar RZ' | 'Bipolar AMI';
export type SensorType = 'Temperature' | 'Pressure' | 'Humidity' | 'Vibration' | 'Spindle Vibration';

export const SAMPLES_PER_BIT = 40;

/**
 * Quantize continuous/decimal physical sensor measurement to an 8-bit integer (0–255)
 */
export function quantizePhysicalValue(val: number, minVal: number, maxVal: number): number {
  if (maxVal <= minVal) return Math.max(0, Math.min(255, Math.round(val)));
  const normalized = (val - minVal) / (maxVal - minVal);
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.round(clamped * 255);
}

/**
 * Reconstruct physical measurement from decoded 8-bit integer
 */
export function dequantizeToPhysical(quantized: number, minVal: number, maxVal: number): number {
  if (maxVal <= minVal) return minVal;
  const clampedQ = Math.max(0, Math.min(255, quantized));
  const recovered = (clampedQ / 255) * (maxVal - minVal) + minVal;
  return recovered;
}

/**
 * Converts integer (0-255) to 8-bit binary string
 */
export function to8BitBinary(val: number): string {
  const clamped = Math.max(0, Math.min(255, Math.floor(val)));
  return clamped.toString(2).padStart(8, '0');
}

/**
 * 1. Line Encoding: Generates voltage waveform samples
 */
export function generateTxSamples(
  binaryData: string,
  scheme: EncodingScheme,
  samplesPerBit: number = SAMPLES_PER_BIT
): number[] {
  const samples: number[] = [];
  let amiState = -1.0;
  const numBits = binaryData.length;

  for (let i = 0; i < numBits; i++) {
    const bit = binaryData[i];

    if (scheme === 'Polar NRZ-L') {
      // Polar NRZ-L: 1 -> +1V, 0 -> -1V
      const v = bit === '1' ? 1.0 : -1.0;
      for (let s = 0; s < samplesPerBit; s++) samples.push(v);
    } else if (scheme === 'Polar RZ') {
      // Polar RZ: 1 -> +1V then 0V, 0 -> -1V then 0V
      const half = samplesPerBit / 2;
      const v = bit === '1' ? 1.0 : -1.0;
      for (let s = 0; s < half; s++) samples.push(v);
      for (let s = half; s < samplesPerBit; s++) samples.push(0.0);
    } else if (scheme === 'Bipolar AMI') {
      // Bipolar AMI: 0 -> 0V, 1 alternates +1V and -1V
      let v = 0.0;
      if (bit === '1') {
        amiState = -amiState;
        v = amiState;
      } else {
        v = 0.0;
      }
      for (let s = 0; s < samplesPerBit; s++) samples.push(v);
    }
  }

  return samples;
}

/**
 * 2. Communication Channel: Add simulated Gaussian noise
 */
export function simulateChannelNoise(
  txSamples: number[],
  noisePercent: number,
  seed: number = 1
): number[] {
  const sigma = (noisePercent / 100) * 0.75;
  if (sigma === 0) {
    return txSamples.slice();
  }

  return txSamples.map((cleanV, idx) => {
    const u1 = Math.max(0.0001, (Math.sin(seed * 103 + idx * 17) + 1) / 2);
    const u2 = Math.max(0.0001, (Math.cos(seed * 211 + idx * 43) + 1) / 2);
    const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return cleanV + gaussian * sigma;
  });
}

/**
 * 3. Receiver Decoding: Slices and applies decision threshold
 */
export function decodeRxSamples(
  rxSamples: number[],
  scheme: EncodingScheme,
  numBits: number = 8,
  samplesPerBit: number = SAMPLES_PER_BIT
): string {
  const decodedArr: string[] = [];

  for (let i = 0; i < numBits; i++) {
    const start = i * samplesPerBit;
    const end = (i + 1) * samplesPerBit;
    const bitSlice = rxSamples.slice(start, end);

    let detectedBit = '0';

    if (scheme === 'Polar NRZ-L') {
      // Sample middle of bit (40% to 60%)
      const midSlice = bitSlice.slice(16, 24);
      const avg = midSlice.reduce((a, b) => a + b, 0) / midSlice.length;
      detectedBit = avg >= 0 ? '1' : '0';
    } else if (scheme === 'Polar RZ') {
      // Sample first half (active pulse period)
      const firstHalf = bitSlice.slice(6, 14);
      const avg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      detectedBit = avg >= 0 ? '1' : '0';
    } else if (scheme === 'Bipolar AMI') {
      // Sample middle: 0 is 0V, 1 is alternating +1V or -1V
      const midSlice = bitSlice.slice(16, 24);
      const avg = midSlice.reduce((a, b) => a + b, 0) / midSlice.length;
      detectedBit = Math.abs(avg) >= 0.5 ? '1' : '0';
    }

    decodedArr.push(detectedBit);
  }

  return decodedArr.join('');
}

/**
 * End-to-end evaluation of a single reading through the communication pipeline
 */
export interface SingleSimResult {
  originalValue: number;
  quantizedValue: number;
  originalBinary: string;
  decodedBinary: string;
  recoveredQuantizedValue: number;
  recoveredPhysicalValue: number;
  bitErrors: number;
  totalBits: number;
  ber: number;
  isDigitalExactMatch: boolean;
  absoluteError: number;
}

export function simulatePipeline(
  value: number,
  scheme: EncodingScheme,
  noisePercent: number,
  seed: number = 1,
  rangeMin: number = 0,
  rangeMax: number = 255
): SingleSimResult {
  // 1. Quantization: continuous physical value -> 8-bit integer (0 to 255)
  const quantizedValue = quantizePhysicalValue(value, rangeMin, rangeMax);
  const originalBinary = to8BitBinary(quantizedValue);

  // 2. Line Encoding & Noisy Channel Transmission
  const tx = generateTxSamples(originalBinary, scheme, SAMPLES_PER_BIT);
  const rx = simulateChannelNoise(tx, noisePercent, seed);

  // 3. Receiver Decoding
  const decodedBinary = decodeRxSamples(rx, scheme, originalBinary.length, SAMPLES_PER_BIT);

  let bitErrors = 0;
  for (let i = 0; i < originalBinary.length; i++) {
    if (originalBinary[i] !== decodedBinary[i]) {
      bitErrors++;
    }
  }

  const recoveredQuantizedValue = parseInt(decodedBinary, 2) || 0;
  // 4. De-quantization: recovered 8-bit integer -> physical measurement
  const recoveredPhysicalValue = dequantizeToPhysical(recoveredQuantizedValue, rangeMin, rangeMax);

  const isDigitalExactMatch = bitErrors === 0 && recoveredQuantizedValue === quantizedValue;
  const totalBits = originalBinary.length;
  const ber = totalBits > 0 ? bitErrors / totalBits : 0;
  const absoluteError = Math.abs(value - recoveredPhysicalValue);

  return {
    originalValue: value,
    quantizedValue,
    originalBinary,
    decodedBinary,
    recoveredQuantizedValue,
    recoveredPhysicalValue,
    bitErrors,
    totalBits,
    ber,
    isDigitalExactMatch,
    absoluteError
  };
}
