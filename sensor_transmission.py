"""

PROJECT TITLE:
Industrial Sensor Data Transmission using Polar and Bipolar Line Encoding

DEVELOPED BY :-
Yash Bhalchandra Borse
Tanishka Karande
Anuj Shinde
Kushagra Sharma
Ishaan Soni

COLLEGE DATA COMMUNICATION PBL PROJECT

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

# Matplotlib and NumPy
try:
    import matplotlib.pyplot as plt
    import numpy as np
except ImportError:
    print("\n[ERROR] Missing required libraries: 'matplotlib' and/or 'numpy'.")
    print("Please install them using:")
    print("    pip install matplotlib numpy\n")
    sys.exit(1)


# Binary conversion

def decimal_to_binary(value: int, bit_width: int = 8) -> str:

    if value < 0 or value > 255:
        value = max(0, min(255, value))

    return format(value, f'0{bit_width}b')


def binary_to_decimal(bit_string: str) -> int:

    try:
        return int(bit_string, 2)
    except ValueError:
        return 0


# Polar NRZ encoding

def polar_nrz_encode(bit_stream: str, samples_per_bit: int = 100):

    signal = []

    for bit in bit_stream:
        voltage = +1.0 if bit == '1' else -1.0
        signal.extend([voltage] * samples_per_bit)

    return np.array(signal)


# Polar RZ encoding

def polar_rz_encode(bit_stream: str, samples_per_bit: int = 100):

    signal = []
    half_samples = samples_per_bit // 2

    for bit in bit_stream:

        first_half_v = +1.0 if bit == '1' else -1.0

        signal.extend([first_half_v] * half_samples)
        signal.extend([0.0] * (samples_per_bit - half_samples))

    return np.array(signal)


# Bipolar AMI encoding

def bipolar_ami_encode(bit_stream: str, samples_per_bit: int = 100):

    signal = []

    last_mark_polarity = -1.0

    for bit in bit_stream:

        if bit == '1':
            last_mark_polarity = -last_mark_polarity
            voltage = last_mark_polarity

        else:
            voltage = 0.0

        signal.extend([voltage] * samples_per_bit)

    return np.array(signal)


# Add noise

def add_noise(signal: np.ndarray, noise_level: str = "none"):

    if noise_level.lower() == "low":
        sigma = 0.20

    elif noise_level.lower() == "high":
        sigma = 0.65

    else:
        sigma = 0.0

    if sigma == 0.0:
        return signal.copy()

    noise = np.random.normal(
        loc=0.0,
        scale=sigma,
        size=signal.shape
    )

    return signal + noise


# Decode received signal

def decode_signal(
    noisy_signal: np.ndarray,
    scheme: str,
    bit_count: int,
    samples_per_bit: int = 100
) -> str:

    decoded_bits = []

    for i in range(bit_count):

        bit_start = i * samples_per_bit
        bit_end = (i + 1) * samples_per_bit

        bit_samples = noisy_signal[bit_start:bit_end]

        if scheme == "Polar NRZ-L":

            center_sample = np.mean(
                bit_samples[
                    int(0.4 * samples_per_bit):
                    int(0.6 * samples_per_bit)
                ]
            )

            bit = '1' if center_sample >= 0 else '0'

        elif scheme == "Polar RZ":

            first_half_sample = np.mean(
                bit_samples[
                    int(0.15 * samples_per_bit):
                    int(0.35 * samples_per_bit)
                ]
            )

            bit = '1' if first_half_sample >= 0 else '0'

        elif scheme == "Bipolar AMI":

            center_sample = np.mean(
                bit_samples[
                    int(0.4 * samples_per_bit):
                    int(0.6 * samples_per_bit)
                ]
            )

            bit = '1' if abs(center_sample) >= 0.50 else '0'

        else:
            bit = '0'

        decoded_bits.append(bit)

    return "".join(decoded_bits)


# Bit error rate

def calculate_ber(original_bits: str, received_bits: str):

    total_bits = len(original_bits)

    if total_bits == 0:
        return 0, 0.0

    errors = sum(
        1 for o, r in zip(original_bits, received_bits)
        if o != r
    )

    ber = errors / total_bits

    return errors, ber


# Plot transmitted and received signals

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

    n_bits = len(original_bits)
    total_samples = len(tx_signal)

    time_axis = np.linspace(
        0,
        n_bits,
        total_samples
    )

    fig, (ax1, ax2) = plt.subplots(
        2,
        1,
        figsize=(11, 7),
        sharex=True
    )

    fig.canvas.manager.set_window_title(
        f"Industrial Sensor Line Encoding - {scheme}"
    )

    color_tx = '#0284c7'

    if errors > 0:
        color_rx = '#d97706'
    else:
        color_rx = '#16a34a'


    # Transmitted signal

    ax1.plot(
        time_axis,
        tx_signal,
        color=color_tx,
        linewidth=2.2,
        label=f"TX Signal ({scheme})"
    )

    ax1.set_title(
        f"1. Transmitted Signal at Factory Sensor "
        f"[Data: {original_bits} | Temp: {temp_original}°C]",
        fontsize=12,
        fontweight='bold',
        pad=10
    )

    ax1.set_ylabel(
        "Voltage (V)",
        fontsize=11,
        fontweight='bold'
    )

    ax1.set_ylim(-1.8, 1.8)

    ax1.axhline(
        0,
        color='gray',
        linestyle='--',
        linewidth=0.8,
        alpha=0.7
    )

    ax1.grid(
        True,
        linestyle=':',
        alpha=0.6
    )

    ax1.legend(loc="upper right")


    # Received signal

    ax2.plot(
        time_axis,
        rx_signal,
        color=color_rx,
        linewidth=1.5,
        label=f"RX Signal (Channel Noise: {noise_level.capitalize()})"
    )

    if errors == 0:
        status_text = "SUCCESSFUL"
    else:
        status_text = f"ERROR DETECTED ({errors} bits flipped)"

    ax2.set_title(
        f"2. Received Signal at Monitoring PC "
        f"[Status: {status_text} | BER: {ber:.2%} | "
        f"Recovered: {temp_recovered}°C]",
        fontsize=12,
        fontweight='bold',
        pad=10,
        color='#15803d' if errors == 0 else '#b91c1c'
    )

    ax2.set_xlabel(
        "Time (Bit Intervals / Tb)",
        fontsize=11,
        fontweight='bold'
    )

    ax2.set_ylabel(
        "Voltage (V)",
        fontsize=11,
        fontweight='bold'
    )

    ax2.set_ylim(-2.2, 2.2)

    ax2.axhline(
        0,
        color='gray',
        linestyle='--',
        linewidth=0.8,
        alpha=0.7
    )

    ax2.grid(
        True,
        linestyle=':',
        alpha=0.6
    )

    ax2.legend(loc="upper right")


    # Show bit values

    for ax in (ax1, ax2):

        for i, bit in enumerate(original_bits):

            ax.axvline(
                i,
                color='#94a3b8',
                linestyle='--',
                linewidth=1.0,
                alpha=0.8
            )

            ax.text(
                i + 0.5,
                1.45,
                f"b{i}={bit}",
                ha='center',
                va='center',
                fontsize=10,
                fontweight='bold',
                bbox=dict(
                    boxstyle="round,pad=0.2",
                    facecolor='#f1f5f9',
                    edgecolor='#cbd5e1'
                )
            )

        ax.axvline(
            n_bits,
            color='#94a3b8',
            linestyle='--',
            linewidth=1.0,
            alpha=0.8
        )

    plt.tight_layout()
    plt.show()


# Compare all three encoding methods

def plot_comparison(
    original_bits: str,
    temp_value: int,
    samples_per_bit: int = 100
):

    n_bits = len(original_bits)

    time_axis = np.linspace(
        0,
        n_bits,
        n_bits * samples_per_bit
    )

    sig_nrz = polar_nrz_encode(
        original_bits,
        samples_per_bit
    )

    sig_rz = polar_rz_encode(
        original_bits,
        samples_per_bit
    )

    sig_ami = bipolar_ami_encode(
        original_bits,
        samples_per_bit
    )

    fig, (ax1, ax2, ax3) = plt.subplots(
        3,
        1,
        figsize=(11, 8),
        sharex=True
    )

    fig.canvas.manager.set_window_title(
        "Line Encoding Comparison - "
        "Polar NRZ-L vs Polar RZ vs Bipolar AMI"
    )

    schemes = [
        (
            ax1,
            sig_nrz,
            "Polar NRZ-L (1 -> +1V, 0 -> -1V)",
            "#2563eb"
        ),
        (
            ax2,
            sig_rz,
            "Polar RZ (1 -> +1V then 0V, 0 -> -1V then 0V)",
            "#7c3aed"
        ),
        (
            ax3,
            sig_ami,
            "Bipolar AMI (0 -> 0V, 1 alternates +1V / -1V)",
            "#059669"
        )
    ]

    for ax, signal, title, color in schemes:

        ax.plot(
            time_axis,
            signal,
            color=color,
            linewidth=2.2
        )

        ax.set_title(
            title,
            fontsize=11,
            fontweight='bold'
        )

        ax.set_ylabel(
            "Voltage (V)",
            fontsize=10,
            fontweight='bold'
        )

        ax.set_ylim(-1.6, 1.6)

        ax.axhline(
            0,
            color='gray',
            linestyle='--',
            linewidth=0.8,
            alpha=0.7
        )

        ax.grid(
            True,
            linestyle=':',
            alpha=0.6
        )

        for i, bit in enumerate(original_bits):

            ax.axvline(
                i,
                color='#94a3b8',
                linestyle='--',
                linewidth=0.8,
                alpha=0.7
            )

            ax.text(
                i + 0.5,
                1.25,
                bit,
                ha='center',
                va='center',
                fontsize=10,
                fontweight='bold',
                bbox=dict(
                    boxstyle="circle,pad=0.2",
                    facecolor='#f8fafc',
                    edgecolor='#94a3b8'
                )
            )

        ax.axvline(
            n_bits,
            color='#94a3b8',
            linestyle='--',
            linewidth=0.8,
            alpha=0.7
        )

    ax3.set_xlabel(
        "Bit Position / Time (Tb)",
        fontsize=11,
        fontweight='bold'
    )

    plt.suptitle(
        f"Comparison of Line Encodings for Sensor Temp = "
        f"{temp_value}°C [Binary: {original_bits}]",
        fontsize=13,
        fontweight='bold'
    )

    plt.tight_layout()
    plt.show()


# Main simulation

def run_simulation():

    print("=" * 72)
    print("  INDUSTRIAL SENSOR DATA TRANSMISSION USING POLAR & BIPOLAR ENCODING")
    print("  Data Communication Project-Based Learning (PBL) Simulation")
    print("=" * 72)


    # Sensor value

    print("\n[STEP 1: INDUSTRIAL IOT SENSOR DATA ACQUISITION]")
    print("  Supported: Temperature (TEMP-01), Pressure (PRES-02), Humidity (HUM-03)")

    sensor_id = "TEMP-01"
    sensor_type = "TEMP"

    user_input = input(
        "Enter Sensor Temperature (°C) [Default: 25]: "
    ).strip()

    if not user_input:
        temp_original = 25

    else:

        try:
            temp_original = int(user_input)

        except ValueError:
            print("Invalid input. Using default temperature: 25°C")
            temp_original = 25

    sensor_packet = f"[{sensor_id}] | [{sensor_type}] | [{temp_original}°C]"
    print(f"  -> Sensor Packet Formed  : {sensor_packet}")


    # Convert to binary

    bit_stream = decimal_to_binary(
        temp_original,
        bit_width=8
    )

    print("\n[STEP 2: ANALOG-TO-DIGITAL / BINARY CONVERSION]")

    print(
        f"  -> Original Sensor Value : {temp_original}°C"
    )

    print(
        f"  -> 8-Bit Binary Sequence : {bit_stream}"
    )

    print(
        f"     Bit mapping: [MSB={bit_stream[0]} ... "
        f"LSB={bit_stream[-1]}]"
    )


    # Select encoding

    print("\n[STEP 3: LINE ENCODING TECHNIQUE SELECTION]")

    print("  1. Polar NRZ-L (Non-Return-to-Zero Level)")
    print("  2. Polar RZ    (Return-to-Zero)")
    print("  3. Bipolar AMI (Alternate Mark Inversion)")
    print("  4. Compare All 3 Encodings Simultaneously")

    enc_choice = input(
        "Select an option (1-4) [Default: 1]: "
    ).strip()

    if enc_choice == "2":
        scheme_name = "Polar RZ"

    elif enc_choice == "3":
        scheme_name = "Bipolar AMI"

    elif enc_choice == "4":
        scheme_name = "Compare All"

    else:
        scheme_name = "Polar NRZ-L"


    # Comparison mode

    if scheme_name == "Compare All":

        print(
            "\nOpening Comparison Plot for Polar NRZ-L, "
            "Polar RZ, and Bipolar AMI..."
        )

        plot_comparison(
            bit_stream,
            temp_original
        )

        print(
            "\nDemonstration complete! Returning to menu."
        )

        return


    # Generate signal

    print(
        f"\n[STEP 4: ENCODING WAVEFORM GENERATION ({scheme_name})]"
    )

    samples_per_bit = 100

    if scheme_name == "Polar NRZ-L":

        tx_signal = polar_nrz_encode(
            bit_stream,
            samples_per_bit
        )

    elif scheme_name == "Polar RZ":

        tx_signal = polar_rz_encode(
            bit_stream,
            samples_per_bit
        )

    else:

        tx_signal = bipolar_ami_encode(
            bit_stream,
            samples_per_bit
        )

    print(
        f"  -> Generated {len(tx_signal)} continuous "
        f"signal samples for {len(bit_stream)} bits."
    )


    # Channel noise

    print(
        "\n[STEP 5: COMMUNICATION CHANNEL NOISE SIMULATION]"
    )

    print(
        "  1. No Noise   (Ideal factory shielded twisted-pair cable)"
    )

    print(
        "  2. Low Noise  (Mild industrial EMI / thermal noise)"
    )

    print(
        "  3. High Noise (Severe heavy motor / welding equipment interference)"
    )

    noise_choice = input(
        "Select channel condition (1-3) [Default: 1]: "
    ).strip()

    if noise_choice == "2":
        noise_level = "low"

    elif noise_choice == "3":
        noise_level = "high"

    else:
        noise_level = "none"

    rx_signal = add_noise(
        tx_signal,
        noise_level=noise_level
    )

    print(
        f"  -> Signal transmitted through channel "
        f"with noise level: {noise_level.upper()}"
    )


    # Receive and decode

    print(
        "\n[STEP 6 & 7: RECEIVER SAMPLING, "
        "THRESHOLD DECISION & DECODING]"
    )

    rx_bits = decode_signal(
        rx_signal,
        scheme=scheme_name,
        bit_count=len(bit_stream),
        samples_per_bit=samples_per_bit
    )

    temp_recovered = binary_to_decimal(rx_bits)

    errors, ber = calculate_ber(
        bit_stream,
        rx_bits
    )


    # Results

    print("\n" + "=" * 50)
    print("           TRANSMISSION RESULTS SUMMARY")
    print("=" * 50)

    print(
        f"Original Sensor Value  : {temp_original}°C"
    )

    print(
        f"Transmitted Packet     : [{sensor_id}] | [{sensor_type}] | [{temp_original}°C]"
    )

    print(
        f"Original Binary Stream : {bit_stream}"
    )

    print(
        f"Received Binary Stream : {rx_bits}"
    )

    print(
        f"Recovered Packet       : [{sensor_id}] | [{sensor_type}] | [{temp_recovered}°C]"
    )

    print(
        f"Recovered Sensor Value : {temp_recovered}°C"
    )

    print(
        f"Encoding Technique     : {scheme_name}"
    )

    print(
        f"Channel Noise Level    : {noise_level.capitalize()}"
    )

    print(
        f"Bit Errors Detected    : {errors} / {len(bit_stream)} bits"
    )

    print(
        f"Bit Error Rate (BER)   : {ber:.2%}"
    )

    if errors == 0:

        print(
            "Transmission Status    : SUCCESSFUL "
            "(Data integrity preserved)"
        )

    else:

        print(
            "Transmission Status    : ERROR DETECTED "
            "(Signal corrupted by channel noise)"
        )

    print("=" * 50)


    # Show waveform

    print(
        "\n[STEP 8: DISPLAYING SIGNAL WAVEFORMS VIA MATPLOTLIB]"
    )

    print(
        "Close the Matplotlib graph window to finish or run again.\n"
    )

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

        repeat = input(
            "\nWould you like to run another simulation test? "
            "(y/n) [y]: "
        ).strip().lower()

        if repeat == 'n':

            print(
                "\nThank you for using the Line Encoding PBL Simulator. "
                "Good luck with your viva!\n"
            )

            break