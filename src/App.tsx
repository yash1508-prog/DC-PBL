/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';

type EncodingScheme = 'Polar NRZ' | 'Polar RZ' | 'Bipolar AMI';

export default function App() {
  // Simple student project state
  const [temperatureInput, setTemperatureInput] = useState<string>('72');
  const [activeTemperature, setActiveTemperature] = useState<number>(72);
  const [selectedEncoding, setSelectedEncoding] = useState<EncodingScheme>('Bipolar AMI');
  const [activeEncoding, setActiveEncoding] = useState<EncodingScheme>('Bipolar AMI');
  const [noiseOption, setNoiseOption] = useState<'none' | 'noise'>('none');
  const [activeNoise, setActiveNoise] = useState<'none' | 'noise'>('none');
  const [noiseSeed, setNoiseSeed] = useState<number>(1);

  // Convert decimal to 8-bit binary
  const binaryData = useMemo(() => {
    const val = Math.max(0, Math.min(255, Math.floor(activeTemperature)));
    return val.toString(2).padStart(8, '0');
  }, [activeTemperature]);

  // Handle "Generate Signal" button click
  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(temperatureInput, 10);
    const validTemp = isNaN(num) ? 72 : Math.max(0, Math.min(255, num));
    setActiveTemperature(validTemp);
    setActiveEncoding(selectedEncoding);
    setActiveNoise(noiseOption);
    setNoiseSeed((s) => s + 1);
  };

  // Samples per bit for clean waveform rendering
  const SAMPLES_PER_BIT = 40;
  const numBits = binaryData.length;

  // 1. Generate Transmitted Waveform
  const txSamples = useMemo(() => {
    const samples: number[] = [];
    let amiState = -1.0;

    for (let i = 0; i < numBits; i++) {
      const bit = binaryData[i];
      if (activeEncoding === 'Polar NRZ') {
        const v = bit === '1' ? 1.0 : -1.0;
        for (let s = 0; s < SAMPLES_PER_BIT; s++) samples.push(v);
      } else if (activeEncoding === 'Polar RZ') {
        const half = SAMPLES_PER_BIT / 2;
        const v = bit === '1' ? 1.0 : -1.0;
        for (let s = 0; s < half; s++) samples.push(v);
        for (let s = half; s < SAMPLES_PER_BIT; s++) samples.push(0.0);
      } else if (activeEncoding === 'Bipolar AMI') {
        let v = 0.0;
        if (bit === '1') {
          amiState = -amiState;
          v = amiState;
        } else {
          v = 0.0;
        }
        for (let s = 0; s < SAMPLES_PER_BIT; s++) samples.push(v);
      }
    }
    return samples;
  }, [binaryData, activeEncoding, numBits]);

  // 2. Generate Received Waveform (Clean or Simple Noise)
  const rxSamples = useMemo(() => {
    if (activeNoise === 'none') {
      return txSamples.slice();
    }
    // Simple Gaussian noise simulation
    return txSamples.map((cleanV, idx) => {
      const u1 = Math.max(0.0001, (Math.sin(noiseSeed * 101 + idx * 13) + 1) / 2);
      const u2 = Math.max(0.0001, (Math.cos(noiseSeed * 202 + idx * 37) + 1) / 2);
      const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      return cleanV + gaussian * 0.42;
    });
  }, [txSamples, activeNoise, noiseSeed]);

  // 3. Receiver Decoding Logic
  const { receivedData, errorCount } = useMemo(() => {
    const decodedArr: string[] = [];
    let errors = 0;

    for (let i = 0; i < numBits; i++) {
      const start = i * SAMPLES_PER_BIT;
      const end = (i + 1) * SAMPLES_PER_BIT;
      const bitSlice = rxSamples.slice(start, end);

      let detectedBit = '0';
      if (activeEncoding === 'Polar NRZ') {
        // Sample middle of bit (16 to 24)
        const midSamples = bitSlice.slice(16, 24);
        const avg = midSamples.reduce((a, b) => a + b, 0) / midSamples.length;
        detectedBit = avg >= 0 ? '1' : '0';
      } else if (activeEncoding === 'Polar RZ') {
        // First half contains the pulse
        const firstHalf = bitSlice.slice(6, 14);
        const avg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        detectedBit = avg >= 0 ? '1' : '0';
      } else if (activeEncoding === 'Bipolar AMI') {
        // Sample middle of bit: 0 is at 0V, 1 is +1V or -1V
        const midSamples = bitSlice.slice(16, 24);
        const avg = midSamples.reduce((a, b) => a + b, 0) / midSamples.length;
        detectedBit = Math.abs(avg) >= 0.5 ? '1' : '0';
      }

      if (detectedBit !== binaryData[i]) {
        errors++;
      }
      decodedArr.push(detectedBit);
    }

    return {
      receivedData: decodedArr.join(''),
      errorCount: errors,
    };
  }, [rxSamples, activeEncoding, binaryData, numBits]);

  // Recovered decimal temperature
  const recoveredTemperature = useMemo(() => {
    return parseInt(receivedData, 2) || 0;
  }, [receivedData]);

  // Simple waveform plotter (clean student lab / matplotlib aesthetic)
  const drawWaveform = (samples: number[], strokeColor: string, isReceived: boolean) => {
    const width = 760;
    const height = 130;
    const padLeft = 45;
    const padRight = 20;
    const padTop = 22;
    const padBottom = 22;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const midY = padTop + plotH / 2;
    const scaleY = plotH / 3.2;

    const bitW = plotW / numBits;

    // Convert samples to SVG points
    const points = samples.map((v, i) => {
      const x = padLeft + (i / (samples.length - 1)) * plotW;
      const clamped = Math.max(-1.8, Math.min(1.8, v));
      const y = midY - clamped * scaleY;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto bg-white border border-gray-400 font-mono"
        style={{ shapeRendering: 'crispEdges' }}
      >
        {/* Voltage reference lines */}
        <line x1={padLeft} y1={midY - scaleY} x2={width - padRight} y2={midY - scaleY} stroke="#d1d5db" strokeDasharray="3 3" />
        <line x1={padLeft} y1={midY} x2={width - padRight} y2={midY} stroke="#9ca3af" strokeWidth="1" />
        <line x1={padLeft} y1={midY + scaleY} x2={width - padRight} y2={midY + scaleY} stroke="#d1d5db" strokeDasharray="3 3" />

        {/* Y-Axis Labels */}
        <text x={padLeft - 6} y={midY - scaleY + 4} textAnchor="end" fontSize="10" fill="#374151">+1V</text>
        <text x={padLeft - 6} y={midY + 4} textAnchor="end" fontSize="10" fill="#6b7280">0V</text>
        <text x={padLeft - 6} y={midY + scaleY + 4} textAnchor="end" fontSize="10" fill="#374151">-1V</text>

        {/* Bit boundaries and bit text on top */}
        {binaryData.split('').map((bit, idx) => {
          const bitX = padLeft + idx * bitW;
          const centerX = bitX + bitW / 2;
          const bitFlipped = isReceived && receivedData[idx] !== bit;

          return (
            <g key={idx}>
              {/* Vertical boundary */}
              <line
                x1={bitX}
                y1={padTop - 6}
                x2={bitX}
                y2={height - padBottom + 6}
                stroke="#9ca3af"
                strokeDasharray="4 2"
              />

              {/* Bit label above waveform */}
              <rect
                x={centerX - 10}
                y={2}
                width="20"
                height="15"
                fill={bitFlipped ? '#fecaca' : '#f3f4f6'}
                stroke={bitFlipped ? '#dc2626' : '#9ca3af'}
                strokeWidth="1"
              />
              <text
                x={centerX}
                y={13}
                textAnchor="middle"
                fontSize="11"
                fontWeight="bold"
                fill={bitFlipped ? '#b91c1c' : '#111827'}
              >
                {bit}
              </text>

              {/* Bit Interval marker below */}
              <text x={centerX} y={height - 5} textAnchor="middle" fontSize="9" fill="#6b7280">
                b{idx}
              </text>
            </g>
          );
        })}

        {/* Final right vertical line */}
        <line
          x1={padLeft + plotW}
          y1={padTop - 6}
          x2={padLeft + plotW}
          y2={height - padBottom + 6}
          stroke="#9ca3af"
          strokeDasharray="4 2"
        />

        {/* Waveform line */}
        <path
          d={`M ${points.join(' L ')}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          style={{ shapeRendering: 'auto' }}
        />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 py-6 px-4 font-sans">
      <div className="max-w-3xl mx-auto bg-white border border-gray-300 p-6 shadow-sm">
        {/* Project Header */}
        <div className="border-b border-gray-300 pb-3 mb-5 text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-gray-800">
            Industrial Sensor Data Transmission
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Polar and Bipolar Line Encoding (Data Communication PBL)
          </p>
        </div>

        {/* Simple Input Form */}
        <form onSubmit={handleGenerate} className="space-y-4 mb-6">
          {/* Temperature & Binary */}
          <div className="bg-gray-50 border border-gray-300 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Temperature:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={temperatureInput}
                    onChange={(e) => setTemperatureInput(e.target.value)}
                    className="w-24 px-2 py-1 border border-gray-400 bg-white font-mono text-base font-bold text-gray-800 focus:outline-none focus:border-black"
                  />
                  <span className="text-base font-bold text-gray-700">°C</span>
                </div>
              </div>

              <div>
                <span className="block text-sm font-bold text-gray-700 mb-1">
                  Binary Data:
                </span>
                <span className="inline-block px-3 py-1 bg-white border border-gray-400 font-mono text-base font-bold text-blue-700 tracking-wider">
                  {binaryData}
                </span>
              </div>
            </div>
          </div>

          {/* Select Encoding */}
          <div className="bg-gray-50 border border-gray-300 p-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Select Encoding:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="encoding"
                  value="Polar NRZ"
                  checked={selectedEncoding === 'Polar NRZ'}
                  onChange={() => setSelectedEncoding('Polar NRZ')}
                  className="cursor-pointer"
                />
                <span>Polar NRZ</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="encoding"
                  value="Polar RZ"
                  checked={selectedEncoding === 'Polar RZ'}
                  onChange={() => setSelectedEncoding('Polar RZ')}
                  className="cursor-pointer"
                />
                <span>Polar RZ</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="encoding"
                  value="Bipolar AMI"
                  checked={selectedEncoding === 'Bipolar AMI'}
                  onChange={() => setSelectedEncoding('Bipolar AMI')}
                  className="cursor-pointer"
                />
                <span>Bipolar AMI</span>
              </label>
            </div>
          </div>

          {/* Channel Noise (Simple) */}
          <div className="bg-gray-50 border border-gray-300 p-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Channel Condition:
            </label>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="noise"
                  value="none"
                  checked={noiseOption === 'none'}
                  onChange={() => setNoiseOption('none')}
                  className="cursor-pointer"
                />
                <span>No Noise (Clean Channel)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="noise"
                  value="noise"
                  checked={noiseOption === 'noise'}
                  onChange={() => setNoiseOption('noise')}
                  className="cursor-pointer"
                />
                <span>Simulate Noise</span>
              </label>
            </div>
          </div>

          {/* Generate Button */}
          <div>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm border border-blue-800 shadow-sm transition-colors cursor-pointer"
            >
              Generate Signal
            </button>
          </div>
        </form>

        <hr className="border-gray-300 my-6" />

        {/* TRANSMITTED SIGNAL */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold tracking-wider text-gray-800 uppercase">
              TRANSMITTED SIGNAL
            </h2>
            <span className="text-xs text-gray-600 font-mono">
              Encoding: <strong>{activeEncoding}</strong>
            </span>
          </div>

          {drawWaveform(txSamples, '#1d4ed8', false)}

          <div className="flex justify-between text-xs text-gray-600 mt-1 font-mono">
            <span>X-Axis: Time / Bit Intervals (0 to 8)</span>
            <span>
              {activeEncoding === 'Polar NRZ' && '1 = +1V, 0 = -1V'}
              {activeEncoding === 'Polar RZ' && '1 = +1V then 0V, 0 = -1V then 0V'}
              {activeEncoding === 'Bipolar AMI' && '0 = 0V, 1 = Alternate +1V / -1V'}
            </span>
          </div>
        </div>

        <hr className="border-gray-300 my-6" />

        {/* RECEIVED SIGNAL */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold tracking-wider text-gray-800 uppercase">
              RECEIVED SIGNAL
            </h2>
            <span className="text-xs text-gray-600 font-mono">
              Channel: <strong>{activeNoise === 'noise' ? 'Noisy' : 'Clean'}</strong>
            </span>
          </div>

          {drawWaveform(rxSamples, errorCount === 0 ? '#16a34a' : '#dc2626', true)}

          <div className="text-xs text-gray-600 mt-1 font-mono">
            {activeNoise === 'noise' && errorCount > 0 ? (
              <span className="text-red-700">
                * Note: Noise pushed the signal across the decision threshold, causing bit error(s) (highlighted in red).
              </span>
            ) : (
              <span>* Clean waveform successfully received at the monitoring end.</span>
            )}
          </div>
        </div>

        <hr className="border-gray-300 my-6" />

        {/* RESULT SECTION */}
        <div className="bg-gray-50 border border-gray-300 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 mb-3 border-b border-gray-300 pb-1">
            RESULT
          </h2>

          <div className="font-mono text-sm space-y-1.5 text-gray-800">
            <div>
              Original Data: <span className="font-bold">{binaryData}</span> ({activeTemperature}°C)
            </div>
            <div>
              Received Data: <span className="font-bold">{receivedData}</span> ({recoveredTemperature}°C)
            </div>
            <div className="pt-2 border-t border-gray-200 mt-2">
              Status:{' '}
              {errorCount === 0 ? (
                <span className="font-bold text-green-700">Successful (No Errors)</span>
              ) : (
                <span className="font-bold text-red-700">Error Detected ({errorCount} bit error)</span>
              )}
            </div>
          </div>
        </div>

        {/* Simple Footer */}
        <div className="mt-6 text-center text-xs text-gray-500 border-t border-gray-200 pt-3">
          First Year Engineering PBL Project • Polar &amp; Bipolar Line Encoding
        </div>
      </div>
    </div>
  );
}
