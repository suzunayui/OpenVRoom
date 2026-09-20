# Locomotion animation credits

Author: **Quaternius** — Universal Animation Library, Standard edition.

- Original: https://quaternius.com/packs/universalanimationlibrary.html
- License: **CC0 1.0** (full text in `LICENSE-CC0.txt`).
- Download mirror: https://github.com/J-Ponzo/gltf-universal-animation-library
- Pinned mirror revision: `e24c23cf2a1323488a3faa226ea7ea21f644b73e`
- Source file: `glTF/AnimationLibrary_Godot_Standard.gltf` and its `.bin`.
- Included clips: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`.

`locomotion.json` is derived animation data, sampled at 30 Hz from the original
clips. It stores T-pose-relative world rotations for 52 humanoid joints and
in-place hip displacement. Source character geometry is not included.

Regenerate with `npm run generate:motions`. OpenVRoom retargets these data to
the loaded VRM at runtime, scales motion by hip height, and blends idle/walk/run.
The files are bundled locally; runtime does not contact the download server.
