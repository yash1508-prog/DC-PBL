"""
========================================================================================
PROJECT TITLE:
Industrial Sensor Data Transmission using Polar and Bipolar Line Encoding

COLLEGE DATA COMMUNICATION PBL PROJECT
----------------------------------------------------------------------------------------
Main Idea:
Demonstrating real-world digital transmission of an industrial temperature sensor value
(e.g., 72°C) to a monitoring system using Line Encoding techniques:
  1. Polar NRZ-L (Non-Return to Zero - Level)
  2. Polar RZ    (Return to Zero)
  3. Bipolar AMI (Alternate Mark Inversion)

Pipeline:
Sensor Value (72°C)
  -> Binary Conversion (8-bit: 01001000)
  -> Line Encoding (Waveform generation)
  -> Simulated Channel (Noise: None, Low, High)
  -> Received Signal Sampling & Decision
  -> Decoded Binary
  -> Recovered Sensor Value & BER Calculation
========================================================================================
"""

import sys
import random

# Matplotlib & NumPy are used for signal waveform visualization and sampling
try:
    import matplotlib.pyplot as plt
    import numpy as np
except ImportError:
    print("\n[ERROR] Missing required libraries: 'matplotlib' and/or 'numpy'.")
    print("Please install them using:")
    print("    pip install matplotlib numpy\n")
    sys.exit(1)


# -----------------------------------------------------------------------------
# 1. CORE CONVERSION FUNCTIONS
# -----------------------------------------------------------------------------

def decimal_to_binary(value: int, bit_width: int = 8) -> str:
    """
    Converts a decimal sensor integer into an 8-bit binary string.
    Example: 72 -> '01001000'
    """
    if value < 0 or value > 255:
        # Clamped to 8-bit range (0 to 255) for standard 1-byte sensor telemetry
        value = max(0, min(255, value))
    return format(value, f'0{bit_width}b')


def binary_to_decimal(bit_string: str) -> int:
    """
    Converts a binary string back into a decimal sensor integer.
    Example: '01001000' -> 72
    """
    try:
        return int(bit_string, 2)
    except ValueError:
        return 0


# -----------------------------------------------------------------------------
# 2. LINE ENCODING FUNCTIONS
# -----------------------------------------------------------------------------

def polar_nrz_encode(bit_stream: str, samples_per_bit: int = 100):
    """
    Polar NRZ-L (Non-Return-to-Zero Level):
      - Bit '1' -> +1 V for the full bit duration (Tb)
      - Bit '0' -> -1 V for the full bit duration (Tb)
    """
    signal = []
    for bit in bit_stream:
        voltage = +1.0 if bit == '1' else -1.0
        signal.extend([voltage] * samples_per_bit)
    return np.array(signal)


def polar_rz_encode(bit_stream: str, samples_per_bit: int = 100):
    """
    Polar RZ (Return-to-Zero):
      - Bit '1' -> +1 V for the first half (Tb/2), returns to 0 V for second half
      - Bit '0' -> -1 V for the first half (Tb/2), returns to 0 V for second half
      Provides built-in synchronization via the mid-bit transitions.
    """
    signal = []
    half_samples = samples_per_bit // 2
    for bit in bit_stream:
        first_half_v = +1.0 if bit == '1' else -1.0
        signal.extend([first_half_v] * half_samples)
        signal.extend([0.0] * (samples_per_bit - half_samples))
    return np.array(signal)


def bipolar_ami_encode(bit_stream: str, samples_per_bit: int = 100):
    """
    Bipolar AMI (Alternate Mark Inversion):
      - Bit '0' -> 0 V
      - Bit '1' -> Alternates between +1 V and -1 V
      Eliminates DC component because the average voltage of 1s cancels out.
    """
    signal = []
    last_mark_polarity = -1.0  # Start so first '1' becomes +1.0

    for bit in bit_stream:
        if bit == '1':
            last_mark_polarity = -last_mark_polarity  # Alternate
            voltage = last_mark_polarity
        else:
            voltage = 0.0
        signal.extend([voltage] * samples_per_bit)
    return np.array(signal)


# -----------------------------------------------------------------------------
# 3. CHANNEL SIMULATION & NOISE
# -----------------------------------------------------------------------------

def add_noise(signal: np.ndarray, noise_level: str = "none") -> np.ndarray:
    """
    Simulates additive channel noise across the factory transmission cable.
      - 'none': clean wire (sigma = 0.0)
      - 'low' : slight industrial electromagnetic interference (sigma = 0.20)
      - 'high': severe motor/welder industrial interference (sigma = 0.65)
    """
    if noise_level.lower() == "low":
        sigma = 0.20
    elif noise_level.lower() == "high":
        sigma = 0.65
    else:
        sigma = 0.0

    if sigma == 0.0:
        return signal.copy()

    # Add Gaussian noise
    noise = np.random.normal(loc=0.0, scale=sigma, size=signal.shape)
    return signal + noise


# -----------------------------------------------------------------------------
# 4. SIGNAL DECODING & RECEIVER DECISION
# -----------------------------------------------------------------------------

def decode_signal(noisy_signal: np.ndarray, scheme: str, bit_count: int, samples_per_bit: int = 100) -> str:
    """
    Receiver decision logic. Samples the received waveform at the optimal time
    point within each bit period and applies threshold detection.
    """
    decoded_bits = []

    for i in range(bit_count):
        # Bit window indices
        bit_start = i * samples_per_bit
        bit_end = (i + 1) * samples_per_bit
        bit_samples = noisy_signal[bit_start:bit_end]

        if scheme == "Polar NRZ-L":
            # Sample around center of bit (40% to 60%) to avoid edge transition noise
            center_sample = np.mean(bit_samples[int(0.4 * samples_per_bit):int(0.6 * samples_per_bit)])
            # Threshold is 0 V: > 0 means '1', < 0 means '0'
            bit = '1' if center_sample >= 0 else '0'

        elif scheme == "Polar RZ":
            # For RZ, the non-zero information is in the first half (15% to 35% of bit period)
            first_half_sample = np.mean(bit_samples[int(0.15 * samples_per_bit):int(0.35 * samples_per_bit)])
            # Threshold is 0 V
            bit = '1' if first_half_sample >= 0 else '0'

        elif scheme == "Bipolar AMI":
            # For AMI: '0' is at 0V. '1' is either +1V or -1V.
            # Sample around middle of the bit
            center_sample = np.mean(bit_samples[int(0.4 * samples_per_bit):int(0.6 * samples_per_bit)])
            # If absolute amplitude is above threshold (0.5V), it is a '1', else '0'
            bit = '1' if abs(center_sample) >= 0.50 else '0'

        else:
            bit = '0'

        decoded_bits.append(bit)

    return "".join(decoded_bits)


# -----------------------------------------------------------------------------
# 5. BIT ERROR RATE (BER)
# -----------------------------------------------------------------------------

def calculate_ber(original_bits: str, received_bits: str):
    """
    Calculates Bit Error Rate (BER) = Incorrect Bits / Total Bits
    """
    total_bits = len(original_bits)
    if total_bits == 0:
        return 0, 0.0

    errors = sum(1 for o, r in zip(original_bits, received_bits) if o != r)
    ber = errors / total_bits
    return errors, ber


# -----------------------------------------------------------------------------
# 6. PLOTTING FUNCTIONS USING MATPLOTLIB
# -----------------------------------------------------------------------------

def plot_single_transmission(
    original_bits: str,
    tx_signal: np.ndarray,
    rx_signal: np.ndarray,
    scheme: str,
    noise_level: str,
    temp_original: int,
    temp_recovered: int,
    errors: int,
    ber: float,
    samples_per_bit: int = 100
):
    """
    Plots the transmitted and received waveforms showing bit boundaries,
    voltages, and decoded results.
    """
    n_bits = len(original_bits)
    total_samples = len(tx_signal)
    time_axis = np.linspace(0, n_bits, total_samples)

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
    fig.canvas.manager.set_window_title(f"Industrial Sensor Line Encoding - {scheme}")

    # Color scheme
    color_tx = '#0284c7'  # Blue
    color_rx = '#d97706' if errors > 0 else '#16a34a'  # Green if OK, Orange if error

    # 1. Transmitted Waveform
    ax1.plot(time_axis, tx_signal, color=color_tx, linewidth=2.2, label=f"TX Signal ({scheme})")
    ax1.set_title(f"1. Transmitted Signal at Factory Sensor [Data: {original_bits} | Temp: {temp_original}°C]",
                  fontsize=12, fontweight='bold', pad=10)
    ax1.set_ylabel("Voltage (V)", fontsize=11, fontweight='bold')
    ax1.set_ylim(-1.8, 1.8)
    ax1.axhline(0, color='gray', linestyle='--', linewidth=0.8, alpha=0.7)
    ax1.grid(True, linestyle=':', alpha=0.6)
    ax1.legend(loc="upper right")

    # 2. Received Waveform
    ax2.plot(time_axis, rx_signal, color=color_rx, linewidth=1.5,
             label=f"RX Signal (Channel Noise: {noise_level.capitalize()})")
    status_text = "SUCCESSFUL" if errors == 0 else f"ERROR DETECTED ({errors} bits flipped)"
    ax2.set_title(
        f"2. Received Signal at Monitoring PC [Status: {status_text} | BER: {ber:.2%} | Recovered: {temp_recovered}°C]",
        fontsize=12, fontweight='bold', pad=10, color='#15803d' if errors == 0 else '#b91c1c')
    ax2.set_xlabel("Time (Bit Intervals / Tb)", fontsize=11, fontweight='bold')
    ax2.set_ylabel("Voltage (V)", fontsize=11, fontweight='bold')
    ax2.set_ylim(-2.2, 2.2)
    ax2.axhline(0, color='gray', linestyle='--', linewidth=0.8, alpha=0.7)
    ax2.grid(True, linestyle=':', alpha=0.6)
    ax2.legend(loc="upper right")

    # Annotate bit boundaries and bit values
    for ax in (ax1, ax2):
        for i, bit in enumerate(original_bits):
            # Vertical boundary line
            ax.axvline(i, color='#94a3b8', linestyle='--', linewidth=1.0, alpha=0.8)
            # Label on top
            ax.text(i + 0.5, 1.45, f"b{i}={bit}", ha='center', va='center',
                    fontsize=10, fontweight='bold',
                    bbox=dict(boxstyle="round,pad=0.2", facecolor='#f1f5f9', edgecolor='#cbd5e1'))
        ax.axvline(n_bits, color='#94a3b8', linestyle='--', linewidth=1.0, alpha=0.8)

    plt.tight_layout()
    plt.show()


def plot_comparison(original_bits: str, temp_value: int, samples_per_bit: int = 100):
    """
    Plots Polar NRZ-L, Polar RZ, and Bipolar AMI side-by-side on 3 stacked subplots
    for direct pedagogical comparison.
    """
    n_bits = len(original_bits)
    time_axis = np.linspace(0, n_bits, n_bits * samples_per_bit)

    sig_nrz = polar_nrz_encode(original_bits, samples_per_bit)
    sig_rz = polar_rz_encode(original_bits, samples_per_bit)
    sig_ami = bipolar_ami_encode(original_bits, samples_per_bit)

    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(11, 8), sharex=True)
    fig.canvas.manager.set_window_title("Line Encoding Comparison - Polar NRZ-L vs Polar RZ vs Bipolar AMI")

    schemes = [
        (ax1, sig_nrz, "Polar NRZ-L (1 -> +1V, 0 -> -1V)", "#2563eb"),
        (ax2, sig_rz, "Polar RZ (1 -> +1V then 0V, 0 -> -1V then 0V)", "#7c3aed"),
        (ax3, sig_ami, "Bipolar AMI (0 -> 0V, 1 alternates +1V / -1V)", "#059669")
    ]

    for ax, signal, title, color in schemes:
        ax.plot(time_axis, signal, color=color, linewidth=2.2)
        ax.set_title(title, fontsize=11, fontweight='bold')
        ax.set_ylabel("Voltage (V)", fontsize=10, fontweight='bold')
        ax.set_ylim(-1.6, 1.6)
        ax.axhline(0, color='gray', linestyle='--', linewidth=0.8, alpha=0.7)
        ax.grid(True, linestyle=':', alpha=0.6)

        # Bit markers
        for i, bit in enumerate(original_bits):
            ax.axvline(i, color='#94a3b8', linestyle='--', linewidth=0.8, alpha=0.7)
            ax.text(i + 0.5, 1.25, bit, ha='center', va='center',
                    fontsize=10, fontweight='bold',
                    bbox=dict(boxstyle="circle,pad=0.2", facecolor='#f8fafc', edgecolor='#94a3b8'))
        ax.axvline(n_bits, color='#94a3b8', linestyle='--', linewidth=0.8, alpha=0.7)

    ax3.set_xlabel("Bit Position / Time (Tb)", fontsize=11, fontweight='bold')
    plt.suptitle(f"Comparison of Line Encodings for Sensor Temp = {temp_value}°C [Binary: {original_bits}]",
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    plt.show()


# -----------------------------------------------------------------------------
# 7. MAIN INTERACTIVE SIMULATION PROGRAM
# -----------------------------------------------------------------------------

def run_simulation():
    """
    Main interactive driver for the PBL demonstration.
    """
    print("=" * 72)
    print("  INDUSTRIAL SENSOR DATA TRANSMISSION USING POLAR & BIPOLAR ENCODING")
    print("  Data Communication Project-Based Learning (PBL) Simulation")
    print("=" * 72)

    # Step 1: Input Sensor Value
    print("\n[STEP 1: SENSOR DATA ACQUISITION]")
    user_input = input("Enter Sensor Temperature (°C) [Default: 72]: ").strip()
    if not user_input:
        temp_original = 72
    else:
        try:
            temp_original = int(user_input)
        except ValueError:
            print("Invalid input. Using default temperature: 72°C")
            temp_original = 72

    # Step 2: Binary Conversion
    bit_stream = decimal_to_binary(temp_original, bit_width=8)
    print("\n[STEP 2: ANALOG-TO-DIGITAL / BINARY CONVERSION]")
    print(f"  -> Original Sensor Value : {temp_original}°C")
    print(f"  -> 8-Bit Binary Sequence : {bit_stream}")
    print(f"     Bit mapping: [MSB={bit_stream[0]} ... LSB={bit_stream[-1]}]")

    # Step 3: Encoding Selection
    print("\n[STEP 3: LINE ENCODING TECHNIQUE SELECTION]")
    print("  1. Polar NRZ-L (Non-Return-to-Zero Level)")
    print("  2. Polar RZ    (Return-to-Zero)")
    print("  3. Bipolar AMI (Alternate Mark Inversion)")
    print("  4. Compare All 3 Encodings Simultaneously")
    enc_choice = input("Select an option (1-4) [Default: 1]: ").strip()

    if enc_choice == "2":
        scheme_name = "Polar RZ"
    elif enc_choice == "3":
        scheme_name = "Bipolar AMI"
    elif enc_choice == "4":
        scheme_name = "Compare All"
    else:
        scheme_name = "Polar NRZ-L"

    # If comparison mode selected
    if scheme_name == "Compare All":
        print("\nOpening Comparison Plot for Polar NRZ-L, Polar RZ, and Bipolar AMI...")
        plot_comparison(bit_stream, temp_original)
        print("\nDemonstration complete! Returning to menu.")
        return

    # Step 4: Generate Encoded Signal
    print(f"\n[STEP 4: ENCODING WAVEFORM GENERATION ({scheme_name})]")
    samples_per_bit = 100
    if scheme_name == "Polar NRZ-L":
        tx_signal = polar_nrz_encode(bit_stream, samples_per_bit)
    elif scheme_name == "Polar RZ":
        tx_signal = polar_rz_encode(bit_stream, samples_per_bit)
    else:
        tx_signal = bipolar_ami_encode(bit_stream, samples_per_bit)
    print(f"  -> Generated {len(tx_signal)} continuous signal samples for {len(bit_stream)} bits.")

    # Step 5: Channel Noise
    print("\n[STEP 5: COMMUNICATION CHANNEL NOISE SIMULATION]")
    print("  1. No Noise   (Ideal factory shielded twisted-pair cable)")
    print("  2. Low Noise  (Mild industrial EMI / thermal noise)")
    print("  3. High Noise (Severe heavy motor / welding equipment interference)")
    noise_choice = input("Select channel condition (1-3) [Default: 1]: ").strip()
    if noise_choice == "2":
        noise_level = "low"
    elif noise_choice == "3":
        noise_level = "high"
    else:
        noise_level = "none"

    rx_signal = add_noise(tx_signal, noise_level=noise_level)
    print(f"  -> Signal transmitted through channel with noise level: {noise_level.upper()}")

    # Step 6 & 7: Receive Signal & Decode
    print("\n[STEP 6 & 7: RECEIVER SAMPLING, THRESHOLD DECISION & DECODING]")
    rx_bits = decode_signal(rx_signal, scheme=scheme_name, bit_count=len(bit_stream), samples_per_bit=samples_per_bit)
    temp_recovered = binary_to_decimal(rx_bits)
    errors, ber = calculate_ber(bit_stream, rx_bits)

    # Step 8: Display Results
    print("\n" + "=" * 50)
    print("           TRANSMISSION RESULTS SUMMARY")
    print("=" * 50)
    print(f"Original Sensor Value  : {temp_original}°C")
    print(f"Original Binary Stream : {bit_stream}")
    print(f"Received Binary Stream : {rx_bits}")
    print(f"Recovered Sensor Value : {temp_recovered}°C")
    print(f"Encoding Technique     : {scheme_name}")
    print(f"Channel Noise Level    : {noise_level.capitalize()}")
    print(f"Bit Errors Detected    : {errors} / {len(bit_stream)} bits")
    print(f"Bit Error Rate (BER)   : {ber:.2%}")

    if errors == 0:
        print("Transmission Status    : SUCCESSFUL (Data integrity preserved)")
    else:
        print("Transmission Status    : ERROR DETECTED (Signal corrupted by channel noise)")
    print("=" * 50)

    # Step 9: Plot Waveform
    print("\n[STEP 8: DISPLAYING SIGNAL WAVEFORMS VIA MATPLOTLIB]")
    print("Close the Matplotlib graph window to finish or run again.\n")
    plot_single_transmission(
        original_bits=bit_stream,
        tx_signal=tx_signal,
        rx_signal=rx_signal,
        scheme=scheme_name,
        noise_level=noise_level,
        temp_original=temp_original,
        temp_recovered=temp_recovered,
        errors=errors,
        ber=ber,
        samples_per_bit=samples_per_bit
    )


if __name__ == "__main__":
    while True:
        run_simulation()
        repeat = input("\nWould you like to run another simulation test? (y/n) [y]: ").strip().lower()
        if repeat == 'n':
            print("\nThank you for using the Line Encoding PBL Simulator. Good luck with your viva!\n")
            break
