"""
=============================================================================
Project Title:
Industrial Sensor Data Transmission using Polar and Bipolar Line Encoding

First Year Data Communication Course - Project Based Learning (PBL)
=============================================================================
Concept:
1. A factory temperature sensor measures temperature (e.g., 72°C).
2. The value is converted to binary (e.g., 72 -> 01001000).
3. The binary is converted to an electrical voltage signal using line encoding:
   - Polar NRZ (1 -> +1V, 0 -> -1V)
   - Polar RZ  (1 -> +1V half-bit then 0V, 0 -> -1V half-bit then 0V)
   - Bipolar AMI (0 -> 0V, 1 alternates between +1V and -1V)
4. Waveform is transmitted over a simple noisy channel.
5. Receiver samples the signal, decodes the bits, and recovers the temperature.
=============================================================================
"""

import matplotlib.pyplot as plt
import numpy as np


# ---------------------------------------------------------------------------
# Step 1: Convert Decimal Temperature to 8-Bit Binary
# ---------------------------------------------------------------------------
def decimal_to_binary(temp_val):
    # Clamped between 0 and 255 for an 8-bit byte
    temp_val = max(0, min(255, int(temp_val)))
    return format(temp_val, '08b')


# ---------------------------------------------------------------------------
# Step 2: Convert Binary String Back to Decimal Temperature
# ---------------------------------------------------------------------------
def binary_to_decimal(binary_str):
    return int(binary_str, 2)


# ---------------------------------------------------------------------------
# Step 3: Line Encoding Functions (Convert Bits -> Voltage Waveform)
# ---------------------------------------------------------------------------
# We use 100 points (samples) per bit so the graph looks smooth and clear.
SAMPLES_PER_BIT = 100


def encode_polar_nrz(bits):
    """
    Polar NRZ:
    Bit '1' -> +1 Volt (for full bit duration)
    Bit '0' -> -1 Volt (for full bit duration)
    """
    signal = []
    for bit in bits:
        voltage = 1.0 if bit == '1' else -1.0
        signal.extend([voltage] * SAMPLES_PER_BIT)
    return np.array(signal)


def encode_polar_rz(bits):
    """
    Polar RZ (Return to Zero):
    Bit '1' -> +1 Volt in 1st half, drops to 0 Volt in 2nd half
    Bit '0' -> -1 Volt in 1st half, drops to 0 Volt in 2nd half
    """
    signal = []
    half = SAMPLES_PER_BIT // 2
    for bit in bits:
        voltage = 1.0 if bit == '1' else -1.0
        signal.extend([voltage] * half)
        signal.extend([0.0] * (SAMPLES_PER_BIT - half))
    return np.array(signal)


def encode_bipolar_ami(bits):
    """
    Bipolar AMI (Alternate Mark Inversion):
    Bit '0' -> 0 Volt
    Bit '1' -> Alternates between +1 Volt and -1 Volt
    """
    signal = []
    last_mark_voltage = -1.0  # So first '1' becomes +1.0V

    for bit in bits:
        if bit == '1':
            last_mark_voltage = -last_mark_voltage  # Alternate sign
            v = last_mark_voltage
        else:
            v = 0.0
        signal.extend([v] * SAMPLES_PER_BIT)
    return np.array(signal)


# ---------------------------------------------------------------------------
# Step 4: Simulate Channel (Add optional noise)
# ---------------------------------------------------------------------------
def simulate_channel(tx_signal, add_noise=False):
    if not add_noise:
        return tx_signal.copy()
    
    # Add a small amount of random Gaussian noise (sigma = 0.35)
    noise = np.random.normal(loc=0.0, scale=0.35, size=len(tx_signal))
    return tx_signal + noise


# ---------------------------------------------------------------------------
# Step 5: Decode Received Signal Back into Binary Bits
# ---------------------------------------------------------------------------
def decode_signal(rx_signal, encoding_choice, num_bits):
    decoded_bits = []

    for i in range(num_bits):
        # Extract the samples for the i-th bit
        start = i * SAMPLES_PER_BIT
        end = (i + 1) * SAMPLES_PER_BIT
        bit_samples = rx_signal[start:end]

        if encoding_choice == '1':  # Polar NRZ
            # Sample around the center of the bit
            sample_value = np.mean(bit_samples[40:60])
            bit = '1' if sample_value > 0 else '0'

        elif encoding_choice == '2':  # Polar RZ
            # In RZ, the data is in the first half of the bit (15 to 35)
            sample_value = np.mean(bit_samples[15:35])
            bit = '1' if sample_value > 0 else '0'

        elif encoding_choice == '3':  # Bipolar AMI
            # In AMI, bit 0 is at 0V. Bit 1 is +1V or -1V.
            sample_value = np.mean(bit_samples[40:60])
            # If amplitude is larger than 0.5V, it's a '1', otherwise '0'
            bit = '1' if abs(sample_value) >= 0.5 else '0'

        decoded_bits.append(bit)

    return "".join(decoded_bits)


# ---------------------------------------------------------------------------
# Step 6: Plot Waveforms using Matplotlib
# ---------------------------------------------------------------------------
def plot_signals(original_bits, tx_signal, rx_signal, encoding_name, has_noise):
    num_bits = len(original_bits)
    total_samples = len(tx_signal)
    time_axis = np.linspace(0, num_bits, total_samples)

    # Create 2 subplots (Transmitted and Received)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 6), sharex=True)
    fig.canvas.manager.set_window_title(f"Line Encoding - {encoding_name}")

    # Plot 1: Transmitted Signal
    ax1.plot(time_axis, tx_signal, color='blue', linewidth=2, label="Transmitted Signal")
    ax1.set_title(f"Transmitted Signal ({encoding_name})", fontsize=12, fontweight='bold')
    ax1.set_ylabel("Voltage (V)")
    ax1.set_ylim(-1.8, 1.8)
    ax1.axhline(0, color='gray', linestyle='--', linewidth=0.8)
    ax1.grid(True, linestyle=':', alpha=0.6)
    ax1.legend(loc='upper right')

    # Plot 2: Received Signal
    rx_color = 'green' if not has_noise else 'red'
    ax2.plot(time_axis, rx_signal, color=rx_color, linewidth=1.5, label="Received Signal")
    noise_label = "With Channel Noise" if has_noise else "Clean (No Noise)"
    ax2.set_title(f"Received Signal ({noise_label})", fontsize=12, fontweight='bold')
    ax2.set_xlabel("Time (Bit Intervals)")
    ax2.set_ylabel("Voltage (V)")
    ax2.set_ylim(-2.2, 2.2)
    ax2.axhline(0, color='gray', linestyle='--', linewidth=0.8)
    ax2.grid(True, linestyle=':', alpha=0.6)
    ax2.legend(loc='upper right')

    # Add vertical dashed lines for bit boundaries and show bit text on top
    for ax in (ax1, ax2):
        for i, bit in enumerate(original_bits):
            # Vertical dashed boundary
            ax.axvline(i, color='gray', linestyle='--', linewidth=0.8, alpha=0.7)
            # Display bit number and value (e.g., "1" or "0") above waveform
            ax.text(i + 0.5, 1.35, f"b{i}={bit}", ha='center', va='center',
                    fontsize=10, fontweight='bold',
                    bbox=dict(boxstyle="round,pad=0.2", facecolor='#f0f0f0', edgecolor='#cccccc'))
        ax.axvline(num_bits, color='gray', linestyle='--', linewidth=0.8, alpha=0.7)

    plt.tight_layout()
    plt.show()


# ---------------------------------------------------------------------------
# Main Program Loop
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("   INDUSTRIAL SENSOR DATA TRANSMISSION")
    print("   Using Polar and Bipolar Line Encoding")
    print("   (Data Communication PBL Project)")
    print("=" * 60)

    # 1. Ask user for temperature input
    user_input = input("\nEnter Factory Sensor Temperature (°C) [Default 72]: ").strip()
    if user_input.isdigit():
        temperature = int(user_input)
    else:
        temperature = 72

    # 2. Convert to binary
    binary_data = decimal_to_binary(temperature)

    # 3. Select encoding
    print("\nSelect Line Encoding Scheme:")
    print("  1. Polar NRZ  (1 -> +1V, 0 -> -1V)")
    print("  2. Polar RZ   (1 -> +1V then 0V, 0 -> -1V then 0V)")
    print("  3. Bipolar AMI (0 -> 0V, 1 alternates between +1V and -1V)")
    choice = input("Enter choice (1/2/3) [Default 3]: ").strip()
    if choice not in ['1', '2', '3']:
        choice = '3'

    encoding_names = {
        '1': 'Polar NRZ',
        '2': 'Polar RZ',
        '3': 'Bipolar AMI'
    }
    selected_name = encoding_names[choice]

    # 4. Generate encoded waveform
    if choice == '1':
        tx_signal = encode_polar_nrz(binary_data)
    elif choice == '2':
        tx_signal = encode_polar_rz(binary_data)
    else:
        tx_signal = encode_bipolar_ami(binary_data)

    # 5. Channel Noise option
    noise_input = input("\nAdd Channel Noise to simulate real factory wire? (y/n) [Default n]: ").strip().lower()
    add_noise = (noise_input == 'y')

    # 6. Simulate transmission through channel
    rx_signal = simulate_channel(tx_signal, add_noise=add_noise)

    # 7. Decode signal back to binary
    received_binary = decode_signal(rx_signal, choice, len(binary_data))

    # 8. Convert binary back to temperature
    recovered_temp = binary_to_decimal(received_binary)

    # 9. Print results
    print("\n" + "-" * 45)
    print("             TRANSMISSION RESULTS")
    print("-" * 45)
    print(f"Original Temperature : {temperature}°C")
    print(f"Binary Data          : {binary_data}")
    print(f"Encoding             : {selected_name}")
    print(f"Received Data        : {received_binary}")
    print(f"Recovered Temperature: {recovered_temp}°C")

    if binary_data == received_binary:
        print("Result               : Data received successfully (No Errors)")
    else:
        # Count flipped bits
        errors = sum(1 for o, r in zip(binary_data, received_binary) if o != r)
        print(f"Result               : Noise caused {errors} bit error(s)!")
    print("-" * 45)

    # 10. Display Matplotlib graph
    print("\nDisplaying Matplotlib waveform window... (Close the graph to finish)")
    plot_signals(binary_data, tx_signal, rx_signal, selected_name, has_noise=add_noise)


if __name__ == "__main__":
    main()
