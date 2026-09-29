/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Thermometer,
  Gauge,
  Activity,
  Droplets,
  Play,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Layers,
  ArrowRight
} from 'lucide-react';

type EncodingScheme = 'Polar NRZ-L' | 'Polar RZ' | 'Bipolar AMI';
type SensorType = 'Temperature' | 'Pressure' | 'Humidity' | 'Vibration';

export default function App() {
  // Sensor selection and input state
  const [sensorType, setSensorType] = useState<SensorType>('Temperature');
  const [sensorValueInput, setSensorValueInput] = useState<string>('72');

  // Active transmission states
  const [activeSensorType, setActiveSensorType] = useState<SensorType>('Temperature');
  const [activeValue, setActiveValue] = useState<number>(72);
  const [selectedEncoding, setSelectedEncoding] = useState<EncodingScheme>('Bipolar AMI');
  const [activeEncoding, setActiveEncoding] = useState<EncodingScheme>('Bipolar AMI');

  // Channel noise state (0% to 100%)
  const [noisePercent, setNoisePercent] = useState<number>(10);
  const [activeNoisePercent, setActiveNoisePercent] = useState<number>(10);
  const [noiseSeed, setNoiseSeed] = useState<number>(1);

  // Metadata helper for sensors
  const getSensorMeta = (type: SensorType) => {
    switch (type) {
      case 'Temperature':
        return { id: 'TEMP-01', typeCode: 'TEMP', unit: '°C', defaultVal: 72, range: '20 - 80 °C' };
      case 'Pressure':
        return { id: 'PRESS-01', typeCode: 'PRESS', unit: 'bar', defaultVal: 6, range: '2 - 8 bar' };
      case 'Humidity':
        return { id: 'HUM-01', typeCode: 'HUM', unit: '%', defaultVal: 55, range: '30 - 70 %' };
      case 'Vibration':
        return { id: 'VIB-01', typeCode: 'VIB', unit: 'mm/s', defaultVal: 3, range: '0 - 4 mm/s' };
    }
  };

  // Sensor threshold status check
  const getSensorStatus = (type: SensorType, val: number): 'NORMAL' | 'WARNING' | 'CRITICAL' => {
    if (type === 'Temperature') {
      if (val <= 80) return 'NORMAL';
      if (val <= 100) return 'WARNING';
      return 'CRITICAL';
    }
    if (type === 'Pressure') {
      if (val <= 8) return 'NORMAL';
      if (val <= 10) return 'WARNING';
      return 'CRITICAL';
    }
    if (type === 'Humidity') {
      if (val <= 70) return 'NORMAL';
      if (val <= 85) return 'WARNING';
      return 'CRITICAL';
    }
    // Vibration
    if (val <= 4) return 'NORMAL';
    if (val <= 7) return 'WARNING';
    return 'CRITICAL';
  };

  // Switch sensor type
  const handleSensorTypeChange = (type: SensorType) => {
    setSensorType(type);
    const meta = getSensorMeta(type);
    setSensorValueInput(meta.defaultVal.toString());
  };

  // Generate realistic random sensor value
  const handleGenerateRandom = () => {
    let rand = 72;
    if (sensorType === 'Temperature') {
      rand = Math.floor(Math.random() * (105 - 25 + 1)) + 25;
    } else if (sensorType === 'Pressure') {
      rand = Math.floor(Math.random() * (12 - 2 + 1)) + 2;
    } else if (sensorType === 'Humidity') {
      rand = Math.floor(Math.random() * (90 - 30 + 1)) + 30;
    } else if (sensorType === 'Vibration') {
      rand = Math.floor(Math.random() * (9 - 1 + 1)) + 1;
    }
    setSensorValueInput(rand.toString());
  };

  // Main simulation trigger: SIMULATE TRANSMISSION
  const handleSimulateTransmission = () => {
    const meta = getSensorMeta(sensorType);
    const num = parseInt(sensorValueInput, 10);
    const valid = isNaN(num) ? meta.defaultVal : Math.max(0, Math.min(255, num));
    setActiveValue(valid);
    setActiveSensorType(sensorType);
    setActiveEncoding(selectedEncoding);
    setActiveNoisePercent(noisePercent);
    setNoiseSeed((s) => s + 1);
  };

  // 8-bit binary representation of active digital value
  const binaryData = useMemo(() => {
    const val = Math.max(0, Math.min(255, Math.floor(activeValue)));
    return val.toString(2).padStart(8, '0');
  }, [activeValue]);

  const numBits = binaryData.length;
  const SAMPLES_PER_BIT = 40;

  // 1. Line Encoding: Generate Transmitted Waveform Samples
  const txSamples = useMemo(() => {
    const samples: number[] = [];
    let amiState = -1.0;

    for (let i = 0; i < numBits; i++) {
      const bit = binaryData[i];

      if (activeEncoding === 'Polar NRZ-L') {
        // Polar NRZ-L: 1 -> +1V, 0 -> -1V
        const v = bit === '1' ? 1.0 : -1.0;
        for (let s = 0; s < SAMPLES_PER_BIT; s++) samples.push(v);
      } else if (activeEncoding === 'Polar RZ') {
        // Polar RZ: 1 -> +1V then 0V, 0 -> -1V then 0V
        const half = SAMPLES_PER_BIT / 2;
        const v = bit === '1' ? 1.0 : -1.0;
        for (let s = 0; s < half; s++) samples.push(v);
        for (let s = half; s < SAMPLES_PER_BIT; s++) samples.push(0.0);
      } else if (activeEncoding === 'Bipolar AMI') {
        // Bipolar AMI: 0 -> 0V, 1 alternates +1V and -1V
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

  // Channel Gaussian Noise Sigma based on percentage
  const currentSigma = useMemo(() => {
    return (activeNoisePercent / 100) * 0.75;
  }, [activeNoisePercent]);

  // 2. Channel Simulation (Additive Gaussian Noise)
  const rxSamples = useMemo(() => {
    if (currentSigma === 0) {
      return txSamples.slice();
    }
    return txSamples.map((cleanV, idx) => {
      const u1 = Math.max(0.0001, (Math.sin(noiseSeed * 103 + idx * 17) + 1) / 2);
      const u2 = Math.max(0.0001, (Math.cos(noiseSeed * 211 + idx * 43) + 1) / 2);
      const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      return cleanV + gaussian * currentSigma;
    });
  }, [txSamples, currentSigma, noiseSeed]);

  // 3. Receiver: Sampling, Threshold Decision & Decoding
  const { receivedData, errorCount } = useMemo(() => {
    const decodedArr: string[] = [];
    let errors = 0;

    for (let i = 0; i < numBits; i++) {
      const start = i * SAMPLES_PER_BIT;
      const end = (i + 1) * SAMPLES_PER_BIT;
      const bitSlice = rxSamples.slice(start, end);

      let detectedBit = '0';

      if (activeEncoding === 'Polar NRZ-L') {
        // Sample middle of bit (40% to 60%)
        const midSlice = bitSlice.slice(16, 24);
        const avg = midSlice.reduce((a, b) => a + b, 0) / midSlice.length;
        detectedBit = avg >= 0 ? '1' : '0';
      } else if (activeEncoding === 'Polar RZ') {
        // Sample first half (active pulse period)
        const firstHalf = bitSlice.slice(6, 14);
        const avg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        detectedBit = avg >= 0 ? '1' : '0';
      } else if (activeEncoding === 'Bipolar AMI') {
        // Sample middle: 0 is at 0V, 1 is alternating +1V or -1V
        const midSlice = bitSlice.slice(16, 24);
        const avg = midSlice.reduce((a, b) => a + b, 0) / midSlice.length;
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

  // Recovered decimal value
  const recoveredValue = useMemo(() => {
    return parseInt(receivedData, 2) || 0;
  }, [receivedData]);

  // Bit Error Rate (BER)
  const berPercent = useMemo(() => {
    return ((errorCount / numBits) * 100).toFixed(1);
  }, [errorCount, numBits]);

  // Active metadata & status
  const currentMeta = getSensorMeta(sensorType);
  const activeMeta = getSensorMeta(activeSensorType);
  const currentStatus = getSensorStatus(sensorType, parseInt(sensorValueInput, 10) || currentMeta.defaultVal);

  // Oscilloscope Waveform Renderer
  const drawWaveform = (samples: number[], strokeColor: string, isReceived: boolean) => {
    const width = 500;
    const height = 110;
    const padLeft = 40;
    const padRight = 15;
    const padTop = 18;
    const padBottom = 24;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const midY = padTop + plotH / 2;
    const scaleY = plotH / 2.6;

    const bitW = plotW / numBits;

    const points = samples.map((v, i) => {
      const x = padLeft + (i / (samples.length - 1)) * plotW;
      const clamped = Math.max(-1.8, Math.min(1.8, v));
      const y = midY - clamped * scaleY;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto bg-[#070e18] rounded-lg border border-[#17263c] font-mono select-none"
        style={{ shapeRendering: 'crispEdges' }}
      >
        {/* Voltage reference levels */}
        <line x1={padLeft} y1={midY - scaleY} x2={width - padRight} y2={midY - scaleY} stroke="#1f2f45" strokeDasharray="3 3" />
        <line x1={padLeft} y1={midY} x2={width - padRight} y2={midY} stroke="#334661" strokeWidth="1" />
        <line x1={padLeft} y1={midY + scaleY} x2={width - padRight} y2={midY + scaleY} stroke="#1f2f45" strokeDasharray="3 3" />

        {/* Voltage text labels */}
        <text x={padLeft - 6} y={midY - scaleY + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">+1V</text>
        <text x={padLeft - 6} y={midY + 3.5} textAnchor="end" fontSize="10" fill="#64748b">0V</text>
        <text x={padLeft - 6} y={midY + scaleY + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">-1V</text>

        {/* Bit intervals and labels */}
        {binaryData.split('').map((bit, idx) => {
          const bitX = padLeft + idx * bitW;
          const centerX = bitX + bitW / 2;
          const bitFlipped = isReceived && receivedData[idx] !== bit;

          return (
            <g key={idx}>
              <line
                x1={bitX}
                y1={padTop - 4}
                x2={bitX}
                y2={height - padBottom + 4}
                stroke="#1a2b3f"
                strokeDasharray="3 3"
              />

              {/* Bit value under interval */}
              <text
                x={centerX}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fontWeight="bold"
                fill={bitFlipped ? '#f87171' : '#cbd5e1'}
              >
                {isReceived ? receivedData[idx] : bit}
              </text>
            </g>
          );
        })}

        <line
          x1={padLeft + plotW}
          y1={padTop - 4}
          x2={padLeft + plotW}
          y2={height - padBottom + 4}
          stroke="#1a2b3f"
          strokeDasharray="3 3"
        />

        {/* Signal waveform line */}
        <path
          d={`M ${points.join(' L ')}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          style={{ shapeRendering: 'auto' }}
        />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-[#060b13] text-slate-100 py-5 px-3 sm:px-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* ================================================== */}
        {/* 1. TOP HEADER                                     */}
        {/* ================================================== */}
        <header className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3.5">
            {/* Waveform Logo Icon */}
            <div className="w-12 h-12 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-cyan-400 stroke-current" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h3l3-8 4 16 4-10 3 4h3" />
              </svg>
            </div>

            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-wide text-white uppercase flex flex-wrap items-center gap-1.5">
                <span>FACTORY SENSOR</span>
                <span className="text-cyan-400">DATA COMMUNICATION</span>
                <span>SIMULATOR</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
                Industrial Sensor Telemetry Transmission using Polar and Bipolar Line Encoding
              </p>
            </div>
          </div>

          {/* Developed By Box */}
          <div className="bg-[#070e18] border border-[#1c304a] rounded-lg px-4 py-2.5 text-right shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-1 text-center md:text-right">
              DEVELOPED BY :-
            </div>
            <div className="text-xs text-slate-300 font-medium space-y-0.5 text-center md:text-right">
              <div>Yash Bhalchandra Borse</div>
              <div>Tanishka Karande</div>
              <div>Anuj Shinde</div>
              <div>Kushagra Sharma</div>
              <div>Ishaan Soni</div>
            </div>
          </div>
        </header>

        {/* ================================================== */}
        {/* 2. MAIN WORKFLOW: CARDS 1 to 4 WITH CONNECTORS     */}
        {/* ================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 items-stretch relative">
          
          {/* CARD 1: SENSOR INPUT */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 flex flex-col justify-between shadow relative">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-cyan-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  SENSOR INPUT
                </h2>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">
                    Select Sensor
                  </label>
                  <select
                    value={sensorType}
                    onChange={(e) => handleSensorTypeChange(e.target.value as SensorType)}
                    className="w-full px-2.5 py-1.5 bg-[#070e18] border border-[#1c304a] text-xs text-white rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="Temperature">Temperature Sensor (TEMP-01)</option>
                    <option value="Pressure">Pressure Sensor (PRESS-01)</option>
                    <option value="Humidity">Humidity Sensor (HUM-01)</option>
                    <option value="Vibration">Motor Vibration (VIB-01)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">
                    Sensor Value ({currentMeta.unit})
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={sensorValueInput}
                      onChange={(e) => setSensorValueInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#070e18] border border-[#1c304a] font-mono text-xs font-bold text-white rounded-lg focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateRandom}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg cursor-pointer shrink-0 transition-colors shadow"
                    >
                      Random
                    </button>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <div>
                    <span className="block text-slate-400 text-[10px] uppercase font-medium">Sensor Status</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border mt-0.5 bg-emerald-950/60 text-emerald-400 border-emerald-800/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {currentStatus}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="block text-slate-400 text-[10px] uppercase font-medium">Range</span>
                    <span className="text-xs font-mono text-slate-300 font-semibold">{currentMeta.range}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Connector Arrow */}
            <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#16253b] border border-[#223959] items-center justify-center text-slate-400 text-xs pointer-events-none">
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>

          {/* CARD 2: DIGITAL DATA */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 flex flex-col justify-between shadow relative">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  DIGITAL DATA
                </h2>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1 text-[11px]">Sensor ID</label>
                    <div className="px-2.5 py-1.5 bg-[#070e18] border border-[#1c304a] font-mono text-xs text-white rounded-lg font-bold">
                      {activeMeta.id}
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 font-medium mb-1 text-[11px]">Sensor Type</label>
                    <div className="px-2.5 py-1.5 bg-[#070e18] border border-[#1c304a] font-mono text-xs text-white rounded-lg font-bold">
                      {activeMeta.typeCode}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">Digital Value (Dec)</label>
                  <div className="px-2.5 py-1.5 bg-[#070e18] border border-[#1c304a] font-mono text-xs text-white rounded-lg font-bold">
                    {activeValue}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">Binary Representation</label>
                  <div className="px-2.5 py-1.5 bg-[#070e18] border border-[#1c304a] rounded-lg flex items-center justify-between font-mono">
                    <span className="text-cyan-400 font-extrabold tracking-widest text-sm">
                      {binaryData}
                    </span>
                    <span className="text-slate-500 text-[10px]">(8 bits)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Connector Arrow */}
            <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#16253b] border border-[#223959] items-center justify-center text-slate-400 text-xs pointer-events-none">
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>

          {/* CARD 3: LINE ENCODING */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 flex flex-col justify-between shadow relative">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  LINE ENCODING
                </h2>
              </div>

              <div className="space-y-2 text-xs">
                {/* Polar NRZ-L */}
                <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedEncoding === 'Polar NRZ-L'
                    ? 'border-cyan-500 bg-[#0c1f33] shadow-inner'
                    : 'border-[#1c304a] bg-[#070e18] hover:border-slate-600'
                }`}>
                  <input
                    type="radio"
                    name="encodingScheme"
                    value="Polar NRZ-L"
                    checked={selectedEncoding === 'Polar NRZ-L'}
                    onChange={() => setSelectedEncoding('Polar NRZ-L')}
                    className="mt-0.5 cursor-pointer accent-cyan-500"
                  />
                  <div>
                    <div className="font-bold text-white leading-tight">Polar NRZ-L</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">1 &rarr; +1V, 0 &rarr; -1V</div>
                  </div>
                </label>

                {/* Polar RZ */}
                <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedEncoding === 'Polar RZ'
                    ? 'border-cyan-500 bg-[#0c1f33] shadow-inner'
                    : 'border-[#1c304a] bg-[#070e18] hover:border-slate-600'
                }`}>
                  <input
                    type="radio"
                    name="encodingScheme"
                    value="Polar RZ"
                    checked={selectedEncoding === 'Polar RZ'}
                    onChange={() => setSelectedEncoding('Polar RZ')}
                    className="mt-0.5 cursor-pointer accent-cyan-500"
                  />
                  <div>
                    <div className="font-bold text-white leading-tight">Polar RZ</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">1 &rarr; +1V/0V, 0 &rarr; -1V/0V</div>
                  </div>
                </label>

                {/* Bipolar AMI */}
                <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedEncoding === 'Bipolar AMI'
                    ? 'border-cyan-500 bg-[#0c1f33] shadow-inner'
                    : 'border-[#1c304a] bg-[#070e18] hover:border-slate-600'
                }`}>
                  <input
                    type="radio"
                    name="encodingScheme"
                    value="Bipolar AMI"
                    checked={selectedEncoding === 'Bipolar AMI'}
                    onChange={() => setSelectedEncoding('Bipolar AMI')}
                    className="mt-0.5 cursor-pointer accent-cyan-500"
                  />
                  <div>
                    <div className="font-bold text-white leading-tight">Bipolar AMI</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">0 &rarr; 0V, 1 &rarr; Alternate &plusmn;1V</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Desktop Connector Arrow */}
            <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#16253b] border border-[#223959] items-center justify-center text-slate-400 text-xs pointer-events-none">
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* CARD 4: CHANNEL & SIMULATE */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 flex flex-col justify-between shadow">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  4
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  CHANNEL &amp; SIMULATE
                </h2>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">Noise Level:</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">{noisePercent}%</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={noisePercent}
                    onChange={(e) => setNoisePercent(parseInt(e.target.value, 10))}
                    className="w-full cursor-pointer accent-amber-500 bg-[#070e18]"
                  />

                  <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="button"
                onClick={handleSimulateTransmission}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer transition-colors shadow flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                SIMULATE TRANSMISSION
              </button>
            </div>
          </div>

        </div>

        {/* ================================================== */}
        {/* 3. ROW 2: TRANSMITTED SIGNAL ➔ CHANNEL ➔ RECEIVED   */}
        {/* ================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-3.5 items-center">
          
          {/* 5. TRANSMITTED SIGNAL */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  5
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  TRANSMITTED SIGNAL <span className="text-slate-400 font-normal">({activeEncoding})</span>
                </h3>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Bit Sequence: <span className="text-slate-200 font-bold">{binaryData.split('').join(' ')}</span>
              </div>
            </div>

            {drawWaveform(txSamples, '#38bdf8', false)}
          </div>

          {/* CHANNEL CONNECTOR BADGE */}
          <div className="flex lg:flex-col items-center justify-center gap-2 py-1 lg:py-0 px-2 shrink-0">
            <div className="bg-[#070e18] border border-[#1c304a] rounded-xl p-3 flex flex-col items-center justify-center text-center shadow min-w-[100px]">
              <div className="w-7 h-7 rounded-full bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-1">
                <Radio className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">CHANNEL</span>
              <span className="text-[10px] font-mono text-amber-400">Noise: {activeNoisePercent}%</span>
            </div>
          </div>

          {/* 6. RECEIVED SIGNAL */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  6
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  RECEIVED SIGNAL <span className="text-slate-400 font-normal">(After Channel)</span>
                </h3>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Bit Sequence: <span className="text-slate-200 font-bold">{receivedData.split('').join(' ')}</span>
              </div>
            </div>

            {drawWaveform(rxSamples, errorCount === 0 ? '#4ade80' : '#f87171', true)}
          </div>

        </div>

        {/* ================================================== */}
        {/* 4. ROW 3: RECEIVER & DECODING | RESULTS | TABLE    */}
        {/* ================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
          
          {/* 7. RECEIVER & DECODING */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  7
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  RECEIVER &amp; DECODING
                </h3>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">Decoded Binary</label>
                  <div className="px-3 py-2 bg-[#070e18] border border-[#1c304a] font-mono text-sm font-bold text-emerald-400 rounded-lg tracking-wider">
                    {receivedData}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">Recovered Value (Dec)</label>
                  <div className="px-3 py-2 bg-[#070e18] border border-[#1c304a] font-mono text-sm font-bold text-cyan-300 rounded-lg">
                    {recoveredValue}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">Recovered Sensor Value</label>
                  <div className={`px-3 py-2 bg-[#070e18] border border-[#1c304a] font-mono text-sm font-bold rounded-lg ${
                    errorCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {recoveredValue} {activeMeta.unit}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 8. TRANSMISSION RESULTS */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  8
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  TRANSMISSION RESULTS
                </h3>
              </div>

              {/* Status Banner */}
              <div className={`p-2.5 rounded-lg border text-center font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 mb-3.5 ${
                errorCount === 0
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                  : 'bg-rose-950/80 border-rose-500/40 text-rose-400'
              }`}>
                {errorCount === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    DATA RECOVERED SUCCESSFULLY
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    DATA ERROR DETECTED
                  </>
                )}
              </div>

              {/* 3 Metrics */}
              <div className="grid grid-cols-3 gap-2 font-mono text-center">
                <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-lg">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Bit Errors</span>
                  <span className="text-xs font-bold text-white mt-0.5 block">{errorCount} / {numBits}</span>
                </div>

                <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-lg">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Bit Error Rate (BER)</span>
                  <span className="text-xs font-bold text-emerald-400 mt-0.5 block">{berPercent}%</span>
                </div>

                <div className="bg-[#070e18] border border-[#1c304a] p-2.5 rounded-lg">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Channel Noise</span>
                  <span className="text-xs font-bold text-amber-400 mt-0.5 block">{activeNoisePercent}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 9. POLAR VS BIPOLAR COMPARISON */}
          <div className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-cyan-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  9
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  POLAR vs BIPOLAR COMPARISON
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono border-collapse border border-[#1c304a]">
                  <thead>
                    <tr className="bg-[#070e18] text-slate-300 border-b border-[#1c304a]">
                      <th className="p-1.5 text-left border-r border-[#1c304a] font-bold">Encoding</th>
                      <th className="p-1.5 text-left border-r border-[#1c304a] font-bold">Bit 0</th>
                      <th className="p-1.5 text-left border-r border-[#1c304a] font-bold">Bit 1</th>
                      <th className="p-1.5 text-left border-r border-[#1c304a] font-bold">Signal Levels</th>
                      <th className="p-1.5 text-left font-bold">Main Feature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1c304a] text-slate-300">
                    <tr>
                      <td className="p-1.5 font-bold text-white border-r border-[#1c304a]">Polar NRZ-L</td>
                      <td className="p-1.5 border-r border-[#1c304a]">-1V</td>
                      <td className="p-1.5 border-r border-[#1c304a]">+1V</td>
                      <td className="p-1.5 border-r border-[#1c304a]">Two levels</td>
                      <td className="p-1.5">Bandwidth efficient</td>
                    </tr>
                    <tr>
                      <td className="p-1.5 font-bold text-white border-r border-[#1c304a]">Polar RZ</td>
                      <td className="p-1.5 border-r border-[#1c304a]">-1V / 0V</td>
                      <td className="p-1.5 border-r border-[#1c304a]">+1V / 0V</td>
                      <td className="p-1.5 border-r border-[#1c304a]">Three levels</td>
                      <td className="p-1.5">Returns to zero</td>
                    </tr>
                    <tr>
                      <td className="p-1.5 font-bold text-white border-r border-[#1c304a]">Bipolar AMI</td>
                      <td className="p-1.5 border-r border-[#1c304a]">0V</td>
                      <td className="p-1.5 border-r border-[#1c304a]">&plusmn;1V (alternate)</td>
                      <td className="p-1.5 border-r border-[#1c304a]">Three levels</td>
                      <td className="p-1.5 text-emerald-400">Zero DC component</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* ================================================== */}
        {/* 5. ROW 4: 10. REAL-WORLD APPLICATION               */}
        {/* ================================================== */}
        <section className="bg-[#0b1320] border border-[#16253b] rounded-xl p-4 shadow">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-md bg-cyan-900/60 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              10. REAL-WORLD APPLICATION
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Card 1: Temperature Monitoring */}
            <div className="p-3 rounded-xl bg-[#140e15] border border-rose-950 flex items-center gap-3 shadow">
              <div className="w-9 h-9 rounded-lg bg-rose-950/80 border border-rose-700/40 flex items-center justify-center shrink-0 text-rose-400">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-rose-200">Temperature Monitoring</div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Monitoring furnaces, boilers and thermal chambers.
                </div>
              </div>
            </div>

            {/* Card 2: Pressure Monitoring */}
            <div className="p-3 rounded-xl bg-[#091524] border border-cyan-950 flex items-center gap-3 shadow">
              <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-700/40 flex items-center justify-center shrink-0 text-cyan-400">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-cyan-200">Pressure Monitoring</div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Monitoring pneumatic and hydraulic systems.
                </div>
              </div>
            </div>

            {/* Card 3: Motor Condition Monitoring */}
            <div className="p-3 rounded-xl bg-[#0a1816] border border-emerald-950 flex items-center gap-3 shadow">
              <div className="w-9 h-9 rounded-lg bg-emerald-950/80 border border-emerald-700/40 flex items-center justify-center shrink-0 text-emerald-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-emerald-200">Motor Condition Monitoring</div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Detecting vibration and mechanical issues.
                </div>
              </div>
            </div>

            {/* Card 4: Environmental Monitoring */}
            <div className="p-3 rounded-xl bg-[#130f24] border border-purple-950 flex items-center gap-3 shadow">
              <div className="w-9 h-9 rounded-lg bg-purple-950/80 border border-purple-700/40 flex items-center justify-center shrink-0 text-purple-400">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-purple-200">Environmental Monitoring</div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Monitoring humidity and other environmental parameters.
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
