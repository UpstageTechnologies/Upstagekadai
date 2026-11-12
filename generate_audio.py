#!/usr/bin/env python3
import math
import struct
import wave
import os

OUT_DIR = os.path.expanduser("~/Desktop/Ramesh/Upstage_POS_Explainer_Project/Music")
os.makedirs(OUT_DIR, exist_ok=True)

SAMPLE_RATE = 44100

def create_soundtrack(duration_sec=75.0, filename="cinematic_tech_soundtrack.wav"):
    total_samples = int(duration_sec * SAMPLE_RATE)
    # Chord frequencies (Hz) for an inspiring, uplifting Apple-style progression:
    # 1. Cmaj9 (C3, G3, B3, D4, E4)
    # 2. Am9   (A2, E3, G3, B3, C4)
    # 3. Fmaj7 (F2, C3, E3, A3, C4)
    # 4. G6    (G2, D3, G3, B3, E4)
    chords = [
        [130.81, 196.00, 246.94, 293.66, 329.63],
        [110.00, 164.81, 196.00, 246.94, 261.63],
        [87.31,  130.81, 164.81, 220.00, 261.63],
        [98.00,  146.83, 196.00, 246.94, 329.63]
    ]
    chord_len = 5.0 # seconds per chord
    
    # Arpeggio note offsets
    arp_notes = [0, 1, 2, 3, 4, 3, 2, 1]
    arp_rate = 0.25 # seconds per note
    
    stereo_data = []
    
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        chord_idx = int((t / chord_len) % len(chords))
        current_chord = chords[chord_idx]
        
        # 1. Warm lush pad layer
        pad_sample = 0.0
        for f in current_chord:
            pad_sample += math.sin(2 * math.pi * f * t) * 0.15
            pad_sample += math.sin(2 * math.pi * (f * 1.003) * t) * 0.10 # subtle chorusing
            
        # 2. Deep sub bass
        root_f = current_chord[0] / 2.0
        bass_sample = math.sin(2 * math.pi * root_f * t) * 0.25
        # Soft tape saturation on bass
        bass_sample = math.tanh(bass_sample * 1.5) * 0.25
        
        # 3. Rhythmic tech pluck / mallet
        arp_step = int((t / arp_rate) % len(arp_notes))
        pluck_f = current_chord[arp_notes[arp_step]] * 2.0
        t_note = (t % arp_rate) / arp_rate
        decay = math.exp(-t_note * 8.0)
        pluck_sample = math.sin(2 * math.pi * pluck_f * t) * decay * 0.18
        
        # 4. Gentle pulse beat (subtle soft kick on beats)
        beat_t = (t % 0.5) / 0.5
        beat_decay = math.exp(-beat_t * 22.0)
        beat_sample = math.sin(2 * math.pi * 55.0 * (1.0 - beat_t * 0.5) * t) * beat_decay * 0.20
        
        # 5. Master volume envelope (fade in 2s, fade out last 3s)
        vol = 1.0
        if t < 2.0:
            vol = t / 2.0
        elif t > duration_sec - 3.0:
            vol = max(0.0, (duration_sec - t) / 3.0)
            
        # Mix L and R with subtle spatial width
        left = (pad_sample * 0.8 + bass_sample + pluck_sample * 0.9 + beat_sample) * vol * 0.55
        right = (pad_sample * 0.8 + bass_sample + pluck_sample * 0.7 + beat_sample) * vol * 0.55
        
        # Clamp & convert to 16-bit PCM
        l_int = max(-32767, min(32767, int(left * 32767)))
        r_int = max(-32767, min(32767, int(right * 32767)))
        stereo_data.append(struct.pack('<hh', l_int, r_int))
        
    out_path = os.path.join(OUT_DIR, filename)
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b''.join(stereo_data))
    print(f"🎵 Created soundtrack: {out_path} ({duration_sec}s)")
    return out_path

def create_whoosh(filename="whoosh_transition.wav", duration_sec=0.8):
    total_samples = int(duration_sec * SAMPLE_RATE)
    stereo_data = []
    import random
    
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        progress = t / duration_sec
        # Sweep frequency curve up then down
        center_f = 200.0 + 1600.0 * math.sin(progress * math.pi)
        env = math.sin(progress * math.pi) ** 2
        noise = (random.random() * 2.0 - 1.0)
        # Resonant sine sweep
        sine_sweep = math.sin(2 * math.pi * center_f * t)
        val = (noise * 0.4 + sine_sweep * 0.6) * env * 0.35
        # Stereo pan from left to right
        pan_l = math.cos(progress * math.pi * 0.5)
        pan_r = math.sin(progress * math.pi * 0.5)
        l_int = int(val * pan_l * 32767)
        r_int = int(val * pan_r * 32767)
        stereo_data.append(struct.pack('<hh', l_int, r_int))
        
    out_path = os.path.join(OUT_DIR, filename)
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b''.join(stereo_data))
    print(f"💨 Created whoosh: {out_path}")
    return out_path

def create_chime(filename="ui_chime.wav", duration_sec=1.2):
    total_samples = int(duration_sec * SAMPLE_RATE)
    stereo_data = []
    # Pristine glassy chime (E6, B6, E7 harmonic blend)
    freqs = [1318.51, 1975.53, 2637.02]
    
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        decay = math.exp(-t * 4.5)
        val = 0.0
        for f in freqs:
            val += math.sin(2 * math.pi * f * t) * (1.0 / len(freqs))
        val *= decay * 0.4
        sample_int = int(val * 32767)
        stereo_data.append(struct.pack('<hh', sample_int, sample_int))
        
    out_path = os.path.join(OUT_DIR, filename)
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b''.join(stereo_data))
    print(f"✨ Created chime: {out_path}")
    return out_path

if __name__ == "__main__":
    create_soundtrack(80.0, "UPSTAGE_Soundtrack_Long.wav")
    create_soundtrack(32.0, "UPSTAGE_Soundtrack_Short.wav")
    create_whoosh("whoosh.wav")
    create_chime("chime.wav")
