"""Trailer track for «Dos a Uno · Rusty Together»: 60 s, 120 BPM, fully synthesised.

Bouncy, playful chiptune-funk in C major (C · G · Am · F) with a break and a
final chorus. Pure numpy: python3 music.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
LEN = 60.0
N = int(SR * LEN)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def note_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=None):
    """ADSR of n samples; `hold` = gate length in seconds (default whole note)."""
    t = np.arange(n) / SR
    gate = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / max(a, 1e-6), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((t - gate) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)


def osc(kind, f, n, phase=0.0):
    t = np.arange(n) / SR
    ph = (f * t + phase) % 1.0
    if kind == 'sine':
        return np.sin(2 * np.pi * ph)
    if kind == 'tri':
        return 2 * np.abs(2 * ph - 1) - 1
    if kind == 'saw':
        return 2 * ph - 1
    if kind == 'square':
        return np.where(ph < 0.5, 1.0, -1.0)
    if kind == 'pulse':
        return np.where(ph < 0.25, 1.0, -1.0)
    raise ValueError(kind)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def add(sig, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * l
    R[i:i + len(sig)] += sig * r


# ------------------------------------------------------------------ instruments

def kick(at, g=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 28)
    ph = np.cumsum(f) / SR
    s = np.sin(2 * np.pi * ph) * np.exp(-t * 9)
    s += 0.3 * rng.standard_normal(n) * np.exp(-t * 120)
    add(s, at, 0, 0.62 * g)


def snare(at, g=1.0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 1500)
    s = noise * np.exp(-t * 18) * 0.7 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.6
    add(s, at, 0.05, 0.55 * g)


def clap(at, g=1.0):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 1200)
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        e += (t >= off) * np.exp(-(t - off).clip(0) * (60 if k < 2 else 14))
    add(noise * e * 0.5, at, -0.1, 0.5 * g)


def hat(at, g=1.0, open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 7000)
    s = noise * np.exp(-t * (14 if open_ else 70))
    add(s, at, 0.3, 0.22 * g)


def bass(at, midi, dur, g=1.0):
    n = int((dur + 0.05) * SR)
    f = note_hz(midi)
    s = 0.6 * osc('square', f, n) + 0.5 * osc('sine', f / 2, n)
    s = lowpass(s, 900)
    add(s * env(n, 0.004, 0.08, 0.7, 0.05, hold=dur * 0.9), at, 0, 0.42 * g)


def pluck(at, midi, dur=0.18, g=1.0, pan=0.0):
    n = int((dur + 0.2) * SR)
    f = note_hz(midi)
    s = osc('pulse', f, n) * 0.5 + osc('tri', f * 2, n) * 0.3
    s = lowpass(s, 3200)
    add(s * env(n, 0.002, 0.12, 0.25, 0.12, hold=dur), at, pan, 0.22 * g)


def lead(at, midi, dur, g=1.0, pan=0.0):
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    f = note_hz(midi) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * (t > 0.12))
    ph = np.cumsum(f) / SR
    s = np.where(ph % 1 < 0.5, 1.0, -1.0) * 0.45 + np.sin(2 * np.pi * ph) * 0.5
    s = lowpass(s, 4200)
    add(s * env(n, 0.006, 0.08, 0.7, 0.1, hold=dur), at, pan, 0.2 * g)


def pad(at, notes, dur, g=1.0):
    n = int((dur + 0.6) * SR)
    s = np.zeros(n)
    for k, m in enumerate(notes):
        f = note_hz(m)
        s += osc('saw', f * 1.003, n, 0.1 * k) + osc('saw', f * 0.997, n, 0.37 * k)
    s = lowpass(s / len(notes), 1400)
    e = env(n, 0.25, 0.3, 0.8, 0.5, hold=dur)
    add(s * e, at, -0.25, 0.10 * g)
    add(s * e, at + 0.012, 0.25, 0.10 * g)


def riser(at, dur, g=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 600)
    s = hp * (t / dur) ** 2
    f = 200 + 1400 * (t / dur) ** 2
    s += 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / dur)
    add(s, at, 0, 0.25 * g)


def boing(at, g=1.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 140 + 400 * (1 - np.exp(-t * 8)) + 60 * np.sin(2 * np.pi * 22 * t) * np.exp(-t * 4)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    add(s, at, 0, 0.35 * g)


def crash(at, g=1.0):
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 4000)
    add(noise * np.exp(-t * 2.2), at, -0.2, 0.22 * g)
    add(noise[::-1][:n] * np.exp(-t * 2.4), at, 0.2, 0.18 * g)


def impact(at, g=1.0):
    kick(at, 1.4 * g)
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * (40 + 30 * np.exp(-t * 6)) * t) * np.exp(-t * 3)
    add(s, at, 0, 0.6 * g)
    crash(at, g)


# ------------------------------------------------------------------ score

C, G, Am, F = 0, 1, 2, 3
CHORDS = {
    C: ([60, 64, 67], 36),
    G: ([59, 62, 67], 43),
    Am: ([57, 60, 64], 45),
    F: ([57, 60, 65], 41),
}
PROG = [C, G, Am, F]

# Hook melody (2 bars = 8 beats; (beat, midi, length in beats)).
HOOK_A = [(0, 72, 0.5), (0.5, 74, 0.5), (1, 76, 1), (2, 79, 0.5), (2.5, 76, 0.5), (3, 74, 1),
          (4, 72, 0.5), (4.5, 74, 0.5), (5, 76, 0.5), (5.5, 79, 0.5), (6, 81, 1.5)]
HOOK_B = [(0, 81, 0.5), (0.5, 79, 0.5), (1, 76, 1), (2, 77, 0.5), (2.5, 76, 0.5), (3, 74, 1),
          (4, 72, 0.5), (4.5, 76, 0.5), (5, 74, 0.5), (5.5, 71, 0.5), (6, 72, 1.5)]


def drums(bar, kind):
    t0 = bar * BAR
    for b in range(4):
        tb = t0 + b * BEAT
        if kind in ('full', 'groove'):
            kick(tb)
            if b in (1, 3):
                snare(tb)
                if kind == 'full':
                    clap(tb, 0.8)
            for h in range(2):
                hat(tb + h * BEAT / 2, 1.0 if h else 0.6, open_=(h == 1 and kind == 'full' and b == 3))
            if kind == 'full':
                hat(tb + BEAT * 0.75, 0.5)
        elif kind == 'light':
            if b in (0, 2):
                kick(tb, 0.8)
            hat(tb + BEAT / 2, 0.7)


def chords(bar, chord, style):
    t0 = bar * BAR
    notes, root = CHORDS[chord]
    if style >= 1:
        pad(t0, notes, BAR, 0.9)
    if style >= 2:
        # Bouncy octave bass: root on the beat, octave on the off-beat.
        for b in range(4):
            bass(t0 + b * BEAT, root, BEAT * 0.45)
            bass(t0 + b * BEAT + BEAT / 2, root + 12, BEAT * 0.3, 0.8)
    if style >= 1:
        # Arp plucks on 16ths, panned around.
        arp = notes + [notes[0] + 12, notes[1] + 12]
        for k in range(16 if style >= 2 else 8):
            step = BEAT / 4 if style >= 2 else BEAT / 2
            pluck(t0 + k * step, arp[k % len(arp)] + 12, 0.1, 0.7, pan=np.sin(k * 0.9) * 0.6)


def melody(bar2, hook, octave=0, g=1.0):
    t0 = bar2 * BAR
    for beat, m, ln in hook:
        lead(t0 + beat * BEAT, m + octave, ln * BEAT * 0.92, g, pan=0.1)


# Intro (bars 0-1): pad + light arp, riser into bar 2.
for bar in range(2):
    chords(bar, PROG[bar % 4], 1)
riser(BAR * 1, BAR)
boing(BAR * 2 - 0.3, 0.8)

# Verse A (bars 2-9, 4 s – 20 s).
for bar in range(2, 10):
    chords(bar, PROG[bar % 4], 2)
    drums(bar, 'groove')
for k in range(2, 10, 2):
    melody(k, HOOK_A if (k // 2) % 2 else HOOK_B)
impact(BAR * 2)

# Chorus B (bars 10-17, 20 s – 36 s): fuller drums, hook an octave up on the second half.
for bar in range(10, 18):
    chords(bar, PROG[bar % 4], 2)
    drums(bar, 'full')
for k in range(10, 18, 2):
    melody(k, HOOK_A if (k // 2) % 2 else HOOK_B, 12 if k >= 14 else 0, 0.9)
crash(BAR * 10)

# Break (bars 18-19, 36 s – 40 s): drums out, pads + boings, riser.
for bar in range(18, 20):
    chords(bar, PROG[bar % 4], 1)
    drums(bar, 'light')
for k in range(4):
    boing(BAR * 18 + k * BEAT * 2 + BEAT, 0.6)
riser(BAR * 19, BAR)

# Final chorus (bars 20-27, 40 s – 56 s).
for bar in range(20, 28):
    chords(bar, PROG[bar % 4], 2)
    drums(bar, 'full')
for k in range(20, 28, 2):
    melody(k, HOOK_A if (k // 2) % 2 else HOOK_B, 12, 0.85)
    melody(k, HOOK_A if (k // 2) % 2 else HOOK_B, 0, 0.45)
impact(BAR * 20)

# Outro (bars 28-29, 56 s – 60 s): final hit and ring out.
impact(BAR * 28)
pad(BAR * 28, [48, 60, 64, 67, 72], BAR * 1.6, 1.6)
lead(BAR * 28, 84, BAR * 1.2, 0.8)
for k, m in enumerate([72, 76, 79, 84, 88]):
    pluck(BAR * 28 + k * 0.08, m, 0.4, 0.8, pan=(k - 2) * 0.3)

# ------------------------------------------------------------------ mix

def reverb(x, seconds=1.6, mix=0.18):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 4.2)
    ir[0] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    y /= np.max(np.abs(y)) + 1e-9
    return x + y * mix * np.max(np.abs(x))


L = reverb(L)
R = reverb(R)
# Fade the very end, soft-clip and normalise.
fade = np.ones(N)
fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR)) ** 2
L *= fade
R *= fade
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L = np.tanh(L / peak * 1.3) / np.tanh(1.3)
R = np.tanh(R / peak * 1.3) / np.tanh(1.3)
out = np.stack([L, R], axis=1) * 0.92
pcm = (out * 32767).astype(np.int16)

path = sys.argv[1] if len(sys.argv) > 1 else 'trailer-music.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', path)
