---
name: operate-crazyflie-v6
description: Diagnose and operate this repository's Crazyflie 2.x with the custom CRTP v6 firmware. Use when an agent must fix connection, TOC, pm.vbat, stale logging, propeller, takeoff, hover, landing, or WSL2 Crazyradio issues under extension/simple_crazyflie.
---

# Operate the CRTP v6 Crazyflie

Work from `extension/simple_crazyflie`. Read its `README.md` section 0 before
hardware access. Use `run_crazyflie_v6.py`; do not recreate the obsolete
heredoc wrapper or edit installed `cflib`.

## Known configuration

- Environment: `drone-navigation`, cflib 0.1.32, WSL2.
- Default URI: `radio://0/80/2M/E7E7E7E7E7`.
- Crazyradio USB ID: `1915:7777`; Crazyflie MicroUSB ID: `0483:5740`.
- The firmware answers CRTP v6 TOCs but its platform handshake and memory
  enumeration are incompatible with current cflib.
- A logging reset breaks logging for the rest of that connection. The launcher
  fixes this with a short reset connection followed by a clean reconnect,
  cached Log/Param TOCs, and log-block cleanup on close.

## Safe workflow

1. Check for an existing controller in a separate command so `pgrep` does not
   match its own shell text:

   ```bash
   pgrep -af '04_flying.py|motion_control_ws.py'
   ```

2. Run `lsusb`. Require `1915:7777`. Before flight, reject `0483:5740` because
   the drone MicroUSB cable must be unplugged.
3. Read the battery without flight:

   ```bash
   cd extension/simple_crazyflie
   conda run --no-capture-output -n drone-navigation \
     python -u run_crazyflie_v6.py 01_connect.py
   ```

4. Require a measured battery voltage of at least 3.60 V. Missing or timed-out
   `pm.vbat` data is a failed safety gate, not permission to infer the voltage.
5. Only after the gate passes and the flight area is confirmed clear, run:

   ```bash
   conda run --no-capture-output -n drone-navigation \
     python -u run_crazyflie_v6.py 04_flying.py
   ```

   Expect arm, a 3-second ramp to 0.3 m, 5-second hover, 3-second landing, and
   `Motors off — drone disarmed.` Keep the process interactive so Ctrl+C can
   cut motors. Never run `03_propellers.py` as a harmless diagnostic: it spins
   motors and performs a low hover.

## Failure routing

- `NoBackendError` inside the sandbox while `lsusb` sees the radio: rerun the
  hardware command with approved out-of-sandbox USB access; do not install a
  second libusb.
- Scan finds `radio://0/80/2M` but `open_link()` hangs: confirm the launcher is
  used and both `cache/*.json` TOCs exist.
- `pm.vbat` times out: do not fly. Confirm the launcher printed
  `resetting stale log blocks`, then `TOCs ready`; rerun once. If it repeats,
  inspect log reset/create responses before changing code.
- `LOCKED supervisor state`: do not bypass it. Power-cycle the drone and inspect
  the propellers before retrying.
- Never flash firmware, bypass the 3.60 V gate, or arm without explicit user
  authorization.

## Change verification

After editing the launcher or flight scripts, run:

```bash
conda run -n drone-navigation python -m py_compile \
  extension/simple_crazyflie/run_crazyflie_v6.py \
  extension/simple_crazyflie/01_connect.py \
  extension/simple_crazyflie/04_flying.py
git diff --check
```

Then use `01_connect.py` as the required hardware check. Do not claim the
flight path works based only on compilation or radio scanning.
