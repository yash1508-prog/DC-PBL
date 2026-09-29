# Industrial Sensor Data Transmission using Polar and Bipolar Line Encoding
**Data Communication Course Project-Based Learning (PBL)**

---

## 1. Project Overview
In modern manufacturing facilities (e.g., steel mills, chemical plants, automated automotive assembly lines), environmental and process sensors continuously measure critical physical quantities like temperature, pressure, and flow rate.

This project simulates how a digital temperature sensor reading (e.g., **72°C**) is converted to binary, encoded into an electrical voltage signal using **Polar NRZ-L**, **Polar RZ**, or **Bipolar AMI**, transmitted through a physical factory channel with electromagnetic interference (noise), sampled at the receiver, and reconstructed back into the exact original temperature reading.

---

## 2. System Flowchart (Text Form)

```text
       +---------------------------------------------+
       |             Factory Sensor Node             |
       |  Reads physical temperature: e.g., 72°C     |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |         Analog-to-Digital Converter         |
       |  Converts 72 to 8-bit binary: 01001000       |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |            Line Encoding Selection          |
       |  - Polar NRZ-L:  1 -> +1V,  0 -> -1V        |
       |  - Polar RZ:     1 -> +1V/0V, 0 -> -1V/0V   |
       |  - Bipolar AMI:  0 -> 0V, 1 alternates     |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |          Physical Channel Simulation        |
       |  Adds Gaussian Noise (No / Low / High)      |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |         Receiver Sampling & Decision        |
       |  Samples at mid-bit, compares to threshold  |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |          Binary to Decimal Conversion       |
       |  Decodes bitstream -> Recovered Temp (°C)   |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |        Performance Evaluation & Plotting    |
       |  - Calculates Bit Error Rate (BER)          |
       |  - Displays TX & RX Waveforms in Matplotlib |
       +---------------------------------------------+
```

---

## 3. Line Encoding Techniques Explained

| Technique | Logic for '1' | Logic for '0' | Key Advantage | Key Limitation |
| :--- | :--- | :--- | :--- | :--- |
| **Polar NRZ-L** (Non-Return-to-Zero Level) | Positive Voltage (+1V) for entire bit duration ($T_b$) | Negative Voltage (-1V) for entire bit duration ($T_b$) | Simple implementation, low bandwidth ($B = N/2$) | DC component present; long run of 0s or 1s causes synchronization loss |
| **Polar RZ** (Return-to-Zero) | Goes to +1V for first half of bit ($T_b/2$), drops to 0V for second half | Goes to -1V for first half of bit ($T_b/2$), drops to 0V for second half | Self-synchronizing clock due to mandatory mid-bit transition | Requires twice the bandwidth of NRZ ($B = N$) |
| **Bipolar AMI** (Alternate Mark Inversion) | Alternates between +1V and -1V | Zero Voltage (0V) | **Zero DC component**; built-in single bit error detection | Long runs of 0s lack transitions, leading to loss of receiver clock sync |

---

## 4. Setup & Running Instructions

### Requirements
- Python 3.8 or higher
- `matplotlib`
- `numpy`

### Step 1: Install Dependencies
Open your command terminal (Command Prompt, PowerShell, or Terminal) and run:
```bash
pip install -r requirements.txt
```
or directly:
```bash
pip install matplotlib numpy
```

### Step 2: Run the Program
```bash
python sensor_transmission.py
```

Follow the on-screen prompts:
1. Enter temperature (e.g. `72` or press Enter for default).
2. Select line encoding scheme (1 for NRZ-L, 2 for RZ, 3 for AMI, 4 to Compare All).
3. Select channel noise (1 for None, 2 for Low, 3 for High).
4. The Matplotlib window will pop up showing the voltage waveform against bit intervals!

---

## 5. Top 5 Viva Questions & Model Answers

**Q1: Why is Line Encoding necessary in data communication?**
> *Answer:* Raw digital data in memory consists of abstract bits (0s and 1s). Line encoding converts these bits into discrete electrical voltage levels suitable for transmission over physical transmission media (copper wires, coaxial cables, twisted pairs) while addressing DC component, clock synchronization, and bandwidth limits.

**Q2: Why does Bipolar AMI eliminate the DC component?**
> *Answer:* In AMI, '0' is represented by 0V, and consecutive '1's alternate strictly between positive and negative voltages (+V and -V). As a result, the time-averaged voltage across any realistic bit sequence converges to 0V, preventing transformer saturation and DC baseline wander.

**Q3: What is the main difference between NRZ-L and RZ?**
> *Answer:* In NRZ-L, the signal stays constant for the entire bit duration ($T_b$). In RZ, the signal returns to zero volts halfway through each bit period ($T_b/2$). This mid-bit transition provides clock timing synchronization for the receiver, at the cost of doubling the required transmission bandwidth.

**Q4: How does channel noise affect the received signal and BER?**
> *Answer:* Physical industrial environments experience electromagnetic noise from heavy motors and welders. This additive noise alters the signal voltage. If the noise amplitude exceeds the decision threshold at the sampling instant, the receiver mistakenly detects a 0 as 1 or vice-versa, causing bit errors. BER = (Flipped Bits) / (Total Bits).

**Q5: What is baseline wander?**
> *Answer:* When a long sequence of 0s or 1s is transmitted in a scheme with a DC component (like unipolar or NRZ), capacitive coupling in the channel charges up, causing the baseline voltage reference to drift. This causes the receiver's threshold detector to make erroneous bit decisions.
